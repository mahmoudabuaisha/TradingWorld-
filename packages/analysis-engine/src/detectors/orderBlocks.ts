import type { Candle, Displacement, OrderBlock } from "../types.js";

/**
 * Order block = the last opposite-colour candle immediately before a displacement move.
 * Bullish OB: last bearish candle (within 3 bars) before a bullish displacement.
 * The zone spans the candle's full range. Mitigated once price trades back through it.
 */
export function detectOrderBlocks(candles: Candle[], displacements: Displacement[]): OrderBlock[] {
  const out: OrderBlock[] = [];
  const seen = new Set<number>();
  for (const d of displacements) {
    for (let k = d.index - 1; k >= Math.max(0, d.index - 3); k--) {
      const c = candles[k]!;
      const opposite = d.direction === "bullish" ? c.close < c.open : c.close > c.open;
      if (!opposite) continue;
      if (seen.has(k)) break;
      seen.add(k);
      const ob: OrderBlock = {
        id: `ob-${d.direction[0]}-${k}`,
        direction: d.direction,
        index: k,
        time: c.time,
        top: c.high,
        bottom: c.low,
        displacementIndex: d.index,
        mitigated: false,
      };
      for (let j = d.index + 1; j < candles.length; j++) {
        const x = candles[j]!;
        const hit = d.direction === "bullish" ? x.low <= ob.top : x.high >= ob.bottom;
        if (hit) {
          const through = d.direction === "bullish" ? x.close < ob.bottom : x.close > ob.top;
          if (through) {
            ob.mitigated = true;
            ob.mitigatedIndex = j;
            break;
          }
        }
      }
      out.push(ob);
      break;
    }
  }
  return out;
}
