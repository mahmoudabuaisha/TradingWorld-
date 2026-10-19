import { aggregate, bucketStart, canAggregate, type Candle } from "@tradingworld/analysis-engine";
import { DEFAULT_INSTRUMENTS, TIMEFRAMES, TIMEFRAME_SECONDS, findInstrument, type Instrument, type Timeframe } from "@tradingworld/shared";
import type { ProviderRegistry } from "../providers/registry.js";
import type { CandleStore } from "../store/candleStore.js";
import { findGaps } from "../store/gaps.js";
import { describeError } from "../providers/support/status.js";

export interface BackfillOptions {
  /** the series pulled from providers; every higher timeframe is derived from it locally */
  baseTimeframe: Timeframe;
  /** bars of base history to keep per instrument */
  bars: number;
  /** bars per provider request */
  pageSize: number;
  /** also fill demo-served instruments (local testing) */
  includeDemo: boolean;
  /** restrict to these symbols */
  symbols?: string[];
  /** cadence of catch-up + gap repair */
  intervalMinutes: number;
  /** cadence of re-aggregating the current buckets */
  aggregateSeconds: number;
  /** most gaps repaired per run (each costs one provider request) */
  maxGapsPerRun: number;
  now?: () => number;
  log?: (msg: string) => void;
}

export type RunKind = "backfill" | "catchup" | "gaps" | "aggregate";

export interface BackfillRun {
  symbol: string;
  timeframe: Timeframe;
  kind: RunKind;
  from?: number;
  to?: number;
  bars: number;
  status: "running" | "done" | "failed";
  error?: string;
  startedAt: number;
  finishedAt?: number;
}

export interface BackfillStatus {
  running: boolean;
  started: boolean;
  baseTimeframe: Timeframe;
  bars: number;
  symbols: string[];
  lastRunAt?: number;
  nextRunAt?: number;
  runs: BackfillRun[];
}

const DEFAULTS: BackfillOptions = { baseTimeframe: "1m", bars: 20_000, pageSize: 5000, includeDemo: false, intervalMinutes: 15, aggregateSeconds: 60, maxGapsPerRun: 20 };

/** Timeframes derived locally from `base` (all coarser ones; week and month use calendar buckets). */
export function derivedTargets(base: Timeframe): Timeframe[] {
  return TIMEFRAMES.filter((t) => canAggregate(base, t));
}

interface RunLogger { logRun(run: BackfillRun): Promise<void> }
const hasRunLog = (s: unknown): s is RunLogger => typeof (s as RunLogger)?.logRun === "function";

/**
 * DATA-02 — keeps the candle store complete and current:
 * - backfill: page history backwards (`to` cursor) until `bars` of the base timeframe are stored
 * - catch-up: pull everything since the last stored bar (restart after an outage)
 * - gap repair: find missing open-market buckets inside the series and fetch exactly those
 * - aggregation: derive every higher timeframe from the base series with the engine's own bucketing,
 *   so charts and analysis read HTF series from the store instead of spending provider credits
 * Provider calls always pass `to`, which bypasses the live cache; every request goes through the provider's budget.
 */
export class BackfillService {
  readonly opts: BackfillOptions;
  private runs: BackfillRun[] = [];
  private timers: NodeJS.Timeout[] = [];
  private running = false;
  private started = false;
  private lastRunAt?: number;
  private nextRunAt?: number;
  private readonly now: () => number;
  private readonly log: (msg: string) => void;

  constructor(private readonly registry: ProviderRegistry, readonly store: CandleStore, opts: Partial<BackfillOptions> = {}) {
    this.opts = { ...DEFAULTS, ...opts };
    this.now = opts.now ?? Date.now;
    this.log = opts.log ?? (() => {});
  }

  /** Instruments the job maintains: routed to a real source (demo too when asked), optionally filtered. */
  instruments(): Instrument[] {
    return DEFAULT_INSTRUMENTS.filter((i) => (!this.opts.symbols || this.opts.symbols.includes(i.symbol)) && (this.opts.includeDemo || this.registry.for(i).id !== "demo"));
  }

  status(): BackfillStatus {
    return { running: this.running, started: this.started, baseTimeframe: this.opts.baseTimeframe, bars: this.opts.bars, symbols: this.instruments().map((i) => i.symbol), lastRunAt: this.lastRunAt, nextRunAt: this.nextRunAt, runs: this.runs.slice(-50).reverse() };
  }

