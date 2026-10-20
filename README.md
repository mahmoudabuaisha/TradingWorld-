<div align="center">

# TradingWorld

**AI Market Intelligence Platform — منصة ذكاء الأسواق القابل للتفسير**

> «Detect → Analyze → Connect → Score → Explain → Learn → Improve»

[![CI](https://github.com/mahmoudabuaisha/TradingWorld-/actions/workflows/ci.yml/badge.svg)](https://github.com/mahmoudabuaisha/TradingWorld-/actions/workflows/ci.yml)
![Engine](https://img.shields.io/badge/engine-v1.1.1-d5b15d) ![Scoring](https://img.shields.io/badge/scoring-v1-d5b15d) ![Status](https://img.shields.io/badge/status-MVP%20scaffold-37c7a0)

</div>

TradingWorld هي بيئة متكاملة للمتداول: **شارت + محرك تحليل حتمي قابل للتفسير + مساعد AI مؤسَّس على البيانات + سجل تداول + أدوات + أكاديمية + مجتمع** — في مكان واحد وبنظام قابل للتوسع من اليوم الأول.

المنصة **ليست** بروكرًا، ولا تنفذ صفقات، ولا تعطي إشارات شراء/بيع، ولا تعد بالربح. المنتج الحقيقي هو **محرك التحليل خلف الشارت**.

---

## 📚 ابدأ من هنا

| الملف | الغرض |
|---|---|
| **[PROJECT.md](./PROJECT.md)** | فهم بنية وتخطيط المشروع بالكامل: المعمارية، التقنيات، مزودو البيانات، معمارية الـAI، قاعدة البيانات، الـAPI، خارطة الطريق، التقديرات الزمنية والتكلفة، خطة الأمان |
| **[PROGRESS.md](./PROGRESS.md)** | سجل التقدم: حالة كل وحدة من الـ60 وحدة + سجل التعديلات والإضافات + خانة الاعتماد لكل جزئية |
| [docs/](./docs) | الوثائق التفصيلية (12 وثيقة + 6 قرارات معمارية ADR) |
| [docs/12-design-system-kharita.md](./docs/12-design-system-kharita.md) | نظام التصميم «خريطة»: الرموز، المكوّنات، الأوراق، الوصولية، ولوحة الألوان الكلاسيكية |

## 🏗️ هيكل المستودع

```
TradingWorld-/
├── apps/
│   ├── web/                 # Next.js 15 — لغة التصميم «خريطة» (ليلي/نهاري)، RTL/LTR، شارت مسّاح + مناطق + Chat + أوراق
│   └── api/                 # Fastify 5 — Auth/JWT، مزودو بيانات، خدمة التحليل، تنبيهات، سجل، WebSocket، Admin
├── packages/
│   ├── analysis-engine/     # ⭐ المحرك: Swings · Structure (BOS/CHoCH) · FVG · OB · Liquidity · Sweeps ·
│   │                        #   Sessions · PDH/PDL/PWH/PWL · Regime · MTF · Confluence Scoring · Zone Lifecycle ·
│   │                        #   Explainer · LLM grounding — حتمي 100% ومختبَر
│   ├── shared/              # الأنواع، الـschemas (zod)، سجل الـ60 وحدة، الأدوات، الحاسبات، الجلسات
│   └── db/                  # Prisma schema (PostgreSQL + TimescaleDB) + SQL للـhypertable
├── services/
│   └── ml/                  # Python/FastAPI — Walk-forward validation، سجل نماذج، اقتراح أوزان (بدون نشر تلقائي)
├── docs/                    # الوثائق التفصيلية + ADRs
├── infra/                   # Dockerfiles
├── docker-compose.yml       # Postgres(Timescale) + Redis (+ api/web/ml بـprofiles)
└── .github/workflows/ci.yml # Typecheck · Test · Build (Node + Python)
```

## 🚀 التشغيل محليًا (بدون أي مفاتيح أو قواعد بيانات)

```bash
# المتطلبات: Node 20+ و pnpm 10+
pnpm install
pnpm build:packages            # يبني shared + analysis-engine
cp .env.example .env           # المزود الافتراضي demo (بيانات اصطناعية حتمية)

pnpm dev:api                   # http://localhost:4000/api/v1  +  ws://localhost:4000/ws
pnpm dev:web                   # http://localhost:3000
```

- أول حساب يُسجَّل يصبح **Admin** تلقائيًا (بيئة التطوير).
- لبيانات حقيقية: وجّه كل فئة أصول إلى مزودها، مثل `MARKET_DATA_ROUTES=forex=twelvedata,metal=twelvedata,crypto=binance` مع `TWELVEDATA_API_KEY` (و`POLYGON_API_KEY` للأسهم)، ثم افحص المسار: `pnpm --filter @tradingworld/api feed:check XAUUSD 5m 30`. ما لم يُوجَّه يُخدَم من `demo` ويظهر تحذير في `/health` ولوحة الإدارة. التفاصيل والخطط وقائمة ما قبل التوقيع في `docs/03-data-providers.md`.
- لتفعيل شرح الـLLM: `AI_PROVIDER=anthropic` و `ANTHROPIC_API_KEY=...` — وبدونه يعمل **المُفسِّر الحتمي** (مؤسَّس على البيانات، بلا تكلفة).

### الاختبارات والفحص

```bash
pnpm check          # الكل بالترتيب: format:check ثم lint ثم typecheck ثم test
pnpm format         # Prettier على المستودع (format:check للفحص فقط)
pnpm lint           # ESLint بإعداد واحد في الجذر، صفر تحذيرات (lint:fix للإصلاح التلقائي)
pnpm typecheck      # كل الحزم، والاختبارات أيضًا (tsconfig.test.json)
pnpm test           # shared (5) + engine (18) + api (83؛ اختبارات المخزن والمستودعات على Postgres حقيقي عند ضبط TEST_DATABASE_URL)
cd services/ml && pip install -e ".[dev]" && ruff check . && ruff format --check . && pytest -q   # ml (3)
```

**قبل كل commit** يشغّل husky `lint-staged` على الملفات المرحَّلة فقط: Prettier ثم ESLint بالإصلاح التلقائي، وruff لملفات Python. يُفعَّل تلقائيًا مع `pnpm install`. خطأ لا يُصلح تلقائيًا يوقف الـcommit. الـCI يعيد الفحوص نفسها على المستودع كاملًا.

القواعد في `eslint.config.mjs`: typescript-eslint، وثلاث قواعد تعتمد الأنواع للوعود غير المنتظرة (`no-floating-promises` و`no-misused-promises` و`await-thenable`: رفض غير معالج يوقف عملية Node)، وقواعد الـhooks وNext.js وjsx-a11y لتطبيق الويب. لعرض `git blame` بلا commit التنسيق: `git config blame.ignoreRevsFile .git-blame-ignore-revs` (GitHub يطبقه تلقائيًا).

### البنية التحتية (اختياري)

```bash
docker compose up -d                 # TimescaleDB + Redis (ينشئ market.candles كـhypertable)
docker compose --profile app up      # + api + web
# مع DATABASE_URL: المستودعات على Postgres (REPOSITORIES=auto) بعد تطبيق الترحيلات
pnpm --filter @tradingworld/db build && pnpm --filter @tradingworld/db migrate:deploy
# مخزن شموع دائم + تعبئة تاريخية: CANDLE_STORE=auto يختار Timescale عند وجود DATABASE_URL
BACKFILL_ENABLED=true pnpm --filter @tradingworld/api backfill all   # أو تلقائيًا مع الـAPI
```

## 🧠 كيف يعمل المحرك؟

```
Market Data ─► Detection (deterministic) ─► Structured Factors ─► Scoring (versioned weights)
            ─► Zone Lifecycle ─► Deterministic Explainer ─► (optional) LLM rephrase/Q&A grounded on JSON
```

- كل منطقة لها **اسم تحليلي** (مثل `1d Key Level + Sell-Side Liquidity Sweep + Bullish Displacement Demand Zone`)، درجة من 100 مع **تفصيل كل عامل**، حالة (`DETECTED → … → INVALIDATED`)، وشرط إبطال صريح.
- الـLLM **لا يكتشف شيئًا**؛ يستلم JSON مُهيكلًا ويُمنع من اختراع عوامل. وبدونه تعمل الإجابات الحتمية.
- كل نتيجة موسومة بـ`engineVersion` و`scoringVersion` لقابلية التتبع والرجوع.

## 🗺️ التصميم: لغة «خريطة» (Kharita)

الواجهة ليست لوحة تحكم بل **خريطة مساحية**: الشارت خريطة، المحرك مسّاح، وكل منطقة مُهشّرة باتجاه يحدد نوعها (45° طلب، 135° عرض) ولها كتلة عنوان، نداء مساحي بخط قائد، ومكدّس تقاطع يشرح كل نقطة من الدرجة.

- **الأوراق**: الميدان اليومي، الشارت، الأسواق (صفوف تضاريس)، السجل، التنبيهات، المختبر، الإدارة — كلها على ورقة واحدة بسكة أطالس ثابتة.
- **الوضعان**: ليلي افتراضي ونهاري ورقي؛ لوحة ألوان الاتجاه **خريطة** (زنجار/كهرمان، آمنة لعمى الألوان) أو **كلاسيكي** (أخضر/أحمر) من الإعدادات.
- **الوصولية**: تباين النص ≥ 4.5:1 في الوضعين، رابط تخطٍّ للمحتوى، نماذج معنونة، `aria-pressed` على المفاتيح، واحترام تقليل الحركة.

➡ [`docs/12-design-system-kharita.md`](./docs/12-design-system-kharita.md) · [ADR-0005](./docs/adr/0005-kharita-design-language.md) · صفحة المفهوم: [`docs/design/kharita-proposal-01.html`](./docs/design/kharita-proposal-01.html)

## ⚖️ إخلاء المسؤولية

هذه المنصة أداة تحليل تعليمية وليست ضمانًا للربح أو توصية استثمارية. الأسواق المالية تنطوي على مخاطر، وأي قرار تداول مسؤولية المستخدم وحده.

---

جميع الحقوق محفوظة © TradingWorld. الكود خاص بالمشروع وغير مرخص للاستخدام العام.
