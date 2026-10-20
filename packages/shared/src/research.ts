/**
 * Research vocabulary shared by the engine's consumers (API, web, ML export).
 * FACTOR_KEYS mirrors the engine's FactorKey union (the engine test asserts they stay identical).
 */
export const FACTOR_KEYS = [
  "HTF_LEVEL",
  "LIQUIDITY_SWEEP",
  "STRUCTURE_SHIFT",
  "DISPLACEMENT",
  "FVG",
  "ORDER_BLOCK",
  "HTF_BIAS_ALIGN",
  "SESSION_RELEVANCE",
  "VOLATILITY_CONDITION",
  "FRESH",
] as const;
export type FactorKeyName = (typeof FACTOR_KEYS)[number];

/**
 * Stable identity of a market zone across analysis windows (engine ids like `z-5m-fvg-412-0` are window-local).
 * Used by the outcome tracker (AI-01) and user feedback (AI-02), on the server and in the browser.
 */
export function zoneTrackKey(
  ctx: { symbol: string; timeframe: string; engineVersion: string; scoringVersion: string },
  zone: { origin: string; direction: string; createdTime: number },
): string {
  return `${ctx.symbol}:${ctx.timeframe}:${zone.origin}:${zone.direction}:${zone.createdTime}:${ctx.engineVersion}:${ctx.scoringVersion}`;
}

export const FEEDBACK_COMMENT_MAX = 280;
