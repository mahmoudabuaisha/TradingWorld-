import type { Candle } from "@tradingworld/analysis-engine";
import type { Timeframe, Instrument } from "@tradingworld/shared";
import type { MarketDataProvider, CandleUpdate, ProviderStatus } from "./types.js";

const TF_MAP: Partial<Record<Timeframe, string>> = {
  "1m": "1m", "3m": "3m", "5m": "5m", "15m": "15m", "30m": "30m",
  "1h": "1h", "2h": "2h", "4h": "4h", "12h": "12h", "1d": "1d", "1w": "1w", "1M": "1M",
};

/**
 * Binance public market data (crypto only). REST klines + WebSocket kline stream.
 * ⚠ Review Binance's API terms before any commercial redistribution of this data.
 */
export class BinanceProvider implements MarketDataProvider {
  readonly id = "binance" as const;
  private lastUpdate?: number;
  private lastError?: string;

  constructor(private baseUrl = "https://api.binance.com", private wsUrl = "wss://stream.binance.com:9443/ws") {}

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
    const res = await fetch(url);
    if (!res.ok) { this.lastError = `HTTP ${res.status}`; throw new Error(`Binance klines failed: ${res.status}`); }
    const rows = (await res.json()) as (string | number)[][];
    this.lastUpdate = Date.now();
    return rows.map((r) => ({ time: Math.floor(Number(r[0]) / 1000), open: Number(r[1]), high: Number(r[2]), low: Number(r[3]), close: Number(r[4]), volume: Number(r[5]) }));
  }

  subscribe(i: Instrument, tf: Timeframe, onUpdate: (u: CandleUpdate) => void): () => void {
    const sym = i.providerSymbols.binance?.toLowerCase();
    const interval = TF_MAP[tf];
    if (!sym || !interval) return () => {};
    let ws: WebSocket | undefined;
    let closed = false;
    const connect = () => {
      ws = new WebSocket(`${this.wsUrl}/${sym}@kline_${interval}`);
      ws.onmessage = (ev) => {
        const msg = JSON.parse(String(ev.data)) as { k: { t: number; o: string; h: string; l: string; c: string; v: string; x: boolean } };
        const k = msg.k;
        this.lastUpdate = Date.now();
        onUpdate({ symbol: i.symbol, timeframe: tf, candle: { time: Math.floor(k.t / 1000), open: +k.o, high: +k.h, low: +k.l, close: +k.c, volume: +k.v }, closed: k.x, receivedAt: Date.now() });
      };
      ws.onclose = () => { if (!closed) setTimeout(connect, 2000); };
      ws.onerror = () => { this.lastError = "ws error"; };
    };
    connect();
    return () => { closed = true; ws?.close(); };
  }

  status(): ProviderStatus {
    return { id: this.id, live: !!this.lastUpdate && Date.now() - this.lastUpdate < 15_000, lastUpdate: this.lastUpdate, message: this.lastError };
  }
}
