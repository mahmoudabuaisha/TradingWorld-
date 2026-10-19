/**
 * Canonical timeframe definitions used across the platform.
 * Every engine, provider adapter and UI component must speak this vocabulary.
 */
export const TIMEFRAMES = [
  "1m", "3m", "5m", "15m", "30m",
  "1h", "2h", "4h", "12h",
  "1d", "1w", "1M",
] as const;

export type Timeframe = (typeof TIMEFRAMES)[number];

/** Timeframe → duration in seconds (1M approximated as 30 days for math; aggregation handles months by calendar). */
export const TIMEFRAME_SECONDS: Record<Timeframe, number> = {
  "1m": 60,
  "3m": 180,
  "5m": 300,
  "15m": 900,
  "30m": 1800,
  "1h": 3600,
  "2h": 7200,
  "4h": 14400,
  "12h": 43200,
  "1d": 86400,
  "1w": 604800,
  "1M": 2592000,
};

export function isTimeframe(v: string): v is Timeframe {
  return (TIMEFRAMES as readonly string[]).includes(v);
}

/** Higher timeframes that the engine consults for a given base timeframe (ordered high → low). */
export const MTF_CONTEXT: Record<Timeframe, Timeframe[]> = {
  "1m": ["1d", "4h", "1h", "15m", "5m"],
  "3m": ["1d", "4h", "1h", "15m"],
  "5m": ["1d", "4h", "1h", "15m"],
  "15m": ["1w", "1d", "4h", "1h"],
  "30m": ["1w", "1d", "4h", "1h"],
  "1h": ["1w", "1d", "4h"],
  "2h": ["1w", "1d", "4h"],
  "4h": ["1M", "1w", "1d"],
  "12h": ["1M", "1w", "1d"],
  "1d": ["1M", "1w"],
  "1w": ["1M"],
  "1M": [],
};
