import type { Candle } from "@tradingworld/analysis-engine";
import type { Timeframe, Instrument } from "@tradingworld/shared";

export interface ProviderStatus {
  id: string;
  live: boolean;
  lastUpdate?: number;
  message?: string;
}

export interface CandleUpdate {
  symbol: string;
  timeframe: Timeframe;
  candle: Candle;
  /** true when this update closed the candle */
  closed: boolean;
  receivedAt: number; // ms
}

/**
 * Every market-data source implements this interface. Swapping providers never touches
 * the engine, the API routes or the UI. Licensing notes live in docs/03-data-providers.md.
 */
export interface MarketDataProvider {
  readonly id: "demo" | "binance" | "twelvedata";
  supports(instrument: Instrument): boolean;
  getCandles(instrument: Instrument, timeframe: Timeframe, limit: number, to?: number): Promise<Candle[]>;
  subscribe(instrument: Instrument, timeframe: Timeframe, onUpdate: (u: CandleUpdate) => void): () => void;
  status(): ProviderStatus;
}
