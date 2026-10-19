# 04 — AI Architecture

## 1. القاعدة
**Detection Engine → Structured Data → Scoring Engine → Explanation Engine.** الـLLM لا يكتشف ولا يقيّم؛ يشرح ويجيب فقط من JSON، ويُمنع صراحة من اختراع عوامل أو إعطاء توصيات.

## 2. كيف تُكتشف المناطق؟
1. **لكل فريم** (الأساسي + HTF): ATR → Swings (fractal، تأكيد بعد n شموع) → Structure (BOS/CHoCH بالإغلاق) → Displacement (body ≥ 1.5 ATR و ≥ 60% من المدى) → Order Blocks (آخر شمعة معاكسة قبل الاندفاع) → FVG (3 شموع، حد أدنى 0.3 ATR، تتبع التغطية) → سيولة (EQH/EQL ضمن 0.15 ATR، Swing pools) → Sweeps (فتيل يتجاوز المستوى + إغلاق معاكس + هل تبعه اندفاع) → Regime.
2. **مستويات الفترات/الجلسات** على الفريم الأساسي: PDH/PDL/PWH/PWL، Session High/Low للجلسة السابقة.
3. **سياق HTF**: bias لكل فريم أعلى + Key Levels (Swing H/L، FVG/OB غير مغطاة، EQH/EQL) مرتبة بالقرب من السعر.
4. **المرشحون**: FVG غير مغطاة · OB غير مُخفَّف · نطاق فتيل السحب المستعاد · نطاق حول مستوى HTF قريب (≤ 4 ATR).

## 3. كيف تُقيَّم؟ (SCORING_V1)
لكل مرشح 10 عوامل بوزن ثابت ودليل نصي:

| العامل | الوزن | الشرط |
|---|---|---|
| HTF_LEVEL | 18 | تقاطع مع مستوى فريم أعلى ضمن 0.5 ATR |
| LIQUIDITY_SWEEP | 16 | سحب مستعاد بالاتجاه الصحيح خلال 12 شمعة وضمن 1.5 ATR |
| STRUCTURE_SHIFT | 15 | BOS/CHoCH بالاتجاه بعد تكوّن المنطقة (≤ 30 شمعة) |
| DISPLACEMENT | 13 | شمعة اندفاع بالاتجاه خلال 5 شموع |
| FVG | 10 | FVG غير مغطاة متداخلة |
| ORDER_BLOCK | 8 | OB غير مُخفَّف متداخل |
| HTF_BIAS_ALIGN | 7 | اتجاه المنطقة = الاتجاه المرجح للفريمات الأعلى (مرجح بالفريم) |
| SESSION_RELEVANCE | 5 | تكوّنت في لندن/نيويورك |
| FRESH | 5 | لم تُختبر بعد |
| VOLATILITY_CONDITION | 3 | التقلب ليس منخفضًا |

- HIGH ≥ 72 · MEDIUM ≥ 52 · LOW < 52 (مخفي افتراضيًا). عرض: 3 HIGH + 5 MEDIUM كحد أقصى. دمج المناطق المتداخلة (> 50%) بنفس الاتجاه.
- **الاسم** يُركَّب من أقوى 3 عوامل موجودة (مثال: `1d Key Level + Sell-Side Liquidity Sweep + Bullish Displacement Demand Zone`).
- **Confidence ≠ احتمال نجاح.** يظهر دائمًا كـ"Analysis Confluence".

## 4. دورة الحياة
تُعاد حسابيًا على الشموع بعد التكوّن: `INVALIDATED` بإغلاق خلف الحد البعيد؛ `TESTED` بأول تداخل؛ `REACTED` إن ابتعد السعر ≥ 1 ATR بالاتجاه بعد الاختبار؛ `WEAKENED` عند ≥ 3 اختبارات؛ `ACTIVE/CONFIRMED` حسب وجود تأكيد (Shift/Displacement) وبُعد السعر.

## 5. الشرح
- **Deterministic Explainer** (`explain/explainer.ts`): summary/reasons/weaknesses/invalidation ثنائية اللغة من العوامل مباشرة.
- **LLM layer** (`apps/api/services/ai.ts`): Claude عبر SDK، system prompt ثابت (ar/en) مع `cache_control`، رسالة المستخدم = JSON grounding + السؤال. عند `refusal` أو خطأ API → fallback حتمي. الافتراضي `claude-opus-5-5` قابل للتغيير بـ`ANTHROPIC_MODEL`.
- **Deterministic answerer** يغطي النوايا الشائعة (لماذا/يدعم/يبطل/HTF/سيولة/مقارنة).

## 6. التدريب ومنع التسريب
- **Dataset**: `Zone` (العوامل + السياق) + `ZoneOutcome` (الحالة النهائية، MFE/MAE بالـATR، عدد الاختبارات، الجلسة، النظام). يُملأ بواسطة Outcome tracker (AI-01).
- **التحقق**: walk-forward زمني أنكر (`services/ml/app/backtest/walk_forward.py`) — بلا خلط، بلا K-fold عشوائي. التبليغ عن lift فوق base rate لكل fold.
- **التسمية**: "تفاعل / لا تفاعل" فقط. لا ربح/خسارة.
- **منع Leakage**: الميزات مستخرجة لحظة الاكتشاف فقط؛ الـBacktest Lab يعيد تشغيل المحرك على `candles[0..i]`.
- **النشر**: `/train` يُخرج `proposed_weights` + سجل مُنسَّخ (`registry/`)، الحالة `proposed`. الاعتماد البشري → `SCORING_VERSION` جديدة في الكود → سطر في PROGRESS.md §6 → إمكانية الرجوع عبر الإصدار.
- **Monitoring**: Admin → AI Research (تكرار العوامل، توزيع الحالات) الآن؛ لاحقًا مقارنة أداء الإصدارات.

## 7. ما يمكن إضافته بلا إعادة بناء
Breaker blocks · Premium/Discount · VWAP/Volume profile (عند توفر الحجم) · Order flow · Sentiment · OI/Funding/Liquidations — كل منها detector + factor جديد.
