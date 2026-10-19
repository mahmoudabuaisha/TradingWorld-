<div align="center">

# TradingWorld

**AI Market Intelligence Platform — منصة ذكاء الأسواق القابل للتفسير**

> «Detect → Analyze → Connect → Score → Explain → Learn → Improve»

[![CI](https://github.com/mahmoudabuaisha/TradingWorld-/actions/workflows/ci.yml/badge.svg)](https://github.com/mahmoudabuaisha/TradingWorld-/actions/workflows/ci.yml)
![Engine](https://img.shields.io/badge/engine-v1.0.0-d5b15d) ![Scoring](https://img.shields.io/badge/scoring-v1-d5b15d) ![Status](https://img.shields.io/badge/status-MVP%20scaffold-37c7a0)

</div>

TradingWorld هي بيئة متكاملة للمتداول: **شارت + محرك تحليل حتمي قابل للتفسير + مساعد AI مؤسَّس على البيانات + سجل تداول + أدوات + أكاديمية + مجتمع** — في مكان واحد وبنظام قابل للتوسع من اليوم الأول.

المنصة **ليست** بروكرًا، ولا تنفذ صفقات، ولا تعطي إشارات شراء/بيع، ولا تعد بالربح. المنتج الحقيقي هو **محرك التحليل خلف الشارت**.

---

## 📚 ابدأ من هنا

| الملف | الغرض |
|---|---|
| **[PROJECT.md](./PROJECT.md)** | فهم بنية وتخطيط المشروع بالكامل: المعمارية، التقنيات، مزودو البيانات، معمارية الـAI، قاعدة البيانات، الـAPI، خارطة الطريق، التقديرات الزمنية والتكلفة، خطة الأمان |
| **[PROGRESS.md](./PROGRESS.md)** | سجل التقدم: حالة كل وحدة من الـ60 وحدة + سجل التعديلات والإضافات + خانة الاعتماد لكل جزئية |
| [docs/](./docs) | الوثائق التفصيلية (11 وثيقة + قرارات معمارية ADR) |

## 🏗️ هيكل المستودع

```
TradingWorld-/
├── apps/
│   ├── web/                 # Next.js 15 — واجهة Premium داكنة، RTL/LTR، شارت + AI Zones + Chat + أدوات
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
- لبيانات حقيقية: اضبط `MARKET_DATA_PROVIDER=binance` (كريبتو، بدون مفتاح) أو `twelvedata` مع `TWELVEDATA_API_KEY`.
- لتفعيل شرح الـLLM: `AI_PROVIDER=anthropic` و `ANTHROPIC_API_KEY=...` — وبدونه يعمل **المُفسِّر الحتمي** (مؤسَّس على البيانات، بلا تكلفة).

### الاختبارات والفحص

```bash
pnpm typecheck      # كل الحزم
pnpm test           # engine (13) + api (5)
cd services/ml && pip install -e ".[dev]" && pytest -q   # ml (3)
```

### البنية التحتية (اختياري)

```bash
docker compose up -d                 # TimescaleDB + Redis
docker compose --profile app up      # + api + web
```

## 🧠 كيف يعمل المحرك؟

```
Market Data ─► Detection (deterministic) ─► Structured Factors ─► Scoring (versioned weights)
            ─► Zone Lifecycle ─► Deterministic Explainer ─► (optional) LLM rephrase/Q&A grounded on JSON
```

- كل منطقة لها **اسم تحليلي** (مثل `1d Key Level + Sell-Side Liquidity Sweep + Bullish Displacement Demand Zone`)، درجة من 100 مع **تفصيل كل عامل**، حالة (`DETECTED → … → INVALIDATED`)، وشرط إبطال صريح.
- الـLLM **لا يكتشف شيئًا**؛ يستلم JSON مُهيكلًا ويُمنع من اختراع عوامل. وبدونه تعمل الإجابات الحتمية.
- كل نتيجة موسومة بـ`engineVersion` و`scoringVersion` لقابلية التتبع والرجوع.

## ⚖️ إخلاء المسؤولية

هذه المنصة أداة تحليل تعليمية وليست ضمانًا للربح أو توصية استثمارية. الأسواق المالية تنطوي على مخاطر، وأي قرار تداول مسؤولية المستخدم وحده.

---

جميع الحقوق محفوظة © TradingWorld. الكود خاص بالمشروع وغير مرخص للاستخدام العام.
