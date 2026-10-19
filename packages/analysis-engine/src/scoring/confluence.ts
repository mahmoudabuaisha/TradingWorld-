import type { Factor, FactorKey, ZoneQuality } from "../types.js";
import { FACTOR_WEIGHTS, FACTOR_LABELS, QUALITY_THRESHOLDS } from "./weights.js";

export function makeFactor(key: FactorKey, present: boolean, evidence?: { ar: string; en: string }): Factor {
  const weight = FACTOR_WEIGHTS[key];
  return { key, present, weight, contribution: present ? weight : 0, label: FACTOR_LABELS[key], evidence };
}

export function scoreFactors(factors: Factor[]): number {
  const total = factors.reduce((s, f) => s + f.contribution, 0);
  return Math.max(0, Math.min(100, Math.round(total)));
}

export function qualityFromScore(score: number): ZoneQuality {
  if (score >= QUALITY_THRESHOLDS.HIGH) return "HIGH";
  if (score >= QUALITY_THRESHOLDS.MEDIUM) return "MEDIUM";
  return "LOW";
}