  start(initialDelayMs = 3000): void {
    if (this.started) return;
    this.started = true;
    this.nextRunAt = this.now() + initialDelayMs;
    this.timers.push(setTimeout(() => void this.runOnce(), initialDelayMs));
    this.timers.push(setInterval(() => void this.runOnce(), this.opts.intervalMinutes * 60_000));
    this.timers.push(setInterval(() => void this.aggregateRecentAll(), this.opts.aggregateSeconds * 1000));
  }

  stop(): void {
    for (const t of this.timers) clearTimeout(t);
    this.timers = [];
    this.started = false;
  }

  /** One maintenance cycle over every instrument: catch-up → gap repair → aggregation. */
  async runOnce(): Promise<BackfillRun[]> {
    if (this.running) return [];
    this.running = true;
    const done: BackfillRun[] = [];
    try {
      for (const i of this.instruments()) {
        try {
          const range = await this.store.range(i.symbol, this.opts.baseTimeframe);
          const first = range ? await this.catchUp(i.symbol) : await this.backfill(i.symbol);
          done.push(first);
          const gaps = await this.repairGaps(i.symbol);
          done.push(gaps);
          // fresh history → derive everything; new bars since the last run → only the buckets they touch; else just the current ones
          const touched = [first, gaps].filter((r) => r.bars > 0 && r.from !== undefined).map((r) => r.from!);
          const scope = !range ? "full" : touched.length ? { since: Math.min(...touched) } : "recent";
          done.push(await this.aggregateDerived(i.symbol, scope));
        } catch (e) {
          this.log(`backfill ${i.symbol}: ${describeError(e)}`);
        }
      }
    } finally {
      this.running = false;
      this.lastRunAt = this.now();
      this.nextRunAt = this.lastRunAt + this.opts.intervalMinutes * 60_000;
    }
    return done;
  }

  /** Pull history backwards until `bars` bars of `tf` are stored. */
  async backfill(symbol: string, tf: Timeframe = this.opts.baseTimeframe, bars = this.opts.bars): Promise<BackfillRun> {
    const i = this.instrument(symbol);
    return this.record({ symbol, timeframe: tf, kind: "backfill" }, async (run) => {
      const range = await this.store.range(symbol, tf);
      const remaining = Math.max(0, bars - (range?.count ?? 0));
      if (!remaining) return 0;
      const step = TIMEFRAME_SECONDS[tf];
      const to = range ? range.first : Math.floor(this.now() / 1000) + step;
      const { written, from } = await this.pullBackward(i, tf, to, remaining);
      run.from = from; run.to = to;
      return written;
    });
  }

  /** Everything since the last stored bar (plus one to re-close it). Falls back to a backfill on an empty series. */
  async catchUp(symbol: string, tf: Timeframe = this.opts.baseTimeframe): Promise<BackfillRun> {
    const i = this.instrument(symbol);
    const range = await this.store.range(symbol, tf);
    if (!range) return this.backfill(symbol, tf);
    return this.record({ symbol, timeframe: tf, kind: "catchup", from: range.last }, async (run) => {
      const step = TIMEFRAME_SECONDS[tf];
      const nowSec = Math.floor(this.now() / 1000);
      const missing = Math.ceil((nowSec - range.last) / step);
      if (missing <= 0) return 0;
      const to = nowSec + step;
      run.to = to;
      const { written } = await this.pullBackward(i, tf, to, missing + 1, range.last);
      return written;
    });
  }

  /** Find missing open-market buckets inside the stored series and fetch exactly those ranges. */
  async repairGaps(symbol: string, tf: Timeframe = this.opts.baseTimeframe): Promise<BackfillRun> {
    const i = this.instrument(symbol);
    return this.record({ symbol, timeframe: tf, kind: "gaps" }, async (run) => {
      const range = await this.store.range(symbol, tf);
      if (!range) return 0;
      const candles = await this.store.readRange(symbol, tf, range.first, range.last + 1);
      const gaps = findGaps(candles, tf, i, { maxGaps: this.opts.maxGapsPerRun });
      if (!gaps.length) return 0;
      const provider = this.registry.for(i);
      const step = TIMEFRAME_SECONDS[tf];
      let written = 0;
      run.from = gaps[0]!.from; run.to = gaps[gaps.length - 1]!.to;
      for (const g of gaps) {
        const page = await provider.getCandles(i, tf, Math.min(this.opts.pageSize, g.bars + 2), g.to + step);
        written += await this.store.upsert(symbol, tf, page.filter((c) => c.time >= g.from && c.time <= g.to), provider.id);
      }
      this.log(`gaps ${symbol} ${tf}: ${gaps.length} gap(s), ${written} bars`);
      return written;
    });
  }

