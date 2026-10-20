import { resolveOutcome, OUTCOME_VERSION, type AnalysisResult, type Candle } from "@tradingworld/analysis-engine";
import { TIMEFRAME_SECONDS, findInstrument, isTimeframe, zoneTrackKey, type Timeframe } from "@tradingworld/shared";
import type { ProviderRegistry } from "../providers/registry.js";
import type { Repositories, TrackedZone, ZoneQuery } from "../repositories/memory.js";
import { describeError } from "../providers/support/status.js";

export interface OutcomeOptions {
  /** closed bars after detection before a zone that was not invalidated is labelled */
  horizonBars: number;
  intervalSeconds: number;
  /** open zones processed per run */
  batch: number;
  /** "SYMBOL:TF" pairs analysed every run, so the dataset grows without anyone watching the chart */
  scan: { symbol: string; timeframe: Timeframe }[];
  now?: () => number;
  log?: (m: string) => void;
}

export interface OutcomeRun {
  at: number;
  scanned: number;
  checked: number;
  resolved: number;
  failed: number;
  error?: string;
  ms: number;
}

export interface Bucket {
  n: number;
  reacted: number;
  invalidated: number;
  tested: number;
  untouched: number;
  reactionRate: number;
  avgMfeAtr?: number;
  avgMaeAtr?: number;
}

export interface OutcomeStats {
  outcomeVersion: string;
  horizonBars: number;
  includeDemo: boolean;
  open: number;
  resolved: number;
  overall: Bucket;
  byQuality: Record<string, Bucket>;
  byOrigin: Record<string, Bucket>;
  bySession: Record<string, Bucket>;
  byTimeframe: Record<string, Bucket>;
  byScoreBand: Record<string, Bucket>;
  recent: {
    key: string;
    symbol: string;
    timeframe: string;
    name: string;
    nameAr: string;
    quality: string;
    score: number;
    provider: string;
    label: string;
    reason: string;
    barsToOutcome: number;
    mfeAtr: number;
    resolvedAt: number;
  }[];
}

/** One ZoneSample per resolved zone — the exact shape services/ml expects in POST /train. */
export interface DatasetSample {
  zone: TrackedZone["zone"];
  regime: TrackedZone["context"]["regime"];
  session: string;
  outcome: NonNullable<TrackedZone["outcome"]> & { key: string; provider: string };
}

/** "XAUUSD:15m,EURUSD:1h" → pairs; unknown symbols or timeframes are dropped. */
export function parseScan(spec: string | undefined): { symbol: string; timeframe: Timeframe }[] {
  return (spec ?? "")
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => {
      const [s = "", tf = ""] = p.split(":");
      return { symbol: s.toUpperCase(), timeframe: tf as Timeframe };
    })
    .filter((p) => findInstrument(p.symbol) && isTimeframe(p.timeframe));
}

/** Stable identity of a market zone across analysis windows (engine ids are window-local). */
export function zoneKey(
  r: Pick<AnalysisResult, "symbol" | "timeframe" | "engineVersion" | "scoringVersion">,
  z: AnalysisResult["zones"][number],
): string {
  return zoneTrackKey(r, z); // shared with the browser (feedback) — packages/shared/src/research.ts
}

const scoreBand = (s: number) => (s >= 80 ? "80-100" : s >= 65 ? "65-79" : s >= 50 ? "50-64" : "0-49");

function bucket(zs: TrackedZone[]): Bucket {
  const out = zs.map((z) => z.outcome!).filter(Boolean);
  const touched = out.filter((o) => o.label !== "UNTOUCHED");
  const count = (l: string) => out.filter((o) => o.label === l).length;
  const avg = (f: (o: (typeof out)[number]) => number) =>
    touched.length ? Math.round((touched.reduce((s, o) => s + f(o), 0) / touched.length) * 100) / 100 : undefined;
  return {
    n: out.length,
    reacted: count("REACTED"),
    invalidated: count("INVALIDATED"),
    tested: count("TESTED"),
    untouched: count("UNTOUCHED"),
    reactionRate: out.length ? Math.round((count("REACTED") / out.length) * 1000) / 1000 : 0,
    avgMfeAtr: avg((o) => o.mfeAtr),
    avgMaeAtr: avg((o) => o.maeAtr),
  };
}

function groupBy(zs: TrackedZone[], f: (z: TrackedZone) => string): Record<string, Bucket> {
  const g: Record<string, TrackedZone[]> = {};
  for (const z of zs) (g[f(z)] ??= []).push(z);
  return Object.fromEntries(
    Object.entries(g)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => [k, bucket(v)]),
  );
}

