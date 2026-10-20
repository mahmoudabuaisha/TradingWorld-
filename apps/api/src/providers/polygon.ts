import type { Candle } from "@tradingworld/analysis-engine";
import { TIMEFRAME_SECONDS, type Timeframe, type Instrument } from "@tradingworld/shared";
import type { MarketDataProvider, CandleUpdate, ProviderStatus } from "./types.js";
import { RateBudget } from "./support/rateBudget.js";
import { TickAggregator } from "./support/tickAggregator.js";
import { ReconnectingSocket } from "./support/socket.js";
import { buildStatus, describeError, type FeedClock } from "./support/status.js";

const TF_MAP: Record<Timeframe, { mult: number; span: string }> = {
  "1m": { mult: 1, span: "minute" },
  "3m": { mult: 3, span: "minute" },
  "5m": { mult: 5, span: "minute" },
  "15m": { mult: 15, span: "minute" },
  "30m": { mult: 30, span: "minute" },
  "1h": { mult: 1, span: "hour" },
  "2h": { mult: 2, span: "hour" },
  "4h": { mult: 4, span: "hour" },
  "12h": { mult: 12, span: "hour" },
  "1d": { mult: 1, span: "day" },
  "1w": { mult: 1, span: "week" },
  "1M": { mult: 1, span: "month" },
};

export type PolygonCluster = "forex" | "crypto" | "indices" | "stocks";

export interface PolygonOptions {
  apiKey: string;
  baseUrl?: string;
  wsBaseUrl?: string;
  /** requests per minute of the plan (free 5; paid plans are unlimited — set e.g. 300) */
  requestsPerMinute?: number;
  useWebSocket?: boolean;
  pollSeconds?: number;
  plan?: string;
  fetchImpl?: typeof fetch;
  WebSocketCtor?: typeof WebSocket;
  now?: () => number;
}

export class PolygonError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "PolygonError";
  }
}

/** Polygon ticker → websocket cluster, aggregate channel and the keys its events carry (`pair` / `sym`). */
export function polygonChannel(
  i: Pick<Instrument, "base" | "quote" | "providerSymbols">,
): { cluster: PolygonCluster; channel: string; keys: string[] } | undefined {
  const t = i.providerSymbols.polygon;
  if (!t) return undefined;
  if (t.startsWith("C:"))
    return { cluster: "forex", channel: `CA.C:${i.base}-${i.quote}`, keys: [t, `${i.base}/${i.quote}`, `${i.base}-${i.quote}`] };
  if (t.startsWith("X:"))
    return { cluster: "crypto", channel: `XA.X:${i.base}-${i.quote}`, keys: [t, `${i.base}-${i.quote}`, `${i.base}/${i.quote}`] };
  if (t.startsWith("I:")) return { cluster: "indices", channel: `AM.${t}`, keys: [t, t.slice(2)] };
  return { cluster: "stocks", channel: `AM.${t}`, keys: [t] };
}

interface AggsJson {
  status?: string;
  error?: string;
  message?: string;
  results?: { t: number; o: number; h: number; l: number; c: number; v?: number }[];
}

/** Parses `/v2/aggs` output (t in ms) into ascending candles; throws PolygonError on API errors. */
export function parseAggregates(json: unknown): Candle[] {
  const j = json as AggsJson;
  if (!j || typeof j !== "object") throw new PolygonError("Polygon: empty response");
  if (j.status === "ERROR" || j.error) throw new PolygonError(`Polygon: ${j.error ?? j.message ?? "error"}`);
  if (!Array.isArray(j.results)) return [];
  return j.results
    .map((r) => ({ time: Math.floor(r.t / 1000), open: r.o, high: r.h, low: r.l, close: r.c, volume: r.v }))
    .filter((c) => Number.isFinite(c.open) && Number.isFinite(c.close))
    .sort((a, b) => a.time - b.time);
}

/** Calendar span to request so that `limit` bars come back despite closed hours / weekends. */
export function rangeSeconds(limit: number, tf: Timeframe, assetClass: Instrument["assetClass"]): number {
  const intradayExchange = (assetClass === "stock" || assetClass === "index") && TIMEFRAME_SECONDS[tf] < 86400;
  const factor = intradayExchange ? 4.5 : TIMEFRAME_SECONDS[tf] >= 604800 ? 1.2 : 1.6;
  return Math.ceil(limit * TIMEFRAME_SECONDS[tf] * factor);
}

type AggEvent = { ev?: string; pair?: string; sym?: string; o: number; h: number; l: number; c: number; v?: number; s: number; e?: number };

/** One authenticated socket per cluster; events are routed to subscribers by their ticker keys. */
class PolygonSocket {
  private readonly sock: ReconnectingSocket;
  private readonly subs = new Map<string, { keys: string[]; handlers: Set<(bar: Candle, endMs: number) => void> }>();
  private authed = false;

  constructor(
    url: string,
    private readonly apiKey: string,
    Ctor: typeof WebSocket | undefined,
    private readonly onEvent: (e: { type: "bar" | "error" | "close"; message?: string }) => void,
  ) {
    this.sock = new ReconnectingSocket(
      url,
      {
        onOpen: (send) => {
          this.authed = false;
          send({ action: "auth", params: this.apiKey });
        },
        onMessage: (raw) => this.handle(raw),
        onClose: (reason) => {
          this.authed = false;
          this.onEvent({ type: "close", message: reason });
        },
      },
      { WebSocketCtor: Ctor },
    );
    this.sock.open();
  }

