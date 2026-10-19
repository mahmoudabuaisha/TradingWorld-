import type { Factor, Zone, ZoneExplanation, Direction, Regime, Bias, AnalysisResult } from "../types.js";
import type { Timeframe } from "@tradingworld/shared";

/**
 * Deterministic explainer: converts structured factors into human-readable reasons.
 * No LLM is involved here — the LLM (explain/llm.ts) only rephrases/answers questions
 * on top of this structured data and is never allowed to invent factors.
 */
export function explainZone(
  direction: Direction,
  timeframe: Timeframe,
  top: number,
  bottom: number,
  factors: Factor[],
  tests: number,
  precision: number,
): ZoneExplanation {
  const present = factors.filter((f) => f.present);
  const absent = factors.filter((f) => !f.present);
  const fmt = (n: number) => n.toFixed(precision);

  const reasons = present.map((f) => f.evidence ?? f.label);
  const weaknesses: { ar: string; en: string }[] = [];
  for (const f of absent) {
    if (["HTF_LEVEL", "LIQUIDITY_SWEEP", "STRUCTURE_SHIFT", "DISPLACEMENT"].includes(f.key)) {
      weaknesses.push({ ar: `لا يوجد ${f.label.ar} يدعم المنطقة.`, en: `No ${f.label.en.toLowerCase()} supports this zone.` });
    }
  }
  if (tests >= 2) weaknesses.push({ ar: `تم اختبار المنطقة ${tests} مرات، وكل اختبار يستهلك جزءًا من الأوامر المتبقية فيها.`, en: `The zone has been tested ${tests} times; each test consumes resting orders.` });

  const invalidation = direction === "bullish"
    ? { ar: `إغلاق شمعة ${timeframe} تحت ${fmt(bottom)} يلغي المنطقة.`, en: `A ${timeframe} candle close below ${fmt(bottom)} invalidates the zone.` }
    : { ar: `إغلاق شمعة ${timeframe} فوق ${fmt(top)} يلغي المنطقة.`, en: `A ${timeframe} candle close above ${fmt(top)} invalidates the zone.` };

  const count = present.length;
  const summary = {
    ar: `صُنفت المنطقة بناءً على اجتماع ${count} عوامل مستقلة: ${present.map((f) => f.label.ar).join("، ")}.`,
    en: `The zone was classified from ${count} independent factors: ${present.map((f) => f.label.en.toLowerCase()).join(", ")}.`,
  };
  return { summary, reasons, weaknesses, invalidation };
}

export function describeRegime(r: Regime): { ar: string; en: string } {
  const trend = { TRENDING_UP: ["اتجاه صاعد", "Trending up"], TRENDING_DOWN: ["اتجاه هابط", "Trending down"], RANGING: ["نطاق عرضي", "Ranging"] }[r.trend];
  const vol = { HIGH: ["تقلب مرتفع", "high volatility"], NORMAL: ["تقلب طبيعي", "normal volatility"], LOW: ["تقلب منخفض", "low volatility"] }[r.volatility];
  const phase = { EXPANSION: ["توسع", "expansion"], CONSOLIDATION: ["تجميع/ضغط", "consolidation"], NEUTRAL: ["محايد", "neutral phase"] }[r.phase];
  return { ar: `${trend[0]} · ${vol[0]} · ${phase[0]}`, en: `${trend[1]} · ${vol[1]} · ${phase[1]}` };
}

export function biasLabel(b: Bias): { ar: string; en: string } {
  return { bullish: { ar: "صاعد", en: "Bullish" }, bearish: { ar: "هابط", en: "Bearish" }, neutral: { ar: "محايد", en: "Neutral" } }[b];
}

/** Narrative for the side panel / AI chat grounding. */
export function narrative(result: Omit<AnalysisResult, "narrative" | "disclaimer">, precision = 2): { ar: string; en: string } {
  const fmt = (n: number) => n.toFixed(precision);
  const regime = describeRegime(result.base.regime);
  const htf = result.htf.map((h) => `${h.timeframe}: ${biasLabel(h.bias).en}`).join(" · ");
  const htfAr = result.htf.map((h) => `${h.timeframe}: ${biasLabel(h.bias).ar}`).join(" · ");
  const sweeps = result.base.sweeps.filter((s) => s.reclaimed).slice(-1)[0];
  const sweepEn = sweeps ? `Most recent liquidity event: ${sweeps.side} sweep of ${sweeps.poolKind} at ${fmt(sweeps.level)}${sweeps.displacementAfter ? " followed by displacement" : ""}.` : "No recent liquidity sweep.";
  const sweepAr = sweeps ? `آخر حدث سيولة: سحب ${sweeps.side === "buy-side" ? "سيولة الشراء" : "سيولة البيع"} عند ${sweeps.level}${sweeps.displacementAfter ? " تبعه اندفاع" : ""}.` : "لا يوجد سحب سيولة حديث.";
  const z = result.zones[0];
  const zoneEn = z ? `Strongest zone: ${z.name} (${z.score}/100, ${z.status}).` : "No zone currently meets the quality threshold.";
  const zoneAr = z ? `أقوى منطقة: ${z.nameAr} (${z.score}/100، ${z.status}).` : "لا توجد منطقة تتجاوز حد الجودة حاليًا.";
  return {
    en: `${result.symbol} ${result.timeframe}: ${regime.en}. HTF context — ${htf}. Base-timeframe structure is ${result.base.bias}. ${sweepEn} ${zoneEn}`,
    ar: `${result.symbol} ${result.timeframe}: ${regime.ar}. سياق الفريمات الأعلى — ${htfAr}. بنية الفريم الحالي ${biasLabel(result.base.bias).ar}ة. ${sweepAr} ${zoneAr}`,
  };
}

export { type Zone };
