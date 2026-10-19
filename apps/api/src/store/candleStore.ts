import type { Candle } from "@tradingworld/analysis-engine";
import type { Timeframe } from "@tradingworld/shared";

/** Who wrote a row: a provider id, or `aggregate:<base>` for bars derived locally from a lower timeframe. */
export type CandleSource = string;

export interface SeriesRange {
  symbol: string;
  timeframe: Timeframe;
  /** s — first and last bar time in the store */
  first: number;
  last: number;
  count: number;
}

export interface UpsertOptions {
  /**
   * derived rows never overwrite native provider rows (a provider's daily bar beats one aggregated from 1m);
   * native rows always win. Default: native.
   */
  mode?: "native" | "derived";
}

/**
 * Where candles live. The memory store is the default and what tests use; the Timescale store is the
 * persistent half of DATA-02. Both are keyed by (symbol, timeframe, time) and return ascending series.
 */
export interface CandleStore {
  readonly kind: "memory" | "timescale";
  /** The last `limit` bars with time < `to` (s, exclusive; default: no bound), ascending. */
  read(symbol: string, timeframe: Timeframe, limit: number, to?: number): Promise<Candle[]>;
  /** Bars with from ≤ time < to, ascending. */
  readRange(symbol: string, timeframe: Timeframe, from: number, to: number): Promise<Candle[]>;
  /** Insert or update by time. Returns the number of rows written. */
  upsert(symbol: string, timeframe: Timeframe, candles: Candle[], source: CandleSource, opts?: UpsertOptions): Promise<number>;
  range(symbol: string, timeframe: Timeframe): Promise<SeriesRange | undefined>;
  series(): Promise<SeriesRange[]>;
  close(): Promise<void>;
}

interface MemorySeries { candles: Candle[]; sources: Map<number, CandleSource> }

/** Sorted-array store, capped per series. */
export class MemoryCandleStore implements CandleStore {
  readonly kind = "memory" as const;
  private data = new Map<string, MemorySeries>();

  constructor(private readonly maxBars = 50_000) {}

  private key(symbol: string, tf: Timeframe) { return `${symbol}:${tf}`; }

  async read(symbol: string, tf: Timeframe, limit: number, to?: number): Promise<Candle[]> {
    const s = this.data.get(this.key(symbol, tf));
    if (!s) return [];
    const arr = to === undefined ? s.candles : s.candles.filter((c) => c.time < to);
    return arr.slice(-limit).map((c) => ({ ...c }));
  }

  async readRange(symbol: string, tf: Timeframe, from: number, to: number): Promise<Candle[]> {
    const s = this.data.get(this.key(symbol, tf));
    if (!s) return [];
    return s.candles.filter((c) => c.time >= from && c.time < to).map((c) => ({ ...c }));
  }

  async upsert(symbol: string, tf: Timeframe, candles: Candle[], source: CandleSource, opts: UpsertOptions = {}): Promise<number> {
    if (!candles.length) return 0;
    const key = this.key(symbol, tf);
    const s = this.data.get(key) ?? { candles: [], sources: new Map() };
    const byTime = new Map(s.candles.map((c) => [c.time, c]));
    let written = 0;
    for (const c of candles) {
      const existing = s.sources.get(c.time);
      if (opts.mode === "derived" && existing && !existing.startsWith("aggregate:")) continue;
      byTime.set(c.time, { ...c });
      s.sources.set(c.time, source);
      written++;
    }
    s.candles = [...byTime.values()].sort((a, b) => a.time - b.time).slice(-this.maxBars);
    for (const t of [...s.sources.keys()]) if (t < s.candles[0]!.time) s.sources.delete(t);
    this.data.set(key, s);
    return written;
  }

  async range(symbol: string, tf: Timeframe): Promise<SeriesRange | undefined> {
    const s = this.data.get(this.key(symbol, tf));
    if (!s || !s.candles.length) return undefined;
    return { symbol, timeframe: tf, first: s.candles[0]!.time, last: s.candles[s.candles.length - 1]!.time, count: s.candles.length };
  }

  async series(): Promise<SeriesRange[]> {
    const out: SeriesRange[] = [];
    for (const key of this.data.keys()) {
      const [symbol, tf] = key.split(":") as [string, Timeframe];
      const r = await this.range(symbol, tf);
      if (r) out.push(r);
    }
    return out.sort((a, b) => a.symbol.localeCompare(b.symbol) || a.timeframe.localeCompare(b.timeframe));
  }

  /** test visibility */
  sourceOf(symbol: string, tf: Timeframe, time: number): CandleSource | undefined { return this.data.get(this.key(symbol, tf))?.sources.get(time); }

  async close(): Promise<void> { this.data.clear(); }
}
