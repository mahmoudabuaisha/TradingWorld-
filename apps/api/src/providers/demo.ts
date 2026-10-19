import { SyntheticMarket, mulberry32, hashSeed, type Candle } from "@tradingworld/analysis-engine";
import { TIMEFRAME_SECONDS, type Timeframe, type Instrument } from "@tradingworld/shared";
import type { MarketDataProvider, CandleUpdate, ProviderStatus } from "./types.js";

const START_PRICES: Record<string, { price: number; vol: number }> = {
  XAUUSD: { price: 2650, vol: 0.00045 },
  XAGUSD: { price: 31.2, vol: 0.0007 },
  EURUSD: { price: 1.085, vol: 0.00012 },
  GBPUSD: { price: 1.29, vol: 0.00014 },
  USDJPY: { price: 150.2, vol: 0.00013 },
  BTCUSD: { price: 67000, vol: 0.0009 },
  ETHUSD: { price: 2600, vol: 0.0011 },
  US100: { price: 20100, vol: 0.0004 },
  US500: { price: 5750, vol: 0.00035 },
  USOIL: { price: 72.5, vol: 0.0008 },
};

/**
 * Deterministic synthetic market: 60k 1-minute bars per symbol resampled to any timeframe,
 * plus a simulated live tick stream that mutates the current candle. No network, no key.
 */
export class DemoProvider implements MarketDataProvider {
  readonly id = "demo" as const;
  private market = new SyntheticMarket(60_000);
  private lastUpdate = Date.now();
  /** live overlay: symbol → in-progress candle per timeframe */
  private live = new Map<string, Candle>();
  private rnd = mulberry32(hashSeed("demo-live"));

  supports(): boolean { return true; }

  private params(i: Instrument) {
    return START_PRICES[i.symbol] ?? { price: 100, vol: 0.0005 };
  }

  async getCandles(i: Instrument, tf: Timeframe, limit: number, to?: number): Promise<Candle[]> {
    const { price, vol } = this.params(i);
    const series = this.market.candles(i.symbol, tf, price, vol, limit, to);
    const key = `${i.symbol}:${tf}`;
    const overlay = this.live.get(key);
    if (!to && overlay && series.length && overlay.time === series[series.length - 1]!.time) {
      return [...series.slice(0, -1), overlay];
    }
    return series;
  }

  subscribe(i: Instrument, tf: Timeframe, onUpdate: (u: CandleUpdate) => void): () => void {
    const key = `${i.symbol}:${tf}`;
    const step = TIMEFRAME_SECONDS[tf];
    const timer = setInterval(async () => {
      const series = await this.getCandles(i, tf, 2);
      const last = series[series.length - 1]!;
      const now = Math.floor(Date.now() / 1000);
      const bucket = Math.floor(now / step) * step;
      const sigma = last.close * this.params(i).vol * 0.35;
      const delta = (this.rnd() - 0.5) * 2 * sigma;
      let candle: Candle;
      let closed = false;
      if (bucket > last.time) {
        candle = { time: bucket, open: last.close, high: Math.max(last.close, last.close + delta), low: Math.min(last.close, last.close + delta), close: last.close + delta, volume: 10 };
        closed = true; // previous candle closed
      } else {
        const close = last.close + delta;
        candle = { ...last, close, high: Math.max(last.high, close), low: Math.min(last.low, close), volume: (last.volume ?? 0) + 5 };
      }
      this.live.set(key, candle);
      this.lastUpdate = Date.now();
      onUpdate({ symbol: i.symbol, timeframe: tf, candle, closed, receivedAt: Date.now() });
    }, 1000);
    return () => clearInterval(timer);
  }

  status(): ProviderStatus {
    return { id: this.id, live: true, lastUpdate: this.lastUpdate, message: "Synthetic demo data — not real market prices" };
  }
}
