import type { Candle, Regime, StructureState } from "../types.js";
import { sma } from "../indicators.js";

/**
 * Market regime from (a) structure sequence, (b) ATR vs its long-run mean, (c) recent range width.
 * The regime modulates scoring (e.g. displacement zones are more meaningful in expansion).
 */
export function detectRegime(candles: Candle[], atrSeries: number[], structure: StructureState): Regime {
  const n = candles.length;
  const atr = atrSeries[n - 1] || 1;
  const longAtr = sma(atrSeries, Math.min(100, n))[n - 1] || atr;
  const atrRatio = atr / (longAtr || atr);

  const recentEvents = structure.events.filter((e) => e.index >= n - 40);
  const bulls = recentEvents.filter((e) => e.direction === "bullish").length;
  const bears = recentEvents.length - bulls;
  const chochs = recentEvents.filter((e) => e.kind === "CHoCH").length;

  const window = candles.slice(-40);
  const hi = Math.max(...window.map((c) => c.high));
  const lo = Math.min(...window.map((c) => c.low));
  const rangeWidthAtr = (hi - lo) / atr;

  let trend: Regime["trend"] = "RANGING";
  if (chochs <= 1 && bulls >= 2 && bulls > bears) trend = "TRENDING_UP";
  else if (chochs <= 1 && bears >= 2 && bears > bulls) trend = "TRENDING_DOWN";
  else if (rangeWidthAtr > 12 && structure.trend !== "neutral") trend = structure.trend === "bullish" ? "TRENDING_UP" : "TRENDING_DOWN";

  const volatility: Regime["volatility"] = atrRatio >= 1.3 ? "HIGH" : atrRatio <= 0.75 ? "LOW" : "NORMAL";

  const last10 = candles.slice(-10);
  const last10Range = (Math.max(...last10.map((c) => c.high)) - Math.min(...last10.map((c) => c.low))) / atr;
  let phase: Regime["phase"] = "NEUTRAL";
  if (atrRatio >= 1.2 && last10Range >= 4) phase = "EXPANSION";
  else if (atrRatio <= 0.85 && last10Range <= 2.5) phase = "CONSOLIDATION";

  return { trend, volatility, phase, atr, atrRatio, rangeWidthAtr };
}
