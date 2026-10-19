# @tradingworld/analysis-engine

المحرك الحتمي خلف الشارت — **المنتج الحقيقي** في TradingWorld. لا شبكات عصبية هنا، ولا LLM: كل منطقة ودرجة وشرح قابل لإعادة الإنتاج من نفس الشموع.

```
Candles ─► Detectors ─► Structured Factors ─► Confluence Scoring (versioned) ─► Zone Lifecycle ─► Explainer
```

| الطبقة | الملفات | ماذا تفعل |
|---|---|---|
| الكشف | `src/detectors/*` | Swings · Structure (BOS/CHoCH) · FVG · Order Blocks · Liquidity pools & sweeps · Displacement · Key levels (PDH/PDL/PWH/PWL) · Regime |
| متعدد الأطر | `src/mtf/aggregate.ts` | تجميع الإطارات الأعلى وربط المناطق بسياقها |
| التقييم | `src/scoring/*` | 10 عوامل مجموعها 100 بأوزان مُنسَّخة (`SCORING_VERSION`) |
| المناطق | `src/zones/*` | البناء، التسمية التحليلية، دورة الحياة `DETECTED → … → INVALIDATED` مع `invalidatedIndex` |
| الشرح | `src/explain/*` | مُفسِّر حتمي + تأريض الـLLM (يستلم JSON ولا يخترع عوامل) |
| الإصدار | `src/version.ts` | `ENGINE_VERSION` و `SCORING_VERSION` يُختمان على كل نتيجة |

## الاستخدام

```ts
import { analyze } from "@tradingworld/analysis-engine";

const result = analyze({
  symbol: "BTCUSDT",
  timeframe: "1h",
  candles,                              // ≥ 50 شمعة
  htfCandles: { "4h": candles4h },      // اختياري؛ ما ينقص يُجمَّع من السلسلة الأساسية
  options: { keepInvalidatedBars: 120 } // اختياري: إبقاء المناطق المُبطلة حديثًا للعرض
});
result.zones[0].score;   // 0–100
result.zones[0].factors; // كل عامل ووزنه ومساهمته في الدرجة
```

## الاختبارات

```bash
pnpm --filter @tradingworld/analysis-engine test   # vitest — الكواشف + المحرك الكامل على بيانات اصطناعية حتمية
```

القواعد الثابتة: لا نظرة مستقبلية (no look-ahead)، لا عشوائية، كل تغيير في الأوزان يرفع `SCORING_VERSION` (انظر ADR-0004).
