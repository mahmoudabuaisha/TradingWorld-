import type { Candle, Swing } from "../types.js";

/**
 * Fractal swing detection. A candle is a swing high when its high is strictly greater than
 * the highs of `lookback` candles on both sides (symmetric for lows).
 * The last `lookback` candles cannot be confirmed yet — this is deliberate: no repainting.
 */
export function detectSwings(candles: Candle[], lookback = 3): Swing[] {
  const swings: Swing[] = [];
  for (let i = lookback; i < candles.length - lookback; i++) {
    const c = candles[i]!;
    let isHigh = true;
    let isLow = true;
    for (let k = 1; k <= lookback; k++) {
      const l = candles[i - k]!;
      const r = candles[i + k]!;
      if (!(c.high > l.high && c.high > r.high)) isHigh = false;
      if (!(c.low < l.low && c.low < r.low)) isLow = false;
      if (!isHigh && !isLow) break;
    }
    if (isHigh) swings.push({ index: i, time: c.time, price: c.high, kind: "high" });
    if (isLow) swings.push({ index: i, time: c.time, price: c.low, kind: "low" });
  }
  return swings;
}
