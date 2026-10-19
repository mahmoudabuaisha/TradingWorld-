/**
 * Feed vocabulary shared by the API and the web. The platform never shows a price without saying
 * where it came from and how fresh it is (docs/03-data-providers.md).
 */
export type ProviderId = "demo" | "binance" | "twelvedata" | "polygon";

/** How the latest data reached us. */
export type FeedTransport = "ws" | "poll" | "synthetic";

/**
 * LIVE     – a streaming source is delivering within the expected latency
 * DELAYED  – data flows, but by polling or with a plan-level delay (the delay is shown)
 * STALE    – the market is open but nothing arrived inside the staleness window
 * CLOSED   – the market is closed for this instrument: the last candle is final, not stale
 * OFFLINE  – no configured source succeeded (last request failed, key missing, …)
 */
export type FeedState = "LIVE" | "DELAYED" | "STALE" | "CLOSED" | "OFFLINE";

export interface RateBudgetSnapshot {
  used: number;
  limit: number;
  windowSeconds: number;
  resetInSeconds: number;
  /** callers currently waiting for a free slot */
  waiting: number;
}

export interface ProviderStatus {
  id: ProviderId;
  /** kept for older clients: true while data is flowing (LIVE or DELAYED) */
  live: boolean;
  state: FeedState;
  transport: FeedTransport;
  /** data licensed for commercial display (per docs/03) */
  licensed: boolean;
  plan?: string;
  /** ms — when anything was last received from this source */
  lastUpdate?: number;
  /** s — event / exchange time of the latest datum */
  lastEventTime?: number;
  /** ms — receivedAt − eventTime of the latest datum */
  latencyMs?: number;
  pollSeconds?: number;
  budget?: RateBudgetSnapshot;
  message?: string;
}

/** Feed state for one instrument: the provider status combined with that instrument's market calendar. */
export interface FeedStatus {
  symbol: string;
  provider: ProviderId;
  state: FeedState;
  transport: FeedTransport;
  licensed: boolean;
  marketOpen: boolean;
  /** s */
  lastEventTime?: number;
  /** ms */
  receivedAt?: number;
  /** s — since the last successful receipt (now − receivedAt) */
  ageSeconds?: number;
  /** s — expected delay (poll interval or plan delay) */
  delaySeconds?: number;
  message?: string;
}

export const FEED_LABELS: Record<FeedState, { ar: string; en: string }> = {
  LIVE: { ar: "مباشر", en: "Live" },
  DELAYED: { ar: "متأخر", en: "Delayed" },
  STALE: { ar: "متوقف", en: "Stale" },
  CLOSED: { ar: "السوق مغلق", en: "Market closed" },
  OFFLINE: { ar: "غير متصل", en: "Offline" },
};
