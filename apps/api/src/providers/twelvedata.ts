import { aggregate, type Candle } from "@tradingworld/analysis-engine";
import { TIMEFRAME_SECONDS, type Timeframe, type Instrument } from "@tradingworld/shared";
import type { MarketDataProvider, CandleUpdate, ProviderStatus } from "./types.js";
import { RateBudget } from "./support/rateBudget.js";
import { TickAggregator } from "./support/tickAggregator.js";
import { ReconnectingSocket } from "./support/socket.js";
import { buildStatus, describeError, type FeedClock } from "./support/status.js";

/** Native Twelve Data intervals. 3m and 12h are derived from 1m / 4h (see DERIVED). */
const TF_MAP: Partial<Record<Timeframe, string>> = {
  "1m": "1min",
  "5m": "5min",
  "15m": "15min",
  "30m": "30min",
  "1h": "1h",
  "2h": "2h",
  "4h": "4h",
  "1d": "1day",
  "1w": "1week",
  "1M": "1month",
};
const DERIVED: Partial<Record<Timeframe, Timeframe>> = { "3m": "1m", "12h": "4h" };

export interface TwelveDataOptions {
  apiKey: string;
  baseUrl?: string;
  wsUrl?: string;
  /** API credits per minute of the plan (Basic 8, Grow 55, Pro 610, Ultra 1500 — see docs/03) */
  creditsPerMinute?: number;
  /** stream prices over WebSocket (paid plans); otherwise poll the last bars */
  useWebSocket?: boolean;
  pollSeconds?: number;
  plan?: string;
  fetchImpl?: typeof fetch;
  WebSocketCtor?: typeof WebSocket;
  now?: () => number;
}

export class TwelveDataError extends Error {
  constructor(
    message: string,
    public readonly code?: number,
  ) {
    super(message);
    this.name = "TwelveDataError";
  }
}

/** "2024-01-05" (daily+) or "2024-01-05 14:30:00" (intraday, in the requested timezone = UTC) → unix seconds. */
export function parseTwelveDateTime(s: string): number {
  const iso = s.length === 10 ? `${s}T00:00:00Z` : `${s.replace(" ", "T")}Z`;
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) throw new TwelveDataError(`TwelveData: bad datetime "${s}"`);
  return Math.floor(ms / 1000);
}

interface TimeSeriesJson {
  status?: string;
  code?: number;
  message?: string;
  values?: { datetime: string; open: string; high: string; low: string; close: string; volume?: string }[];
}

/** Parses a `time_series` payload (values are newest first) into ascending candles; throws TwelveDataError on API errors. */
export function parseTimeSeries(json: unknown): Candle[] {
  const j = json as TimeSeriesJson;
  if (!j || typeof j !== "object") throw new TwelveDataError("TwelveData: empty response");
  if (j.status === "error" || (!j.values && j.message)) throw new TwelveDataError(`TwelveData: ${j.message ?? "error"}`, j.code);
  if (!Array.isArray(j.values)) throw new TwelveDataError("TwelveData: no values");
  return j.values
    .map((v) => ({
      time: parseTwelveDateTime(v.datetime),
      open: +v.open,
      high: +v.high,
      low: +v.low,
      close: +v.close,
      volume: v.volume !== undefined && v.volume !== "" ? +v.volume : undefined,
    }))
    .filter((c) => Number.isFinite(c.open) && Number.isFinite(c.close))
    .sort((a, b) => a.time - b.time);
}

/** One WebSocket for all symbols; subscriptions are ref-counted and replayed after a reconnect. */
class TwelveDataSocket {
  private readonly sock: ReconnectingSocket;
  private readonly handlers = new Map<string, Set<(price: number, ts: number) => void>>();

