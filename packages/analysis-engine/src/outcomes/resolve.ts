import type { Candle, Zone, ZoneStatus } from "../types.js";
import { evaluateLifecycle } from "../zones/lifecycle.js";

/** Bump whenever the labelling rules below change; stored on every outcome so datasets never mix rules. */
export const OUTCOME_VERSION = "outcome-v1";

/**
 * REACTED     — after touching the zone, price closed ≥ 1 ATR away (even if the zone broke later)
 * INVALIDATED — a close through the far edge before any reaction
 * TESTED      — touched, no reaction, not broken within the horizon
 * UNTOUCHED   — never reached within the horizon
 */
export type OutcomeLabel = "REACTED" | "INVALIDATED" | "TESTED" | "UNTOUCHED";

export interface ZoneOutcomeResult {
  /** false while the zone is neither invalidated nor past the horizon — keep waiting */
  done: boolean;
  reason?: "invalidated" | "horizon";
  label: OutcomeLabel;
  /** the ML label reads REACTED here (services/ml/app/features.py); otherwise the lifecycle status at the end */
  finalStatus: ZoneStatus;
  /** max favourable / adverse excursion from the first touch up to the end (or the invalidation bar), in ATR; 0 when untouched */
  mfeAtr: number;
  maeAtr: number;
  /** furthest close away from the zone after the first touch, in ATR (what the reaction rule measures) */
  reactionAtr: number;
  retests: number;
  /** bars from detection to the deciding event: reaction, invalidation or the horizon */
  barsToOutcome: number;
  barsObserved: number;
  firstTestIndex?: number;
  reactedIndex?: number;
  invalidatedIndex?: number;
}

/**
 * Label one zone from the closed candles that came AFTER it was detected (no look-ahead: index 0 is the first
 * bar the detector could not have seen). Deterministic and pure — the same input always gives the same label.
 * Used by the live outcome tracker (AI-01) and the backtesting lab, so both speak the same language.
 */
export function resolveOutcome(zone: Pick<Zone, "direction" | "top" | "bottom" | "factors">, future: Candle[], atr: number, horizonBars: number): ZoneOutcomeResult {
  const window = future.slice(0, horizonBars);
  const safeAtr = atr > 0 ? atr : 1;
  const life = evaluateLifecycle({ ...(zone as Zone), createdIndex: -1 }, window, safeAtr);
  const end = life.invalidatedIndex ?? window.length - 1;

  let mfe = 0, mae = 0, reaction = 0;
  if (life.firstTestIndex !== undefined) {
    for (let j = life.firstTestIndex; j <= end; j++) {
      const c = window[j]!;
      mfe = Math.max(mfe, zone.direction === "bullish" ? c.high - zone.top : zone.bottom - c.low);
      mae = Math.max(mae, zone.direction === "bullish" ? zone.bottom - c.low : c.high - zone.top);
      reaction = Math.max(reaction, zone.direction === "bullish" ? c.close - zone.top : zone.bottom - c.close);
    }
  }

  const invalidated = life.status === "INVALIDATED";
  const done = invalidated || window.length >= horizonBars;
  const label: OutcomeLabel = life.reacted ? "REACTED" : invalidated ? "INVALIDATED" : life.tests > 0 ? "TESTED" : "UNTOUCHED";
  const deciding = life.reacted ? life.reactedIndex! : invalidated ? life.invalidatedIndex! : window.length - 1;
  return {
    done,
    reason: done ? (invalidated ? "invalidated" : "horizon") : undefined,
    label,
    finalStatus: life.reacted ? "REACTED" : life.status,
    mfeAtr: mfe / safeAtr,
    maeAtr: mae / safeAtr,
    reactionAtr: Math.max(0, reaction) / safeAtr,
    retests: life.tests,
    barsToOutcome: Math.max(0, deciding + 1),
    barsObserved: window.length,
    firstTestIndex: life.firstTestIndex,
    reactedIndex: life.reactedIndex,
    invalidatedIndex: life.invalidatedIndex,
  };
}