  subscribe(channel: string, keys: string[], handler: (bar: Candle, endMs: number) => void): () => void {
    let sub = this.subs.get(channel);
    if (!sub) {
      sub = { keys, handlers: new Set() };
      this.subs.set(channel, sub);
      if (this.authed) this.sock.send({ action: "subscribe", params: channel });
    }
    sub.handlers.add(handler);
    return () => {
      sub!.handlers.delete(handler);
      if (!sub!.handlers.size) {
        this.subs.delete(channel);
        if (this.authed) this.sock.send({ action: "unsubscribe", params: channel });
      }
    };
  }

  private handle(raw: string) {
    let events: AggEvent[];
    try {
      const parsed = JSON.parse(raw);
      events = Array.isArray(parsed) ? parsed : [parsed];
    } catch {
      return;
    }
    for (const ev of events) {
      if (ev.ev === "status") {
        const st = ev as unknown as { status?: string; message?: string };
        if (st.status === "auth_success") {
          this.authed = true;
          if (this.subs.size) this.sock.send({ action: "subscribe", params: [...this.subs.keys()].join(",") });
        } else if (st.status === "auth_failed" || st.status === "error") this.onEvent({ type: "error", message: st.message ?? st.status });
        continue;
      }
      if (ev.ev !== "CA" && ev.ev !== "XA" && ev.ev !== "AM") continue;
      const key = ev.pair ?? ev.sym;
      if (!key || !Number.isFinite(ev.s)) continue;
      for (const sub of this.subs.values()) {
        if (!sub.keys.includes(key)) continue;
        this.onEvent({ type: "bar" });
        const bar: Candle = { time: Math.floor(ev.s / 1000), open: ev.o, high: ev.h, low: ev.l, close: ev.c, volume: ev.v ?? 0 };
        for (const h of sub.handlers) h(bar, ev.e ?? ev.s);
      }
    }
  }

  close() {
    this.sock.close();
  }
}

/**
 * Polygon.io — licensed US stocks / indices / forex / crypto.
 * REST aggregates behind a request budget; real-time minute aggregates over the cluster WebSockets
 * (forex / crypto / indices / stocks) folded into the subscribed timeframe. See docs/03-data-providers.md.
 */
export class PolygonProvider implements MarketDataProvider {
  readonly id = "polygon" as const;
  readonly budget: RateBudget;
  private readonly clock: FeedClock;
  private readonly baseUrl: string;
  private readonly wsBaseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => number;
  private readonly sockets = new Map<PolygonCluster, PolygonSocket>();

  constructor(private readonly opts: PolygonOptions) {
    this.baseUrl = opts.baseUrl ?? "https://api.polygon.io";
    this.wsBaseUrl = opts.wsBaseUrl ?? "wss://socket.polygon.io";
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.now = opts.now ?? Date.now;
    this.budget = new RateBudget(opts.requestsPerMinute ?? 5, 60_000, this.now);
    this.clock = { transport: opts.useWebSocket ? "ws" : "poll", pollSeconds: opts.pollSeconds ?? 15 };
  }

  supports(i: Instrument): boolean {
    return !!i.providerSymbols.polygon;
  }

  async getCandles(i: Instrument, tf: Timeframe, limit: number, to?: number): Promise<Candle[]> {
    const ticker = i.providerSymbols.polygon;
    if (!ticker) throw new Error(`Polygon does not support ${i.symbol}`);
    const { mult, span } = TF_MAP[tf];
    const toMs = (to ?? Math.floor(this.now() / 1000)) * 1000;
    const fromMs = toMs - rangeSeconds(limit, tf, i.assetClass) * 1000;
    const url = new URL(`/v2/aggs/ticker/${encodeURIComponent(ticker)}/range/${mult}/${span}/${fromMs}/${toMs}`, this.baseUrl);
    url.searchParams.set("adjusted", "true");
    url.searchParams.set("sort", "asc");
    url.searchParams.set("limit", "50000");
    url.searchParams.set("apiKey", this.opts.apiKey);

    await this.budget.take(1);
    let json: unknown;
    try {
      const res = await this.fetchImpl(url);
      json = await res.json().catch(() => ({ status: "ERROR", error: `HTTP ${res.status}` }));
      if (!res.ok && !(json as { error?: string }).error) json = { status: "ERROR", error: `HTTP ${res.status}` };
    } catch (e) {
      this.fail(describeError(e));
      throw e;
    }
    try {
      const candles = parseAggregates(json).slice(-limit);
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

  private streamSubscribe(i: Instrument, tf: Timeframe, onUpdate: (u: CandleUpdate) => void): () => void {
    const ch = polygonChannel(i);
    if (!ch) return () => {};
    let socket = this.sockets.get(ch.cluster);
    if (!socket) {
      socket = new PolygonSocket(`${this.wsBaseUrl}/${ch.cluster}`, this.opts.apiKey, this.opts.WebSocketCtor, (e) => {
        if (e.type === "bar") this.clock.lastUpdate = this.now();
        else this.fail(e.message ?? e.type);
      });
      this.sockets.set(ch.cluster, socket);
    }
    const agg = new TickAggregator(tf);
    let active = true;
    void this.getCandles(i, tf, 1)
      .then((c) => {
        if (active && c[0]) agg.seed(c[0]);
      })
      .catch(() => {
        /* seeded by the first bar instead */
      });
    const off = socket.subscribe(ch.channel, ch.keys, (bar, endMs) => {
      if (!active) return;
      const receivedAt = this.now();
      this.clock.lastEventTime = Math.floor(endMs / 1000);
      this.clock.latencyMs = Math.max(0, receivedAt - endMs);
      for (const u of agg.bar(bar))
        onUpdate({ symbol: i.symbol, timeframe: tf, candle: u.candle, closed: u.closed, receivedAt, eventTime: Math.floor(endMs / 1000) });
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
    for (const s of this.sockets.values()) s.close();
  }
}
