import type { AnalysisResult, Zone } from "../types.js";

/**
 * Grounding payload + prompt for the LLM layer.
 * The LLM receives ONLY structured engine output and must answer from it.
 * This module has no SDK dependency so the engine stays pure; the API wires the actual client.
 */
export interface GroundingPayload {
  engineVersion: string;
  scoringVersion: string;
  symbol: string;
  timeframe: string;
  lastPrice: number;
  regime: AnalysisResult["base"]["regime"];
  htf: { timeframe: string; bias: string; regime: string; keyLevels: { label: string; price: number }[] }[];
  session: AnalysisResult["session"];
  structureEvents: { kind: string; direction: string; level: number; time: number }[];
  liquidity: { label: string; side: string; price: number; swept: boolean }[];
  sweeps: { side: string; level: number; reclaimed: boolean; displacementAfter: boolean; time: number }[];
  zones: {
    id: string; name: string; direction: string; top: number; bottom: number; score: number; quality: string; status: string; tests: number;
    factors: { key: string; present: boolean; contribution: number; evidence?: string }[];
    invalidation: number;
  }[];
  narrative: string;
}

export function buildGrounding(result: AnalysisResult, locale: "ar" | "en" = "en"): GroundingPayload {
  return {
    engineVersion: result.engineVersion,
    scoringVersion: result.scoringVersion,
    symbol: result.symbol,
    timeframe: result.timeframe,
    lastPrice: result.lastPrice,
    regime: result.base.regime,
    htf: result.htf.map((h) => ({ timeframe: h.timeframe, bias: h.bias, regime: h.regime, keyLevels: h.keyLevels.slice(0, 6).map((k) => ({ label: k.label, price: k.price })) })),
    session: result.session,
    structureEvents: result.base.structure.events.slice(-8).map((e) => ({ kind: e.kind, direction: e.direction, level: e.level, time: e.time })),
    liquidity: result.base.liquidity.slice(0, 12).map((l) => ({ label: l.label, side: l.side, price: l.price, swept: l.swept })),
    sweeps: result.base.sweeps.slice(-6).map((s) => ({ side: s.side, level: s.level, reclaimed: s.reclaimed, displacementAfter: s.displacementAfter, time: s.time })),
    zones: result.zones.map((z) => ({
      id: z.id, name: locale === "ar" ? z.nameAr : z.name, direction: z.direction, top: z.top, bottom: z.bottom, score: z.score, quality: z.quality, status: z.status, tests: z.tests,
      factors: z.factors.map((f) => ({ key: f.key, present: f.present, contribution: f.contribution, evidence: f.evidence?.[locale] })),
      invalidation: z.invalidation.price,
    })),
    narrative: result.narrative[locale],
  };
}

export const EXPLAINER_SYSTEM_PROMPT: Record<"ar" | "en", string> = {
  en: `You are the explanation layer of TradingWorld, an explainable market-analysis engine.
You receive STRUCTURED analysis data (JSON) produced by deterministic detection algorithms.
Rules:
1. Answer ONLY from the provided data. Never invent levels, factors, patterns or news that are not in the JSON.
2. If the data does not contain what the user asks for, say so explicitly.
3. Never give buy/sell recommendations, price predictions or profit promises. Confidence scores are analysis-confluence scores, not win probabilities.
4. Explain factor by factor; cite the factor keys and their contribution points when relevant.
5. Be concise, professional and precise. Prices use the instrument's precision.
6. End with a one-line reminder that this is analysis, not advice, when the question is about taking a trade.`,
  ar: `أنت طبقة الشرح في TradingWorld، محرك تحليل أسواق قابل للتفسير.
تستلم بيانات تحليل مُهيكلة (JSON) أنتجتها خوارزميات اكتشاف حتمية.
القواعد:
1. أجب فقط من البيانات المقدمة. لا تخترع مستويات أو عوامل أو أنماطًا أو أخبارًا غير موجودة في JSON.
2. إذا لم تحتوِ البيانات على ما يسأل عنه المستخدم، قل ذلك صراحة.
3. لا تقدم توصيات شراء/بيع ولا توقعات سعرية ولا وعودًا بالربح. درجات القوة هي درجات توافق تحليلي وليست احتمال نجاح.
4. اشرح عاملًا بعامل مع ذكر مفاتيح العوامل ونقاط مساهمتها عند الحاجة.
5. كن موجزًا ومهنيًا ودقيقًا. استخدم دقة أسعار الأداة.
6. اختم بتذكير من سطر واحد أن هذا تحليل وليس نصيحة استثمارية عندما يكون السؤال عن دخول صفقة.`,
};