/**
 * AI-01 — the outcome tracker.
 * observe(): every analysis result registers its zones once, at FIRST observation, with the market context of that moment.
 * run(): for each open zone, take the closed candles strictly after the detection bar and label it with the engine's
 *        resolveOutcome (OUTCOME_VERSION) once it is invalidated or `horizonBars` have closed. Labels are reaction-based,
 *        never profit. The resolved set feeds the research sheet and the ML dataset (GET /admin/research/dataset).
 */
export class OutcomeService {
  readonly opts: OutcomeOptions;
  private seen = new Set<string>();
  private timer?: NodeJS.Timeout;
  private running = false;
  private runs: OutcomeRun[] = [];
  private readonly now: () => number;
  private readonly log: (m: string) => void;
  /** set by the app: runs an analysis for the scan list (avoids a circular import with AnalysisService) */
  analyze?: (symbol: string, timeframe: Timeframe) => Promise<unknown>;

  constructor(
    private readonly repos: Repositories,
    private readonly providers: ProviderRegistry,
    opts: Partial<OutcomeOptions> = {},
  ) {
    this.opts = { horizonBars: 120, intervalSeconds: 300, batch: 2000, scan: [], ...opts };
    this.now = opts.now ?? Date.now;
    this.log = opts.log ?? (() => {});
  }

  /** Register the zones of one analysis. Invalidated zones are history, not candidates. Returns how many were new. */
  async observe(r: AnalysisResult, provider: string): Promise<number> {
    let added = 0;
    for (const z of r.zones) {
      if (z.status === "INVALIDATED") continue;
      const key = zoneKey(r, z);
      if (this.seen.has(key)) continue;
      const isNew = await this.repos.zones.track({
        key,
        symbol: r.symbol,
        timeframe: r.timeframe,
        engineVersion: r.engineVersion,
        scoringVersion: r.scoringVersion,
        provider,
        zone: z,
        atr: r.base.atr,
        context: { regime: r.base.regime, session: r.session.current, htfBias: r.htfBias },
        detectedBarTime: r.lastCandleTime,
        detectedAt: this.now(),
      });
      this.seen.add(key);
      if (this.seen.size > 100_000) this.seen.clear();
      if (isNew) added++;
    }
    return added;
  }

  start(initialDelayMs = 10_000): void {
    if (this.timer) return;
    setTimeout(() => void this.run(), initialDelayMs).unref?.();
    this.timer = setInterval(() => void this.run(), this.opts.intervalSeconds * 1000);
    this.timer.unref?.();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }

  /** One pass: analyse the scan list, then label every open zone that has become decidable. */
  async run(): Promise<OutcomeRun> {
    const started = this.now();
    const run: OutcomeRun = { at: started, scanned: 0, checked: 0, resolved: 0, failed: 0, ms: 0 };
    if (this.running) return { ...run, error: "already running" };
    this.running = true;
    try {
      for (const p of this.opts.scan) {
        try {
          await this.analyze?.(p.symbol, p.timeframe);
          run.scanned++;
        } catch (e) {
          this.log(`scan ${p.symbol} ${p.timeframe}: ${describeError(e)}`);
        }
      }
      const open = await this.repos.zones.open(this.opts.batch);
      const groups = new Map<string, TrackedZone[]>();
      for (const z of open) {
        const k = `${z.symbol}:${z.timeframe}`;
        (groups.get(k) ?? groups.set(k, []).get(k)!).push(z);
      }
      for (const zs of groups.values()) {
        // a failed fetch fails the group; per-zone errors are counted inside resolveGroup
        try {
          await this.resolveGroup(zs, run);
        } catch (e) {
          run.failed += zs.length;
          this.log(`resolve ${zs[0]!.symbol} ${zs[0]!.timeframe}: ${describeError(e)}`);
        }
      }
    } catch (e) {
      run.error = describeError(e);
    } finally {
      this.running = false;
      run.ms = this.now() - started;
      this.runs.push(run);
      if (this.runs.length > 50) this.runs.shift();
    }
    if (run.resolved || run.failed) this.log(`outcomes: ${run.resolved} resolved, ${run.failed} failed, ${run.checked} checked`);
    return run;
  }

