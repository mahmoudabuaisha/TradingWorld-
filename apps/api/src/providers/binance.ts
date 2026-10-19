import type { Candle } from "@tradingworld/analysis-engine";
import type { Timeframe, Instrument } from "@tradingworld/shared";
import type { MarketDataProvider, CandleUpdate, ProviderStatus } from "./types.js";
import { ReconnectingSocket } from "./support/socket.js";
import { buildStatus, describeError, type FeedClock } from "./support/status.js";

const TF_MAP: Partial<Record<Timeframe, string>> = {
  "1m": "1m", "3m": "3m", "5m": "5m", "15m": "15m", "30m": "30m",
  "1h": "1h", "2h": "2h", "4h": "4h", "12h": "12h", "1d": "1d", "1w": "1w", "1M": "1M",
};

export interface BinanceOptions {
  baseUrl?: string;
  wsUrl?: string;
  fetchImpl?: typeof fetch;
  WebSocketCtor?: typeof WebSocket;
}

export const BINANCE_MESSAGE = "Public Binance feed — review the API terms before commercial redistribution";

/**
 * Binance public market data (crypto only). REST klines + WebSocket kline stream. No key.
 * ⚠ Binance's terms restrict commercial redistribution; the status is flagged `licensed: false`.
 */
export class BinanceProvider implements MarketDataProvider {
  readonly id = "binance" as const;
  private readonly clock: FeedClock = { transport: "ws" };
  private readonly baseUrl: string;
  private readonly wsUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: BinanceOptions | string = {}) {
    const o = typeof opts === "string" ? { baseUrl: opts } : opts;
    this.baseUrl = o.baseUrl ?? "https://api.binance.com";
    this.wsUrl = o.wsUrl ?? "wss://stream.binance.com:9443/ws";
    this.fetchImpl = o.fetchImpl ?? fetch;
    this.WebSocketCtor = o.WebSocketCtor;
  }
  private readonly WebSocketCtor?: typeof WebSocket;

  supports(i: Instrument): boolean { return !!i.providerSymbols.binance; }

  async getCandles(i: Instrument, tf: Timeframe, limit: number, to?: number): Promise<Candle[]> {
    const sym = i.providerSymbols.binance;
    const interval = TF_MAP[tf];
    if (!sym || !interval) throw new Error(`Binance does not support ${i.symbol} ${tf}`);
    const url = new URL("/api/v3/klines", this.baseUrl);
    url.searchParams.set("symbol", sym);
    url.searchParams.set("interval", interval);
    url.searchParams.set("limit", String(Math.min(limit, 1000)));
    if (to) url.searchParams.set("endTime", String(to * 1000 - 1));
    let res: Response;
    try { res = await this.fetchImpl(url); } catch (e) { this.fail(describeError(e)); throw e; }
    if (!res.ok) { this.fail(`HTTP ${res.status}`); throw new Error(`Binance klines failed: ${res.status}`); }
    const rows = (await res.json()) as (string | number)[][];
    const candles = rows.map((r) => ({ time: Math.floor(Number(r[0]) / 1000), open: Number(r[1]), high: Number(r[2]), low: Number(r[3]), close: Number(r[4]), volume: Number(r[5]) }));
    this.clock.lastUpdate = Date.now();
    const last = candles[candles.length - 1];
    if (last) this.clock.lastEventTime = last.time;
    return candles;
  }

  subscribe(i: Instrument, tf: Timeframe, onUpdate: (u: CandleUpdate) => void): () => void {
    const sym = i.providerSymbols.binance?.toLowerCase();
    const interval = TF_MAP[tf];
    if (!sym || !interval) return () => {};
    const sock = new ReconnectingSocket(`${this.wsUrl}/${sym}@kline_${interval}`, {
      onMessage: (raw) => {
        let msg: { E?: number; k: { t: number; o: string; h: string; l: string; c: string; v: string; x: boolean } };
        try { msg = JSON.parse(raw); } catch { return; }
        const k = msg.k;
        if (!k) return;
        const receivedAt = Date.now();
        const eventMs = msg.E ?? receivedAt;
        this.clock.lastUpdate = receivedAt;
        this.clock.lastEventTime = Math.floor(eventMs / 1000);
        this.clock.latencyMs = Math.max(0, receivedAt - eventMs);
        onUpdate({ symbol: i.symbol, timeframe: tf, candle: { time: Math.floor(k.t / 1000), open: +k.o, high: +k.h, low: +k.l, close: +k.c, volume: +k.v }, closed: k.x, receivedAt, eventTime: Math.floor(eventMs / 1000) });
      },
      onClose: (reason) => this.fail(`ws ${reason}`),
    }, { WebSocketCtor: this.WebSocketCtor });
    sock.open();
    return () => sock.close();
  }

  private fail(message: string) { this.clock.lastError = message; this.clock.lastErrorAt = Date.now(); }

  status(): ProviderStatus {
    return buildStatus(this.id, this.clock, { licensed: false, message: this.clock.lastUpdate && !this.clock.lastErrorAt ? BINANCE_MESSAGE : undefined });
  }
}
