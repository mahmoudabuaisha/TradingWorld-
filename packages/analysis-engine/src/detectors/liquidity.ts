import type { Candle, LiquidityPool, Swing, Sweep, Displacement } from "../types.js";
import type { Timeframe } from "@tradingworld/shared";

/**
 * Equal highs / equal lows: clusters of swing points within `tol` (ATR multiples).
 * Resting liquidity sits just beyond these levels (stops of counter-positioned traders).
 */
export function detectEqualLevels(swings: Swing[], atr: number, tolAtr = 0.15, timeframe: Timeframe): LiquidityPool[] {
  const tol = atr * tolAtr;
  const pools: LiquidityPool[] = [];
  for (const kind of ["high", "low"] as const) {
    const pts = swings.filter((s) => s.kind === kind);
    const used = new Set<number>();
    for (let i = 0; i < pts.length; i++) {
      if (used.has(i)) continue;
      const cluster = [pts[i]!];
      for (let j = i + 1; j < pts.length; j++) {
        if (used.has(j)) continue;
        if (Math.abs(pts[j]!.price - pts[i]!.price) <= tol) { cluster.push(pts[j]!); used.add(j); }
      }
      if (cluster.length >= 2) {
        used.add(i);
        const price = kind === "high" ? Math.max(...cluster.map((p) => p.price)) : Math.min(...cluster.map((p) => p.price));
        pools.push({
          id: `${kind === "high" ? "eqh" : "eql"}-${cluster[0]!.index}`,
          kind: kind === "high" ? "EQH" : "EQL",
          side: kind === "high" ? "buy-side" : "sell-side",
          price,
          touches: cluster.length,
          indices: cluster.map((p) => p.index),
          swept: false,
          label: kind === "high" ? `Equal Highs ×${cluster.length}` : `Equal Lows ×${cluster.length}`,
          timeframe,
        });
      }
    }
  }
  return pools;
}

/** Latest few unbroken swing highs/lows are themselves liquidity (single-touch pools, lower weight). */
export function swingLiquidity(swings: Swing[], candles: Candle[], timeframe: Timeframe, maxPerSide = 3): LiquidityPool[] {
  const last = candles[candles.length - 1]!;
  const highs = swings.filter((s) => s.kind === "high" && s.price > last.close).slice(-maxPerSide);
  const lows = swings.filter((s) => s.kind === "low" && s.price < last.close).slice(-maxPerSide);
  const mk = (s: Swing): LiquidityPool => ({
    id: `sw-${s.kind[0]}-${s.index}`,
    kind: s.kind === "high" ? "SWING_HIGH" : "SWING_LOW",
    side: s.kind === "high" ? "buy-side" : "sell-side",
    price: s.price,
    touches: 1,
    indices: [s.index],
    swept: false,
    label: s.kind === "high" ? "Swing High" : "Swing Low",
    timeframe,
  });
  return [...highs.map(mk), ...lows.map(mk)];
}

/**
 * Sweep: price wicks THROUGH a pool level and the candle closes back on the original side.
 * A sweep followed by displacement in the opposite direction is the strongest reversal signature.
 */
export function detectSweeps(candles: Candle[], pools: LiquidityPool[], displacements: Displacement[]): Sweep[] {
  const sweeps: Sweep[] = [];
  for (const p of pools) {
    const start = Math.max(...p.indices) + 1;
    for (let i = start; i < candles.length; i++) {
      const c = candles[i]!;
      if (p.side === "buy-side" && c.high > p.price) {
        const reclaimed = c.close < p.price;
        const dispAfter = displacements.some((d) => d.direction === "bearish" && d.index >= i && d.index <= i + 3);
        sweeps.push({ id: `sw-${p.id}-${i}`, poolId: p.id, poolKind: p.kind, index: i, time: c.time, side: "buy-side", level: p.price, wickExtreme: c.high, reclaimed, displacementAfter: dispAfter });
        p.swept = true; p.sweptIndex = i;
        break;
      }
      if (p.side === "sell-side" && c.low < p.price) {
        const reclaimed = c.close > p.price;
        const dispAfter = displacements.some((d) => d.direction === "bullish" && d.index >= i && d.index <= i + 3);
        sweeps.push({ id: `sw-${p.id}-${i}`, poolId: p.id, poolKind: p.kind, index: i, time: c.time, side: "sell-side", level: p.price, wickExtreme: c.low, reclaimed, displacementAfter: dispAfter });
        p.swept = true; p.sweptIndex = i;
        break;
      }
    }
  }
  return sweeps;
}