  /**
   * Derive every higher timeframe from the base series. "full" rebuilds the whole history; "recent" only the
   * previous and current bucket of each target (cheap enough to run every minute); `{ since }` every bucket
   * from that time on (after a catch-up or gap repair).
   */
  async aggregateDerived(symbol: string, scope: "full" | "recent" | { since: number } = "recent"): Promise<BackfillRun> {
    const base = this.opts.baseTimeframe;
    // the minute-cadence "recent" pass is routine housekeeping: kept in the in-memory status, not in the run table
    return this.record({ symbol, timeframe: base, kind: "aggregate" }, async (run) => {
      const range = await this.store.range(symbol, base);
      if (!range) return 0;
      const nowSec = Math.floor(this.now() / 1000);
      let written = 0;
      for (const target of derivedTargets(base)) {
        const start = scope === "full" ? range.first : scope === "recent" ? nowSec - TIMEFRAME_SECONDS[target] : scope.since;
        const from = scope === "full" ? range.first : bucketStart(Math.max(range.first, start), target);
        const bars = await this.store.readRange(symbol, base, from, range.last + 1);
        if (!bars.length) continue;
        const derived = aggregate(bars, target);
        // a target bucket that starts before the base history is incomplete — never write it
        const complete = derived.filter((c) => c.time >= range.first);
        written += await this.store.upsert(symbol, target, complete, `aggregate:${base}`, { mode: "derived" });
      }
      run.from = scope === "full" ? range.first : scope === "recent" ? undefined : scope.since; run.to = range.last;
      return written;
    }, { persist: scope !== "recent" });
  }

  async aggregateRecentAll(): Promise<void> {
    for (const i of this.instruments()) {
      try { await this.aggregateDerived(i.symbol, "recent"); } catch (e) { this.log(`aggregate ${i.symbol}: ${describeError(e)}`); }
    }
  }

  // ── internals ─────────────────────────────────────────────────────────────
  private instrument(symbol: string): Instrument {
    const i = findInstrument(symbol);
    if (!i) throw new Error(`unknown instrument ${symbol}`);
    return i;
  }

  /** Walk backwards from `to` in pages until `bars` are written, history runs out, or `stopAt` (s) is reached. */
  private async pullBackward(i: Instrument, tf: Timeframe, to: number, bars: number, stopAt?: number): Promise<{ written: number; from: number }> {
    const provider = this.registry.for(i);
    let remaining = bars;
    let cursor = to;
    let written = 0;
    let from = to;
    for (let page = 0; page < 500 && remaining > 0; page++) {
      const want = Math.min(this.opts.pageSize, remaining);
      const batch = await provider.getCandles(i, tf, want, cursor);
      if (!batch.length) break;
      const kept = stopAt !== undefined ? batch.filter((c) => c.time > stopAt) : batch;
      written += await this.store.upsert(i.symbol, tf, kept, provider.id);
      const oldest = batch[0]!.time;
      from = Math.min(from, oldest);
      remaining -= batch.length;
      if (oldest >= cursor || batch.length < want || (stopAt !== undefined && oldest <= stopAt)) break;
      cursor = oldest;
    }
    this.log(`pull ${i.symbol} ${tf}: ${written} bars back to ${new Date(from * 1000).toISOString()}`);
    return { written, from };
  }

  private async record(seed: Pick<BackfillRun, "symbol" | "timeframe" | "kind"> & Partial<BackfillRun>, work: (run: BackfillRun) => Promise<number>, opts: { persist?: boolean } = {}): Promise<BackfillRun> {
    const run: BackfillRun = { bars: 0, status: "running", startedAt: this.now(), ...seed };
    this.runs.push(run);
    if (this.runs.length > 500) this.runs.splice(0, this.runs.length - 500);
    try {
      run.bars = await work(run);
      run.status = "done";
    } catch (e) {
      run.status = "failed";
      run.error = describeError(e);
      throw e;
    } finally {
      run.finishedAt = this.now();
      if (opts.persist !== false && hasRunLog(this.store)) await this.store.logRun(run).catch(() => { /* the in-memory list still has it */ });
    }
    return run;
  }
}
