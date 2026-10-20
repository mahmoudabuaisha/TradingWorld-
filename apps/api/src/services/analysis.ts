import { analyze, type AnalysisResult, type Candle } from "@tradingworld/analysis-engine";
import { MTF_CONTEXT, findInstrument, type Timeframe } from "@tradingworld/shared";
import type { ProviderRegistry } from "../providers/registry.js";
import type { Repositories } from "../repositories/memory.js";
import type { OutcomeService } from "./outcomes.js";

const HTF_LIMITS: Record<string, number> = {
  "1M": 36,
  "1w": 80,
  "1d": 200,
  "12h": 200,
  "4h": 300,
  "2h": 300,
  "1h": 400,
  "30m": 400,
  "15m": 500,
  "5m": 600,
  "3m": 600,
  "1m": 600,
};

/**
 * Orchestrates: fetch base candles + explicit HTF candles from the provider → run the engine →
 * cache per (symbol, timeframe) → log emitted zones for the research dataset.
 */
export class AnalysisService {
  private cache = new Map<string, { at: number; result: AnalysisResult }>();
  private inflight = new Map<string, Promise<AnalysisResult>>();

  /** set by the app: every result registers its zones with the outcome tracker (AI-01) */
  outcomes?: OutcomeService;
  /** set by the app (OPS-01): seconds per run, candle fetches included */
  onRun?: (timeframe: Timeframe, seconds: number) => void;

  constructor(
    private providers: ProviderRegistry,
    private repos: Repositories,
    private ttlMs = 5_000,
  ) {}

  async run(
    symbol: string,
    timeframe: Timeframe,
    opts: { limit?: number; includeLowQuality?: boolean; includeInvalidated?: boolean; force?: boolean } = {},
  ): Promise<AnalysisResult> {
    const instrument = findInstrument(symbol);
    if (!instrument) throw new Error(`Unknown instrument ${symbol}`);
    const key = `${instrument.symbol}:${timeframe}:${opts.includeLowQuality ? 1 : 0}:${opts.includeInvalidated ? 1 : 0}`;
    const cached = this.cache.get(key);
    if (!opts.force && cached && Date.now() - cached.at < this.ttlMs) return cached.result;
    const existing = this.inflight.get(key);
    if (existing) return existing;

    const t0 = performance.now();
    const p = (async () => {
      const provider = this.providers.for(instrument);
      const base = await provider.getCandles(instrument, timeframe, opts.limit ?? 600);
      const htfCandles: Partial<Record<Timeframe, Candle[]>> = {};
      await Promise.all(
        MTF_CONTEXT[timeframe].map(async (tf) => {
          try {
            htfCandles[tf] = await provider.getCandles(instrument, tf, HTF_LIMITS[tf] ?? 300);
          } catch {
            /* aggregated fallback inside engine */
          }
        }),
      );
      const result = analyze({
        symbol: instrument.symbol,
        timeframe,
        candles: base,
        htfCandles,
        pricePrecision: instrument.pricePrecision,
        options: { includeLowQuality: opts.includeLowQuality ?? false, keepInvalidatedBars: opts.includeInvalidated ? 120 : 0 },
      });
      this.cache.set(key, { at: Date.now(), result });
      await this.logZones(result);
      // tracking must never break an analysis response
      if (this.outcomes) await this.outcomes.observe(result, provider.id).catch(() => undefined);
      this.onRun?.(timeframe, (performance.now() - t0) / 1000);
      return result;
    })().finally(() => this.inflight.delete(key));
    this.inflight.set(key, p);
    return p;
  }

  private seen = new Set<string>();
  private async logZones(r: AnalysisResult) {
    for (const z of r.zones) {
      const k = `${r.symbol}:${r.timeframe}:${z.id}:${z.status}`;
      if (this.seen.has(k)) continue;
      this.seen.add(k);
      await this.repos.zoneLog.append({
        symbol: r.symbol,
        timeframe: r.timeframe,
        engineVersion: r.engineVersion,
        scoringVersion: r.scoringVersion,
        zone: z,
      });
    }
  }

  stats() {
    return { cached: this.cache.size };
  }
}
