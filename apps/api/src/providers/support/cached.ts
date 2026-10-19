import type { Candle } from "@tradingworld/analysis-engine";
import { TIMEFRAME_SECONDS, type Instrument, type Timeframe } from "@tradingworld/shared";
import type { MarketDataProvider, CandleUpdate, LastSeen } from "../types.js";

export interface CachedProviderOptions {
  /** seconds a series is served from memory before its tail is refreshed (default: tf/4 clamped to 15…300) */
  refreshSeconds?: (tf: Timeframe) => number;
  /** bars fetched on a tail refresh */
  tail?: number;
  maxBars?: number;
  now?: () => number;
}

interface Series { candles: Candle[]; fetchedAt: number; streaming: number }

/** Upsert `incoming` into `base` by time; both ascending. */
export function mergeCandles(base: Candle[], incoming: Candle[]): Candle[] {
  if (!incoming.length) return base;
  const byTime = new Map<number, Candle>();
  for (const c of base) byTime.set(c.time, c);
  for (const c of incoming) byTime.set(c.time, c);
  return [...byTime.values()].sort((a, b) => a.time - b.time);
}

export const defaultRefreshSeconds = (tf: Timeframe): number => Math.min(300, Math.max(15, Math.round(TIMEFRAME_SECONDS[tf] / 4)));

/**
 * In-memory candle store in front of a budgeted provider, per (symbol, timeframe):
 * - the first request fetches the full series; later requests are served from memory and only the
 *   last few bars are refreshed once the series is older than `refreshSeconds(tf)`
 * - live updates from subscribe() are merged in, so a streaming series costs no REST credits at all
 * - historical pages (`to` set) bypass the store
 * It is the in-memory half of DATA-02; a Timescale-backed store can replace it behind the same interface.
 */
export class CachedProvider implements MarketDataProvider {
  readonly id;
  private series = new Map<string, Series>();
  private inflight = new Map<string, Promise<Candle[]>>();
  private seen = new Map<string, LastSeen>();
  private readonly refresh: (tf: Timeframe) => number;
  private readonly tail: number;
  private readonly maxBars: number;
  private readonly now: () => number;

  constructor(private readonly inner: MarketDataProvider, opts: CachedProviderOptions = {}) {
    this.id = inner.id;
    this.refresh = opts.refreshSeconds ?? defaultRefreshSeconds;
    this.tail = opts.tail ?? 3;
    this.maxBars = opts.maxBars ?? 6000;
    this.now = opts.now ?? Date.now;
  }

  supports(i: Instrument): boolean { return this.inner.supports(i); }
  status() { return this.inner.status(); }
  lastSeen(symbol: string): LastSeen | undefined { return this.seen.get(symbol) ?? this.inner.lastSeen?.(symbol); }
  /** test / admin visibility */
  stats() { return { series: this.series.size, bars: [...this.series.values()].reduce((s, e) => s + e.candles.length, 0) }; }

  async getCandles(i: Instrument, tf: Timeframe, limit: number, to?: number): Promise<Candle[]> {
    if (to) return this.inner.getCandles(i, tf, limit, to);
    const key = `${i.symbol}:${tf}`;
    const entry = this.series.get(key);
    const fresh = entry && entry.candles.length >= limit && (entry.streaming > 0 || this.now() - entry.fetchedAt < this.refresh(tf) * 1000);
    if (fresh) return entry.candles.slice(-limit);
    const running = this.inflight.get(key);
    if (running) return (await running).slice(-limit);

    const p = (async () => {
      const current = this.series.get(key);
      if (current && current.candles.length >= limit) {
        const tail = await this.inner.getCandles(i, tf, this.tail);
        current.candles = mergeCandles(current.candles, tail).slice(-this.maxBars);
        current.fetchedAt = this.now();
        this.note(i.symbol, tail);
        return current.candles;
      }
      const full = await this.inner.getCandles(i, tf, Math.min(this.maxBars, Math.max(limit, current?.candles.length ?? 0)));
      const merged = current ? mergeCandles(current.candles, full) : full;
      this.series.set(key, { candles: merged.slice(-this.maxBars), fetchedAt: this.now(), streaming: current?.streaming ?? 0 });
      this.note(i.symbol, full);
      return merged;
    })().finally(() => this.inflight.delete(key));
    this.inflight.set(key, p);
    return (await p).slice(-limit);
  }

  subscribe(i: Instrument, tf: Timeframe, onUpdate: (u: CandleUpdate) => void): () => void {
    const key = `${i.symbol}:${tf}`;
    const entry = this.series.get(key) ?? { candles: [], fetchedAt: 0, streaming: 0 };
    entry.streaming++;
    this.series.set(key, entry);
    const off = this.inner.subscribe(i, tf, (u) => {
      const e = this.series.get(key);
      if (e && e.candles.length) e.candles = mergeCandles(e.candles, [u.candle]).slice(-this.maxBars);
      this.seen.set(i.symbol, { receivedAt: u.receivedAt, eventTime: u.eventTime ?? u.candle.time });
      onUpdate(u);
    });
    return () => { off(); const e = this.series.get(key); if (e) e.streaming = Math.max(0, e.streaming - 1); };
  }

  private note(symbol: string, candles: Candle[]) {
    const last = candles[candles.length - 1];
    if (last) this.seen.set(symbol, { receivedAt: this.now(), eventTime: last.time });
  }
}
