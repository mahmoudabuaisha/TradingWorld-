import type { Candle } from "@tradingworld/analysis-engine";
import type { Timeframe, Instrument } from "@tradingworld/shared";
import type { MarketDataProvider, CandleUpdate, ProviderStatus } from "./types.js";

const TF_MAP: Partial<Record<Timeframe, string>> = {
  "1m": "1min", "5m": "5min", "15m": "15min", "30m": "30min", "1h": "1h", "2h": "2h", "4h": "4h", "1d": "1day", "1w": "1week", "1M": "1month",
};

/**
 * Twelve Data — licensed forex / metals / indices / stocks (REST). Requires TWELVEDATA_API_KEY.
 * Live updates: polling fallback (WebSocket tier is plan-dependent). See docs/03-data-providers.md.
 */
export class TwelveDataProvider implements MarketDataProvider {
  readonly id = "twelvedata" as const;
  private lastUpdate?: number;
  constructor(private apiKey: string, private baseUrl = "https://api.twelvedata.com") {}

  supports(i: Instrument): boolean { return !!i.providerSymbols.twelvedata; }

  async getCandles(i: Instrument, tf: Timeframe, limit: number, to?: number): Promise<Candle[]> {
    const sym = i.providerSymbols.twelvedata;
    const interval = TF_MAP[tf];
    if (!sym || !interval) throw new Error(`TwelveData does not support ${i.symbol} ${tf}`);
    const url = new URL("/time_series", this.baseUrl);
    url.searchParams.set("symbol", sym);
    url.searchParams.set("interval", interval);
    url.searchParams.set("outputsize", String(Math.min(limit, 5000)));
    url.searchParams.set("timezone", "UTC");
    url.searchParams.set("apikey", this.apiKey);
    if (to) url.searchParams.set("end_date", new Date(to * 1000).toISOString().slice(0, 19).replace("T", " "));
    const res = await fetch(url);
    if (!res.ok) throw new Error(`TwelveData failed: ${res.status}`);
    const json = (await res.json()) as { values?: { datetime: string; open: string; high: string; low: string; close: string; volume?: string }[]; message?: string };
    if (!json.values) throw new Error(json.message ?? "TwelveData: no values");
    this.lastUpdate = Date.now();
    return json.values
      .map((v) => ({ time: Math.floor(Date.parse(v.datetime + "Z") / 1000), open: +v.open, high: +v.high, low: +v.low, close: +v.close, volume: v.volume ? +v.volume : undefined }))
      .sort((a, b) => a.time - b.time);
  }

  subscribe(i: Instrument, tf: Timeframe, onUpdate: (u: CandleUpdate) => void): () => void {
    const timer = setInterval(async () => {
      try {
        const [c] = (await this.getCandles(i, tf, 1)).slice(-1);
        if (c) onUpdate({ symbol: i.symbol, timeframe: tf, candle: c, closed: false, receivedAt: Date.now() });
      } catch { /* keep polling */ }
    }, 15_000);
    return () => clearInterval(timer);
  }

  status(): ProviderStatus {
    return { id: this.id, live: !!this.lastUpdate && Date.now() - this.lastUpdate < 60_000, lastUpdate: this.lastUpdate };
  }
}
