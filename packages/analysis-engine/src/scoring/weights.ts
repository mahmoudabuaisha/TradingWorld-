import type { FactorKey } from "../types.js";

/**
 * SCORING_V1 — explainable additive weights. Sum of all weights = 100.
 * Every change here must bump SCORING_VERSION and be recorded in PROGRESS.md.
 * ML (services/ml) may later propose new weights; they are only adopted after
 * out-of-sample validation and are deployed as a NEW version, never silently.
 */
export const FACTOR_WEIGHTS: Record<FactorKey, number> = {
  HTF_LEVEL: 18,
  LIQUIDITY_SWEEP: 16,
  STRUCTURE_SHIFT: 15,
  DISPLACEMENT: 13,
  FVG: 10,
  ORDER_BLOCK: 8,
  HTF_BIAS_ALIGN: 7,
  SESSION_RELEVANCE: 5,
  FRESH: 5,
  VOLATILITY_CONDITION: 3,
};

export const FACTOR_LABELS: Record<FactorKey, { ar: string; en: string }> = {
  HTF_LEVEL: { ar: "مستوى فريم أعلى", en: "Higher-timeframe level" },
  LIQUIDITY_SWEEP: { ar: "سحب سيولة", en: "Liquidity sweep" },
  STRUCTURE_SHIFT: { ar: "تغير في البنية (BOS/CHoCH)", en: "Market structure shift (BOS/CHoCH)" },
  DISPLACEMENT: { ar: "حركة اندفاعية (Displacement)", en: "Displacement" },
  FVG: { ar: "فجوة قيمة عادلة (FVG)", en: "Fair value gap" },
  ORDER_BLOCK: { ar: "Order Block", en: "Order block" },
  HTF_BIAS_ALIGN: { ar: "توافق مع اتجاه الفريمات الأعلى", en: "Aligned with higher-timeframe bias" },
  SESSION_RELEVANCE: { ar: "ظهرت في جلسة نشطة", en: "Formed during an active session" },
  FRESH: { ar: "منطقة غير مختبرة", en: "Untested (fresh) zone" },
  VOLATILITY_CONDITION: { ar: "ظروف التقلب مناسبة", en: "Supportive volatility conditions" },
};

export const QUALITY_THRESHOLDS = { HIGH: 72, MEDIUM: 52 } as const;
