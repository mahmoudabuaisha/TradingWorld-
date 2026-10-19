import { bucketStart, type Candle } from "@tradingworld/analysis-engine";
import type { Timeframe } from "@tradingworld/shared";

export interface AggregatedUpdate { candle: Candle; closed: boolean }

/**
 * Builds candles of one timeframe from price ticks or lower-timeframe bars.
 * On a bucket roll-over it emits the finished candle (closed = true) before the newly opened one,
 * so consumers can upsert by time and run close-of-candle work exactly once.
 */
export class TickAggregator {
  private current?: Candle;

  constructor(private readonly timeframe: Timeframe, seed?: Candle) {
    this.current = seed ? { ...seed } : undefined;
  }

  get candle(): Candle | undefined { return this.current ? { ...this.current } : undefined; }

  /** Seed (or replace) the in-progress candle, e.g. from the last REST bar. Ignored if older than the current one. */
  seed(candle: Candle): void {
    if (!this.current || candle.time >= this.current.time) this.current = { ...candle };
  }

  tick(price: number, timeSec: number, volume = 0): AggregatedUpdate[] {
    const bucket = bucketStart(timeSec, this.timeframe);
    if (this.current && bucket < this.current.time) return []; // late tick from a finished bucket
    return this.apply({ time: bucket, open: price, high: price, low: price, close: price, volume });
  }

  /** Merge a bar of a lower (or equal) timeframe. */
  bar(bar: Candle): AggregatedUpdate[] {
    const bucket = bucketStart(bar.time, this.timeframe);
    if (this.current && bucket < this.current.time) return [];
    return this.apply({ ...bar, time: bucket });
  }

  private apply(piece: Candle): AggregatedUpdate[] {
    const out: AggregatedUpdate[] = [];
    if (!this.current || piece.time > this.current.time) {
      if (this.current) out.push({ candle: { ...this.current }, closed: true });
      this.current = { ...piece, volume: piece.volume ?? 0 };
    } else {
      this.current = {
        ...this.current,
        high: Math.max(this.current.high, piece.high),
        low: Math.min(this.current.low, piece.low),
        close: piece.close,
        volume: (this.current.volume ?? 0) + (piece.volume ?? 0),
      };
    }
    out.push({ candle: { ...this.current }, closed: false });
    return out;
  }
}
