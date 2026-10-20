import type { Candle } from "@tradingworld/analysis-engine";
import { TIMEFRAME_SECONDS, type Instrument, type Timeframe } from "@tradingworld/shared";
import type { MarketDataProvider, CandleUpdate, LastSeen } from "../types.js";
import { MemoryCandleStore, type CandleStore } from "../../store/candleStore.js";

export interface CachedProviderOptions {
  /** where the series live: memory (default) or the Timescale store (DATA-02) */
  store?: CandleStore;
  /** seconds a series is served from the store before its tail is refreshed (default: tf/4 clamped to 15…300) */
  refreshSeconds?: (tf: Timeframe) => number;
  /** minimum bars re-fetched on a tail refresh */
  tail?: number;
  /** largest tail fetched in one request; deeper holes are left to the backfill job's gap repair */
  maxTail?: number;
  /** most bars asked for in a full fetch */
  maxBars?: number;
  /** how often the in-progress candle from a stream is persisted (closed candles always are); 0 = every update */
  liveWriteSeconds?: number;
  now?: () => number;
}

interface Meta {
  fetchedAt: number;
  streaming: number;
  lastLiveWrite: number;
}

export const defaultRefreshSeconds = (tf: Timeframe): number => Math.min(300, Math.max(15, Math.round(TIMEFRAME_SECONDS[tf] / 4)));

/** Upsert `incoming` into `base` by time; both ascending. */
export function mergeCandles(base: Candle[], incoming: Candle[]): Candle[] {
  if (!incoming.length) return base;
  const byTime = new Map<number, Candle>();
  for (const c of base) byTime.set(c.time, c);
  for (const c of incoming) byTime.set(c.time, c);
  return [...byTime.values()].sort((a, b) => a.time - b.time);
}

/**
 * A candle store in front of a budgeted provider, per (symbol, timeframe):
 * - a series is fetched in full once; afterwards only what happened since its last stored bar is fetched,
 *   and only when the series is older than `refreshSeconds(tf)` (streaming series never need REST)
 * - live updates are written through to the store, so a restart resumes from where the stream left off
 * - historical pages (`to` set) go straight to the provider: the backfill job writes those itself
 * The budget therefore scales with the number of distinct series, not with users or requests.
 */
export class CachedProvider implements MarketDataProvider {
  readonly id;
  readonly store: CandleStore;
  private meta = new Map<string, Meta>();
  private inflight = new Map<string, Promise<Candle[]>>();
  private seen = new Map<string, LastSeen>();
  private readonly refresh: (tf: Timeframe) => number;
  private readonly tail: number;
  private readonly maxTail: number;
  private readonly maxBars: number;
  private readonly liveWriteMs: number;
  private readonly now: () => number;

  constructor(
    private readonly inner: MarketDataProvider,
    opts: CachedProviderOptions = {},
  ) {
    this.id = inner.id;
    this.store = opts.store ?? new MemoryCandleStore();
    this.refresh = opts.refreshSeconds ?? defaultRefreshSeconds;
    this.tail = opts.tail ?? 3;
    this.maxTail = opts.maxTail ?? 5000;
    this.maxBars = opts.maxBars ?? 6000;
    this.liveWriteMs = (opts.liveWriteSeconds ?? (this.store.kind === "memory" ? 0 : 5)) * 1000;
    this.now = opts.now ?? Date.now;
  }

  supports(i: Instrument): boolean {
    return this.inner.supports(i);
  }
  status() {
    return this.inner.status();
  }
  lastSeen(symbol: string): LastSeen | undefined {
    return this.seen.get(symbol) ?? this.inner.lastSeen?.(symbol);
  }
  /** series this process has touched (coverage itself lives in the store: `store.series()`) */
  stats() {
    return { series: this.meta.size, store: this.store.kind };
  }

  async getCandles(i: Instrument, tf: Timeframe, limit: number, to?: number): Promise<Candle[]> {
    if (to !== undefined) return this.inner.getCandles(i, tf, limit, to);
    const key = `${i.symbol}:${tf}`;
    const meta = this.meta.get(key);
    if (meta && (meta.streaming > 0 || this.now() - meta.fetchedAt < this.refresh(tf) * 1000)) {
      const stored = await this.store.read(i.symbol, tf, limit);
      if (stored.length >= limit) return stored;
    }
    const running = this.inflight.get(key);
    if (running) return running;

    const p = (async () => {
      const range = await this.store.range(i.symbol, tf);
      const step = TIMEFRAME_SECONDS[tf];
      if (range && range.count >= limit) {
        // the series exists: fetch what happened since its last bar, plus a few bars to re-close the tail
        const missing = Math.ceil((Math.floor(this.now() / 1000) - range.last) / step) + this.tail;
        const fresh = await this.inner.getCandles(i, tf, Math.min(this.maxTail, Math.max(this.tail, missing)));
        await this.store.upsert(i.symbol, tf, fresh, this.inner.id);
        this.note(i.symbol, fresh);
      } else {
        const full = await this.inner.getCandles(i, tf, Math.min(this.maxBars, Math.max(limit, range?.count ?? 0)));
        await this.store.upsert(i.symbol, tf, full, this.inner.id);
        this.note(i.symbol, full);
      }
      const m = this.meta.get(key) ?? { fetchedAt: 0, streaming: 0, lastLiveWrite: 0 };
      m.fetchedAt = this.now();
      this.meta.set(key, m);
      return this.store.read(i.symbol, tf, limit);
    })().finally(() => this.inflight.delete(key));
    this.inflight.set(key, p);
    return p;
  }

  subscribe(i: Instrument, tf: Timeframe, onUpdate: (u: CandleUpdate) => void): () => void {
    const key = `${i.symbol}:${tf}`;
    const meta = this.meta.get(key) ?? { fetchedAt: 0, streaming: 0, lastLiveWrite: 0 };
    meta.streaming++;
    this.meta.set(key, meta);
    const off = this.inner.subscribe(i, tf, (u) => {
      this.seen.set(i.symbol, { receivedAt: u.receivedAt, eventTime: u.eventTime ?? u.candle.time });
      const now = this.now();
      if (u.closed || now - meta.lastLiveWrite >= this.liveWriteMs) {
        meta.lastLiveWrite = now;
        void this.store.upsert(i.symbol, tf, [u.candle], this.inner.id).catch(() => {
          /* status() of the store layer reports persistent failures */
        });
      }
      onUpdate(u);
    });
    return () => {
      off();
      meta.streaming = Math.max(0, meta.streaming - 1);
    };
  }

  private note(symbol: string, candles: Candle[]) {
    const last = candles[candles.length - 1];
    if (last) this.seen.set(symbol, { receivedAt: this.now(), eventTime: last.time });
  }
}