  constructor(
    url: string,
    Ctor: typeof WebSocket | undefined,
    private readonly onEvent: (e: { type: "price" | "error" | "close"; ts?: number; message?: string }) => void,
  ) {
    this.sock = new ReconnectingSocket(
      url,
      {
        onOpen: (send) => {
          if (this.handlers.size) send({ action: "subscribe", params: { symbols: [...this.handlers.keys()].join(",") } });
        },
        onMessage: (raw) => this.handle(raw),
        onClose: (reason) => this.onEvent({ type: "close", message: reason }),
      },
      { WebSocketCtor: Ctor, heartbeat: { everyMs: 10_000, payload: { action: "heartbeat" } } },
    );
    this.sock.open();
  }

  subscribe(symbol: string, handler: (price: number, ts: number) => void): () => void {
    let set = this.handlers.get(symbol);
    if (!set) {
      set = new Set();
      this.handlers.set(symbol, set);
      this.sock.send({ action: "subscribe", params: { symbols: symbol } });
    }
    set.add(handler);
    return () => {
      set!.delete(handler);
      if (!set!.size) {
        this.handlers.delete(symbol);
        this.sock.send({ action: "unsubscribe", params: { symbols: symbol } });
      }
    };
  }

  private handle(raw: string) {
    let msg: { event?: string; symbol?: string; price?: number | string; timestamp?: number | string; fails?: { symbol: string }[] };
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    if (msg.event === "price" && msg.symbol) {
      const price = Number(msg.price);
      const ts = Number(msg.timestamp);
      const set = this.handlers.get(msg.symbol);
      if (!set || !Number.isFinite(price) || !Number.isFinite(ts)) return;
      this.onEvent({ type: "price", ts });
      for (const h of set) h(price, ts);
    } else if (msg.event === "subscribe-status" && msg.fails?.length) {
      this.onEvent({ type: "error", message: `subscribe failed: ${msg.fails.map((f) => f.symbol).join(", ")}` });
    }
  }

  close() {
    this.sock.close();
  }
}

/**
 * Twelve Data — licensed forex / metals / indices / stocks / crypto.
 * REST `time_series` behind a credit budget, derived timeframes by aggregation, and real-time prices over
 * WebSocket on plans that include it (else polling). See docs/03-data-providers.md for plans and the go-live checklist.
 */
export class TwelveDataProvider implements MarketDataProvider {
  readonly id = "twelvedata" as const;
  readonly budget: RateBudget;
  private readonly clock: FeedClock;
  private readonly baseUrl: string;
  private readonly wsUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => number;
  private socket?: TwelveDataSocket;

  constructor(private readonly opts: TwelveDataOptions) {
    this.baseUrl = opts.baseUrl ?? "https://api.twelvedata.com";
    this.wsUrl = opts.wsUrl ?? "wss://ws.twelvedata.com/v1/quotes/price";
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.now = opts.now ?? Date.now;
    this.budget = new RateBudget(opts.creditsPerMinute ?? 8, 60_000, this.now);
    this.clock = { transport: opts.useWebSocket ? "ws" : "poll", pollSeconds: opts.pollSeconds ?? 15 };
  }

  supports(i: Instrument): boolean {
    return !!i.providerSymbols.twelvedata;
  }

  async getCandles(i: Instrument, tf: Timeframe, limit: number, to?: number): Promise<Candle[]> {
    const lower = DERIVED[tf];
    if (lower) {
      const ratio = TIMEFRAME_SECONDS[tf] / TIMEFRAME_SECONDS[lower];
      const base = await this.getCandles(i, lower, Math.min(5000, Math.ceil(limit * ratio) + ratio), to);
      return aggregate(base, tf).slice(-limit);
    }
    const sym = i.providerSymbols.twelvedata;
    const interval = TF_MAP[tf];
    if (!sym || !interval) throw new Error(`TwelveData does not support ${i.symbol} ${tf}`);
    const url = new URL("/time_series", this.baseUrl);
    url.searchParams.set("symbol", sym);
    url.searchParams.set("interval", interval);
    url.searchParams.set("outputsize", String(Math.min(Math.max(limit, 1), 5000)));
    url.searchParams.set("timezone", "UTC");
    url.searchParams.set("format", "JSON");
    url.searchParams.set("apikey", this.opts.apiKey);
    if (to) url.searchParams.set("end_date", new Date(to * 1000).toISOString().slice(0, 19).replace("T", " "));

    await this.budget.take(1);
    let json: unknown;
    try {
      const res = await this.fetchImpl(url);
      json = await res.json().catch(() => ({ status: "error", code: res.status, message: `HTTP ${res.status}` }));
    } catch (e) {
      this.fail(describeError(e));
      throw e;
    }
    try {
      const candles = parseTimeSeries(json);
      this.clock.lastUpdate = this.now();
      const last = candles[candles.length - 1];
      if (last) this.clock.lastEventTime = last.time;
      return candles;
    } catch (e) {
      this.fail(describeError(e));
      throw e;
    }
  }

