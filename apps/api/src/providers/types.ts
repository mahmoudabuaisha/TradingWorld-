import type { Candle } from "@tradingworld/analysis-engine";
import type { Timeframe, Instrument, ProviderId, ProviderStatus } from "@tradingworld/shared";

export type { ProviderId, ProviderStatus, FeedState, FeedStatus, FeedTransport } from "@tradingworld/shared";

export interface CandleUpdate {
  symbol: string;
  timeframe: Timeframe;
  candle: Candle;
  /** true when the candle in this update is final (its bucket has ended) */
  closed: boolean;
  /** ms — when the update reached this process */
  receivedAt: number;
  /** s — event time of the datum behind this update (tick time, bar time, …) */
  eventTime?: number;
}

export interface LastSeen {
  receivedAt: number;
  eventTime: number;
}

/**
 * Every market-data source implements this interface. Swapping providers never touches the engine,
 * the API routes or the UI. Licensing and plan notes live in docs/03-data-providers.md.
 */
export interface MarketDataProvider {
  readonly id: ProviderId;
  supports(instrument: Instrument): boolean;
  getCandles(instrument: Instrument, timeframe: Timeframe, limit: number, to?: number): Promise<Candle[]>;
  subscribe(instrument: Instrument, timeframe: Timeframe, onUpdate: (u: CandleUpdate) => void): () => void;
  status(): ProviderStatus;
  /** latest datum seen for one symbol (used for per-instrument feed state) */
  lastSeen?(symbol: string): LastSeen | undefined;
}