  private async resolveGroup(zs: TrackedZone[], run: OutcomeRun): Promise<void> {
    const instrument = findInstrument(zs[0]!.symbol);
    const tf = zs[0]!.timeframe as Timeframe;
    if (!instrument || !isTimeframe(tf)) return;
    const step = TIMEFRAME_SECONDS[tf];
    const nowSec = Math.floor(this.now() / 1000);
    const provider = this.providers.for(instrument);
    const earliest = Math.min(...zs.map((z) => z.detectedBarTime));
    const need = Math.ceil((nowSec - earliest) / step) + 2;
    // one request covers the group while it fits in a page; older zones get their own window below
    const recent = need <= 5000 ? await provider.getCandles(instrument, tf, Math.max(need, 50)) : [];
    for (const z of zs) {
      run.checked++;
      try {
        let candles: Candle[] = recent;
        if (!recent.length || recent[0]!.time > z.detectedBarTime + step) {
          candles = await provider.getCandles(
            instrument,
            tf,
            this.opts.horizonBars + 2,
            z.detectedBarTime + (this.opts.horizonBars + 2) * step,
          );
        }
        // strictly after the detection bar, and only bars whose bucket has closed
        const future = candles.filter((c) => c.time > z.detectedBarTime && c.time + step <= nowSec);
        if (!future.length) continue;
        const r = resolveOutcome(z.zone, future, z.atr, this.opts.horizonBars);
        if (!r.done) continue;
        await this.repos.zones.resolve(z.key, {
          outcomeVersion: OUTCOME_VERSION,
          label: r.label,
          reason: r.reason!,
          finalStatus: r.finalStatus,
          mfeAtr: round(r.mfeAtr),
          maeAtr: round(r.maeAtr),
          reactionAtr: round(r.reactionAtr),
          barsToOutcome: r.barsToOutcome,
          barsObserved: r.barsObserved,
          horizonBars: this.opts.horizonBars,
          retests: r.retests,
          resolvedAt: this.now(),
        });
        run.resolved++;
      } catch (e) {
        // one bad zone must not stall the rest of its group
        run.failed++;
        this.log(`resolve ${z.key}: ${describeError(e)}`);
      }
    }
  }

  async stats(includeDemo = false, limit = 20_000): Promise<OutcomeStats> {
    const q: ZoneQuery = { includeDemo };
    const [open, resolvedZones] = await Promise.all([
      this.repos.zones.count({ ...q, resolved: false }),
      this.repos.zones.list({ ...q, resolved: true, limit }),
    ]);
    return {
      outcomeVersion: OUTCOME_VERSION,
      horizonBars: this.opts.horizonBars,
      includeDemo,
      open,
      resolved: resolvedZones.length,
      overall: bucket(resolvedZones),
      byQuality: groupBy(resolvedZones, (z) => z.zone.quality),
      byOrigin: groupBy(resolvedZones, (z) => z.zone.origin),
      bySession: groupBy(resolvedZones, (z) => z.context.session),
      byTimeframe: groupBy(resolvedZones, (z) => z.timeframe),
      byScoreBand: groupBy(resolvedZones, (z) => scoreBand(z.zone.score)),
      recent: [...resolvedZones]
        .sort((a, b) => b.outcome!.resolvedAt - a.outcome!.resolvedAt)
        .slice(0, 30)
        .map((z) => ({
          key: z.key,
          symbol: z.symbol,
          timeframe: z.timeframe,
          name: z.zone.name,
          nameAr: z.zone.nameAr,
          quality: z.zone.quality,
          score: z.zone.score,
          provider: z.provider,
          label: z.outcome!.label,
          reason: z.outcome!.reason,
          barsToOutcome: z.outcome!.barsToOutcome,
          mfeAtr: z.outcome!.mfeAtr,
          resolvedAt: z.outcome!.resolvedAt,
        })),
    };
  }

  /** Resolved zones as ML samples. Demo data is excluded unless asked for: synthetic prices must never train a model. */
  async dataset(q: { engineVersion?: string; scoringVersion?: string; includeDemo?: boolean; limit?: number }): Promise<DatasetSample[]> {
    const zs = await this.repos.zones.list({ ...q, resolved: true, limit: q.limit ?? 50_000 });
    return zs.reverse().map((z) => ({
      zone: z.zone,
      regime: z.context.regime,
      session: z.context.session,
      outcome: { ...z.outcome!, key: z.key, provider: z.provider },
    }));
  }

  status() {
    return {
      running: this.running,
      started: !!this.timer,
      horizonBars: this.opts.horizonBars,
      intervalSeconds: this.opts.intervalSeconds,
      scan: this.opts.scan.map((p) => `${p.symbol}:${p.timeframe}`),
      runs: [...this.runs].reverse().slice(0, 10),
    };
  }
}

const round = (n: number) => Math.round(n * 1000) / 1000;