  subscribe(i: Instrument, tf: Timeframe, onUpdate: (u: CandleUpdate) => void): () => void {
    return this.opts.useWebSocket ? this.streamSubscribe(i, tf, onUpdate) : this.pollSubscribe(i, tf, onUpdate);
  }

  /** Polling: refresh the last two bars; when a new bucket appears the previous bar is emitted closed. */
  private pollSubscribe(i: Instrument, tf: Timeframe, onUpdate: (u: CandleUpdate) => void): () => void {
    let lastTime: number | undefined;
    const tick = async () => {
      try {
        const tail = await this.getCandles(i, tf, 2);
        const last = tail[tail.length - 1];
        if (!last) return;
        const receivedAt = this.now();
        const prev = tail[tail.length - 2];
        if (lastTime !== undefined && last.time > lastTime && prev)
          onUpdate({ symbol: i.symbol, timeframe: tf, candle: prev, closed: true, receivedAt, eventTime: prev.time });
        onUpdate({ symbol: i.symbol, timeframe: tf, candle: last, closed: false, receivedAt, eventTime: last.time });
        lastTime = last.time;
      } catch {
        /* status() carries the error; keep polling */
      }
    };
    const timer = setInterval(() => void tick(), (this.opts.pollSeconds ?? 15) * 1000);
    return () => clearInterval(timer);
  }

  /** Streaming: price events are folded into the subscribed timeframe; the first REST bar seeds the open candle. */
  private streamSubscribe(i: Instrument, tf: Timeframe, onUpdate: (u: CandleUpdate) => void): () => void {
    const sym = i.providerSymbols.twelvedata;
    if (!sym) return () => {};
    const socket = (this.socket ??= new TwelveDataSocket(
      `${this.wsUrl}?apikey=${encodeURIComponent(this.opts.apiKey)}`,
      this.opts.WebSocketCtor,
      (e) => {
        if (e.type === "price" && e.ts !== undefined) {
          const receivedAt = this.now();
          this.clock.lastUpdate = receivedAt;
          this.clock.lastEventTime = e.ts;
          this.clock.latencyMs = Math.max(0, receivedAt - e.ts * 1000);
        } else this.fail(e.message ?? e.type);
      },
    ));
    const agg = new TickAggregator(tf);
    let active = true;
    void this.getCandles(i, tf, 1)
      .then((c) => {
        if (active && c[0]) agg.seed(c[0]);
      })
      .catch(() => {
        /* seeded by the first tick instead */
      });
    const off = socket.subscribe(sym, (price, ts) => {
      if (!active) return;
      const receivedAt = this.now();
      for (const u of agg.tick(price, ts))
        onUpdate({ symbol: i.symbol, timeframe: tf, candle: u.candle, closed: u.closed, receivedAt, eventTime: ts });
    });
    return () => {
      active = false;
      off();
    };
  }

  private fail(message: string) {
    this.clock.lastError = message;
    this.clock.lastErrorAt = this.now();
  }

  status(): ProviderStatus {
    return buildStatus(this.id, this.clock, { licensed: true, plan: this.opts.plan, budget: this.budget.snapshot() }, this.now());
  }

  close() {
    this.socket?.close();
  }
}
