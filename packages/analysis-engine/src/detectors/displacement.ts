import type { Candle, Displacement } from "../types.js";

/**
 * Displacement = an impulsive candle: body ≥ `mult` × ATR and body ≥ 60% of its range.
 * Strong displacement is the signature of institutional participation and typically leaves an FVG.
 */
export function detectDisplacements(candles: Candle[], atrSeries: number[], mult = 1.5): Displacement[] {
  const out: Displacement[] = [];
  for (let i = 1; i < candles.length; i++) {
    const c = candles[i]!;
    const atr = atrSeries[i - 1] || 1;
    const body = Math.abs(c.close - c.open);
    const range = c.high - c.low || 1e-9;
    const bodyAtr = body / atr;
    const bodyRatio = body / range;
    if (bodyAtr >= mult && bodyRatio >= 0.6) {
      out.push({ id: `disp-${i}`, index: i, time: c.time, direction: c.close > c.open ? "bullish" : "bearish", bodyAtr, bodyRatio });
    }
  }
  return out;
}