export function buildUserMessage(grounding: GroundingPayload, question: string, locale: "ar" | "en"): string {
  const header = locale === "ar" ? "بيانات التحليل المُهيكلة:" : "Structured analysis data:";
  const q = locale === "ar" ? "سؤال المستخدم:" : "User question:";
  return `${header}\n\`\`\`json\n${JSON.stringify(grounding)}\n\`\`\`\n\n${q} ${question}`;
}

/**
 * Deterministic fallback answerer (no LLM). Handles the most common intents so the product
 * works offline and so that every answer is verifiably grounded.
 */
export function answerDeterministic(result: AnalysisResult, question: string, locale: "ar" | "en", zoneId?: string): string {
  const q = question.toLowerCase();
  const zone: Zone | undefined = zoneId ? result.zones.find((z) => z.id === zoneId) : result.zones[0];
  const L = (ar: string, en: string) => (locale === "ar" ? ar : en);
  const name = (z: Zone) => (locale === "ar" ? z.nameAr : z.name);

  const asksWhy = /why|لماذا|ليش|سبب/.test(q);
  const asksSupport = /support|يدعم|تدعم|عوامل/.test(q);
  const asksInvalid = /invalid|يبطل|تبطل|يلغي|إلغاء/.test(q);
  const asksHtf = /higher|htf|الأعلى|فريمات|الفريم/.test(q);
  const asksCompare = /compare|stronger|أقوى|الفرق|مقارنة/.test(q);
  const asksLiquidity = /liquidity|سيولة/.test(q);

  if (asksHtf) {
    const lines = result.htf.map((h) => `${h.timeframe}: ${h.bias} / ${h.regime} — ${h.keyLevels.slice(0, 3).map((k) => `${k.label} ${k.price}`).join(", ")}`);
    return L("سياق الفريمات الأعلى:\n", "Higher-timeframe context:\n") + lines.join("\n");
  }
  if (asksLiquidity) {
    const pools = result.base.liquidity.slice(0, 8).map((p) => `• ${p.label} @ ${p.price} (${p.side}${p.swept ? L("، تم سحبها", ", swept") : ""})`);
    return L("خريطة السيولة الحالية:\n", "Current liquidity map:\n") + pools.join("\n");
  }
  if (asksCompare && result.zones.length >= 2) {
    const [a, b] = result.zones;
    const diff = a!.factors.filter((f) => f.present && !b!.factors.find((g) => g.key === f.key)?.present).map((f) => f.label[locale]);
    return L(
      `${name(a!)} (${a!.score}) أقوى من ${name(b!)} (${b!.score}) لأنها تحتوي إضافيًا على: ${diff.join("، ") || "عوامل بأوزان أعلى"}.`,
      `${name(a!)} (${a!.score}) is stronger than ${name(b!)} (${b!.score}) because it additionally has: ${diff.join(", ") || "higher-weighted factors"}.`,
    );
  }
  if (!zone) return L("لا توجد منطقة نشطة حاليًا للإجابة عنها.", "There is no active zone to answer about right now.");
  if (asksInvalid) return `${zone.explanation.invalidation[locale]} ${L("نقاط الضعف:", "Weaknesses:")} ${zone.explanation.weaknesses.map((w) => w[locale]).join(" ") || L("لا شيء بارز.", "none notable.")}`;
  if (asksWhy || asksSupport) {
    const reasons = zone.explanation.reasons.map((r, i) => `${i + 1}. ${r[locale]}`).join("\n");
    const pts = zone.factors.filter((f) => f.present).map((f) => `${f.label[locale]}: +${f.contribution}`).join(" · ");
    return `${name(zone)} — ${zone.score}/100\n${zone.explanation.summary[locale]}\n${reasons}\n${pts}\n${zone.explanation.invalidation[locale]}`;
  }
  return `${result.narrative[locale]}\n\n${L("اسألني: لماذا هذه المنطقة؟ ما الذي يدعمها؟ ما الذي يبطلها؟ ماذا يحدث على الفريمات الأعلى؟", "Ask me: why this zone? what supports it? what invalidates it? what is happening on higher timeframes?")}`;
}
