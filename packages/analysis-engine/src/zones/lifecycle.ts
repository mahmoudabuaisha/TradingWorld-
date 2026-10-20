import type { Candle, Zone, ZoneStatus } from "../types.js";

/**
 * Zone lifecycle, replayed deterministically from the candles after creation.
 * DETECTED → CONFIRMED → ACTIVE → TESTED → REACTED → WEAKENED → INVALIDATED
 * Invalidation = a candle CLOSE beyond the far boundary (wicks through are a test, not an invalidation).
 * `status` is the zone's state at the end of the series; `reacted`/`reactedIndex` record whether a reaction
 * happened at any point, so a replay can tell "reacted, then broken later" apart from "never reacted".
 */
export interface LifecycleResult {
  status: ZoneStatus;
  tests: number;
  /** Index of the first / last candle that touched the zone (relative to `candles`). */
  firstTestIndex?: number;
  lastTestIndex?: number;
  /** True if, after a test, price closed ≥ 1 ATR away from the zone — even if the zone was invalidated later. */
  reacted: boolean;
  reactedIndex?: number;
  invalidatedIndex?: number;
}

export function evaluateLifecycle(zone: Zone, candles: Candle[], atr: number): LifecycleResult {
  const confirmed = zone.factors.some((f) => f.present && (f.key === "STRUCTURE_SHIFT" || f.key === "DISPLACEMENT"));
  let status: ZoneStatus = confirmed ? "CONFIRMED" : "DETECTED";
  let tests = 0;
  let firstTestIndex: number | undefined;
  let lastTestIndex: number | undefined;
  let inside = false;
  let reacted = false;
  let reactedIndex: number | undefined;

  const start = Math.max(zone.createdIndex + 1, 0);
  for (let i = start; i < candles.length; i++) {
    const c = candles[i]!;
    const overlaps = c.low <= zone.top && c.high >= zone.bottom;
    const closedThrough = zone.direction === "bullish" ? c.close < zone.bottom : c.close > zone.top;
    if (closedThrough) {
      return { status: "INVALIDATED", tests, firstTestIndex, lastTestIndex, reacted, reactedIndex, invalidatedIndex: i };
    }
    if (overlaps) {
      if (!inside) {
        tests++;
        lastTestIndex = i;
        firstTestIndex ??= i;
        inside = true;
      }
    } else {
      inside = false;
      if (tests > 0 && lastTestIndex !== undefined) {
        const away = zone.direction === "bullish" ? c.close - zone.top : zone.bottom - c.close;
        if (away >= atr && !reacted) {
          reacted = true;
          reactedIndex = i;
        }
      }
    }
  }

  if (tests >= 3) status = "WEAKENED";
  else if (reacted) status = "REACTED";
  else if (tests > 0) status = "TESTED";
  else if (confirmed) {
    const last = candles[candles.length - 1];
    if (last) {
      // no candles after creation yet → stays CONFIRMED
      const away = zone.direction === "bullish" ? last.close - zone.top : zone.bottom - last.close;
      status = away > 0 ? "ACTIVE" : "CONFIRMED";
    }
  }
  return { status, tests, firstTestIndex, lastTestIndex, reacted, reactedIndex };
}
