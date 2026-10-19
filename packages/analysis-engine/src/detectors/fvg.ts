import type { Candle, FairValueGap } from "../types.js";

/**
 * Fair Value Gap / imbalance: a three-candle pattern where candle[i-2].high < candle[i].low (bullish)
 * or candle[i-2].low > candle[i].high (bearish). The middle candle is the displacement candle.
 * Mitigation is tracked forward: a gap is "filled" by the ratio of its height later traded through.
 */
export function detectFVGs(candles: Candle[], atrSeries: number[], minSizeAtr = 0.3): FairValueGap[] {
  const out: FairValueGap[] = [];
  for (let i = 2; i < candles.length; i++) {
    const a = candles[i - 2]!;
    const c = candles[i]!;
    const atr = atrSeries[i - 1] || 1;
    if (c.low > a.high) {
      const size = c.low - a.high;
      if (size / atr >= minSizeAtr) out.push(makeGap("bullish", i - 1, candles[i - 1]!.time, c.low, a.high, size, size / atr));
    } else if (c.high < a.low) {
      const size = a.low - c.high;
      if (size / atr >= minSizeAtr) out.push(makeGap("bearish", i - 1, candles[i - 1]!.time, a.low, c.high, size, size / atr));
    }
  }
  // forward mitigation
  for (const g of out) {
    let deepest = g.direction === "bullish" ? g.top : g.bottom;
    for (let j = g.index + 2; j < candles.length; j++) {
      const c = candles[j]!;
      if (g.direction === "bullish") {
        if (c.low < deepest) deepest = c.low;
        if (c.low <= g.bottom) { g.mitigated = true; g.mitigatedIndex = j; g.fillRatio = 1; break; }
      } else {
        if (c.high > deepest) deepest = c.high;
        if (c.high >= g.top) { g.mitigated = true; g.mitigatedIndex = j; g.fillRatio = 1; break; }
      }
    }
    if (!g.mitigated) {
      g.fillRatio = g.direction === "bullish"
        ? Math.min(1, Math.max(0, (g.top - deepest) / g.size))
        : Math.min(1, Math.max(0, (deepest - g.bottom) / g.size));
    }
  }
  return out;
}

function makeGap(direction: FairValueGap["direction"], index: number, time: number, top: number, bottom: number, size: number, sizeAtr: number): FairValueGap {
  return { id: `fvg-${direction[0]}-${index}`, direction, index, time, top, bottom, size, sizeAtr, mitigated: false, fillRatio: 0 };
}
