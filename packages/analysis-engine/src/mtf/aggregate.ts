import type { Candle } from "../types.js";
import { TIMEFRAME_SECONDS, type Timeframe } from "@tradingworld/shared";

/** Bucket start for a timestamp. Weeks start Monday 00:00 UTC; months on the 1st. */
export function bucketStart(time: number, tf: Timeframe): number {
  if (tf === "1w") return Math.floor((time + 4 * 86400) / 604800) * 604800 - 4 * 86400;
  if (tf === "1M") {
    const d = new Date(time * 1000);
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1) / 1000;
  }
  const s = TIMEFRAME_SECONDS[tf];
  return Math.floor(time / s) * s;
}

/** Resample candles to a higher timeframe. Input must be sorted ascending. */
export function aggregate(candles: Candle[], to: Timeframe): Candle[] {
  const out: Candle[] = [];
  let cur: Candle | undefined;
  let curKey = -1;
  for (const c of candles) {
    const key = bucketStart(c.time, to);
    if (!cur || key !== curKey) {
      if (cur) out.push(cur);
      cur = { time: key, open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume ?? 0 };
      curKey = key;
    } else {
      cur.high = Math.max(cur.high, c.high);
      cur.low = Math.min(cur.low, c.low);
      cur.close = c.close;
      cur.volume = (cur.volume ?? 0) + (c.volume ?? 0);
    }
  }
  if (cur) out.push(cur);
  return out;
}

export function canAggregate(from: Timeframe, to: Timeframe): boolean {
  return TIMEFRAME_SECONDS[to] > TIMEFRAME_SECONDS[from];
}
