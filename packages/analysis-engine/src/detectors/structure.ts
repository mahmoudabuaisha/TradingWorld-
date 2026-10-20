import type { Candle, StructureEvent, StructureState, Swing, Bias } from "../types.js";

/**
 * Market structure from confirmed swings.
 * - Close above the last confirmed swing high while trend is bullish/neutral → BOS (bullish).
 * - Close above the last swing high while trend is bearish → CHoCH (bullish).
 * Mirror logic for lows. Only candle CLOSES break structure (wicks are liquidity, not structure).
 */
export function detectStructure(candles: Candle[], swings: Swing[]): StructureState {
  const events: StructureEvent[] = [];
  let trend: Bias = "neutral";
  let lastHigh: Swing | undefined;
  let lastLow: Swing | undefined;
  let pendingHigh: Swing | undefined; // the swing high currently acting as resistance
  let pendingLow: Swing | undefined;

  let swingPtr = 0;
  for (let i = 0; i < candles.length; i++) {
    // activate swings once they are confirmed (index + lookback already passed is guaranteed by detector)
    while (swingPtr < swings.length && swings[swingPtr]!.index <= i) {
      const s = swings[swingPtr]!;
      if (s.kind === "high") {
        lastHigh = s;
        pendingHigh = s;
      } else {
        lastLow = s;
        pendingLow = s;
      }
      swingPtr++;
    }
    const c = candles[i]!;
    if (pendingHigh && c.close > pendingHigh.price && i > pendingHigh.index) {
      const kind = trend === "bearish" ? "CHoCH" : "BOS";
      events.push({
        id: `st-${i}-up`,
        kind,
        direction: "bullish",
        index: i,
        time: c.time,
        level: pendingHigh.price,
        swingIndex: pendingHigh.index,
      });
      trend = "bullish";
      pendingHigh = undefined;
    }
    if (pendingLow && c.close < pendingLow.price && i > pendingLow.index) {
      const kind = trend === "bullish" ? "CHoCH" : "BOS";
      events.push({
        id: `st-${i}-dn`,
        kind,
        direction: "bearish",
        index: i,
        time: c.time,
        level: pendingLow.price,
        swingIndex: pendingLow.index,
      });
      trend = "bearish";
      pendingLow = undefined;
    }
  }
  return { trend, swings, events, lastSwingHigh: lastHigh, lastSwingLow: lastLow };
}

/** Bias from recent structure: last two events + trend. */
export function structureBias(state: StructureState): Bias {
  const recent = state.events.slice(-3);
  if (recent.length === 0) return "neutral";
  const bulls = recent.filter((e) => e.direction === "bullish").length;
  const bears = recent.length - bulls;
  if (bulls > bears) return "bullish";
  if (bears > bulls) return "bearish";
  return state.trend;
}
