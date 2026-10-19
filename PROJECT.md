# TradingWorld — وثيقة فهم بنية وتخطيط المشروع

> هذه الوثيقة هي المرجع الشامل لفهم المشروع: ماذا نبني، كيف نبنيه، بأي تقنيات، وما خارطة الطريق. تجيب عن المخرجات العشرة المطلوبة من المبرمج قبل البدء (System Architecture · Tech Stack · Data Providers · AI Architecture · Database Schema · API · MVP Roadmap · Time Estimate · Infrastructure Cost · Security Plan).
>
> التفاصيل الموسعة لكل بند في مجلد [`docs/`](./docs). حالة التنفيذ الحية في [`PROGRESS.md`](./PROGRESS.md).

---

## 0. الفكرة في سطر

**TradingWorld = TradingView-like chart + Quantitative Analysis + Liquidity Intelligence + Multi-Timeframe + Explainable AI + Trader OS (journal/academy/tools/community)** — بهوية ومنهج تحليل خاص بنا. الشارت هو الواجهة؛ **محرك التحليل هو المنتج**.

### ما لا نبنيه
بروكر · تنفيذ صفقات · إدارة أموال · نسخ صفقات · إشارات Buy/Sell · توصيات بلا تفسير · مناطق عشوائية · وعود بالربح.

### قاعدة المشروع الأهم
> **Detection Engine → Structured Data → Scoring Engine → Explanation Engine** — وليس «AI → اخترع تحليلًا».
> كل شيء قابل للتفسير، الاختبار، القياس، والتطوير.

---

## 1. System Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  apps/web (Next.js 15, React 19)                                            │
│  Chart (lightweight-charts) + AI Zones overlay · Side Panel · AI Chat ·     │
│  Dashboard · Watchlist · Alerts · Tools · Journal · Academy · Admin · 60 mods│
└──────────────┬───────────────────────────────┬──────────────────────────────┘
               │ REST /api/v1                  │ WebSocket /ws (candles · analysis · alerts)
┌──────────────▼───────────────────────────────▼──────────────────────────────┐
│  apps/api (Fastify 5)  — API Gateway                                        │
│  Auth/JWT · RBAC · Rate-limit · Helmet · Audit log                           │
│  ┌────────────────┐ ┌──────────────────┐ ┌─────────────┐ ┌───────────────┐  │
│  │ Provider       │ │ AnalysisService  │ │ AlertService│ │ AiService     │  │
│  │ Registry       │ │ (cache, zone log)│ │             │ │ (LLM/determ.) │  │
│  │ demo/binance/  │ └────────┬─────────┘ └─────────────┘ └───────────────┘  │
│  │ twelvedata     │          │                                               │
│  └────────────────┘          ▼                                               │
│                 packages/analysis-engine  ⭐ (pure TypeScript, deterministic) │
│   Market Data Engine → Technical Engine → Liquidity Engine → Session Engine  │
│   → MTF Engine → Regime → Confluence Scoring → Zone Lifecycle → Explainer    │
└──────────────┬──────────────────────────────────────────────────────────────┘
               │ Repositories (memory now → Prisma)
┌──────────────▼──────────────┐   ┌────────────────────────────────────────┐
│ PostgreSQL 16 + TimescaleDB │   │ services/ml (Python/FastAPI)           │
│ Users · Zones · Outcomes ·  │◄──┤ Walk-forward validation · Model        │
│ Candles(hypertable) · Audit │   │ registry · Weight proposals (no auto   │
│ Alerts · Trades · Backtests │   │ deploy)                                │
└─────────────────────────────┘   └────────────────────────────────────────┘
               Redis (cache / pub-sub for multi-instance realtime — phase 2)
```

### المبادئ المعمارية
| المبدأ | التطبيق |
|---|---|
| **Modular by design** | كل محرك كشف = ملف مستقل في `detectors/`؛ كل مزود بيانات = adapter يطبق واجهة `MarketDataProvider`؛ كل وحدة منتج = سطر في `modules.ts` |
| **Deterministic core** | نفس المدخل → نفس المخرج دائمًا (اختبار `is deterministic`). ضروري للـReplay والـBacktest والتدقيق |
| **Versioned intelligence** | `ENGINE_VERSION` + `SCORING_VERSION` يُختمان على كل نتيجة ومنطقة |
| **Explainability first** | الـFactor يحمل `evidence` ثنائي اللغة؛ الدرجة = مجموع المساهمات الظاهرة للمستخدم |
| **LLM at the edge** | الـLLM يستلم JSON ويشرح/يجيب فقط؛ يوجد مُفسِّر حتمي بديل |
| **Isomorphic engine** | المحرك يعمل في الخادم وفي المتصفح (Backtest Lab يعمل محليًا بنفس الكود) |
| **Zero-infra dev** | مزود `demo` + مستودعات ذاكرة → المنصة تعمل فورًا بلا مفاتيح/قواعد بيانات |

➡ التفاصيل: [`docs/01-architecture.md`](./docs/01-architecture.md)

---

## 2. Technology Stack (مع سبب الاختيار)

| الطبقة | التقنية | لماذا |
|---|---|---|
| Frontend | **Next.js 15 + React 19 + TypeScript** | App Router، SSR/SSG عند الحاجة، نظام بيئي ضخم، سهولة تحويل لاحقًا إلى تطبيق (Capacitor/React Native يشاركان الـpackages) |
| Styling | **Tailwind CSS 3** + design tokens | سرعة بناء واجهة Premium داكنة متسقة، RTL أصلي عبر logical properties |
| Chart | **lightweight-charts 4 (Apache-2.0)** + Canvas overlay للمناطق | أداء عالٍ (Canvas)، مجاني تجاريًا مع الإسناد، ونبني فوقه الأدوات الخاصة (الخيار B في مواصفة الشارت) |
| State | **Zustand** (persist) | خفيف، يحفظ «آخر حالة» للمستخدم (آخر شارت/فريم/Watchlist) |
| Backend | **Fastify 5 + TypeScript** | من أسرع أطر Node، plugins ناضجة (JWT, rate-limit, websocket, helmet)، سهولة المشاركة الأنواع مع الـfrontend. (NestJS بديل مقبول — انظر ADR-0002) |
| Validation | **zod** | schema واحدة للـAPI والواجهة (`packages/shared/schemas`) |
| Realtime | **WebSocket (@fastify/websocket)** | دفع الشموع/التحليل/التنبيهات لحظيًا؛ Redis pub/sub عند التوسع الأفقي |
| Analysis Engine | **TypeScript خالص** | يعمل في الخادم والمتصفح، حتمي، سهل الاختبار (vitest) |
| Database | **PostgreSQL 16 + TimescaleDB** عبر **Prisma 6** | Timescale للشموع (hypertable + ضغط)، Postgres لكل شيء آخر، Prisma للـschema الموثق والـmigrations |
| Cache/Queue | **Redis 7** | تخزين تحليل، pub/sub، جداول Rate limit موزعة |
| ML | **Python 3.12 + FastAPI + scikit-learn + pandas** | المعيار في البحث الكمي؛ معزول عن مسار الإنتاج |
| LLM | **Anthropic Claude (SDK رسمي)** — الافتراضي `claude-opus-5-5` | Explanation/Chat فقط، مع prompt caching للـsystem prompt الثابت، وبديل حتمي |
| Infra | Docker Compose (dev) → Kubernetes/Fly.io/Render (prod) | انظر التكلفة §9 |
| CI | GitHub Actions | typecheck · test · build لكل push |

➡ [`docs/02-tech-stack.md`](./docs/02-tech-stack.md)

---

## 3. Data Providers

| المزود | التغطية | Real-time | التاريخ | الترخيص التجاري | التكلفة التقريبية | الحالة في الكود |
|---|---|---|---|---|---|---|
| **demo** (داخلي) | كل الرموز | محاكاة | 60k شمعة 1m اصطناعية | — | 0 | ✅ مُنفَّذ |
| **Binance** (public) | Crypto | WS kline | REST klines | شروط الاستخدام تقيّد إعادة التوزيع التجاري — مراجعة قانونية قبل الإنتاج | 0 | ✅ مُنفَّذ |
| **Twelve Data** | Forex, Metals, Indices, Stocks, Crypto | WS (خطط مدفوعة) / polling | نعم | نعم (خطط Pro/Enterprise) | $29–$229+/شهر | ✅ REST + polling |
| **Polygon.io** | US Stocks, Options, Forex, Crypto | WS | عميق | نعم | $29–$199+/شهر | 🔲 adapter مخطط |
| **Databento / dxFeed / CQG** | Futures, Tick, Order flow | نعم | نعم | نعم (مؤسسي) | $100s–$1000s/شهر | 🔲 لاحقًا (Order Flow/Footprint) |
| **Economic Calendar / News** (Trading Economics, FMP, Finnhub) | أحداث اقتصادية، أخبار | polling/WS | نعم | نعم | $0–$100+/شهر | 🔲 P2 |

قواعد: لا scraping مخالف، إظهار **المصدر ووقت التحديث وحالة Live/Delayed/Stale** دائمًا، `Instrument Master` مركزي يربط كل رمز بمزوده.

➡ [`docs/03-data-providers.md`](./docs/03-data-providers.md)

---

## 4. AI Architecture

### 4.1 خط الأنابيب
```
Candles(base + HTF) ─► Detectors ─► TimeframeAnalysis ─► MTF Context ─► Zone Candidates
  ─► 10 Confluence Factors (with evidence) ─► Score (SCORING_V1) ─► Quality tier
  ─► Lifecycle replay ─► Merge/Filter (3 HIGH · 5 MEDIUM · LOW hidden) ─► Explainer (ar/en)
  ─► [optional] LLM Q&A grounded on JSON ─► Zone log (dataset) ─► ML (offline) ─► Weight proposal
```

### 4.2 المكتشفات (كلها حتمية ومختبَرة)
Swings (fractal, no repaint) · Structure BOS/CHoCH (closes only) · FVG + mitigation · Displacement (body ≥ 1.5×ATR) · Order Blocks · Equal Highs/Lows · Swing liquidity · PDH/PDL/PWH/PWL · Session High/Low (Asia/London/NY + overlap) · Liquidity Sweeps (wick-through + reclaim + displacement-after) · Regime (trend/volatility/phase) · MTF aggregation.

### 4.3 التقييم (SCORING_V1 — المجموع 100)
| العامل | الوزن | العامل | الوزن |
|---|---|---|---|
| HTF_LEVEL | 18 | ORDER_BLOCK | 8 |
| LIQUIDITY_SWEEP | 16 | HTF_BIAS_ALIGN | 7 |
| STRUCTURE_SHIFT | 15 | SESSION_RELEVANCE | 5 |
| DISPLACEMENT | 13 | FRESH (untested) | 5 |
| FVG | 10 | VOLATILITY_CONDITION | 3 |

HIGH ≥ 72 · MEDIUM ≥ 52 · LOW مخفي افتراضيًا. **Confidence = Analysis Confluence، ليس احتمال ربح.**

### 4.4 دورة حياة المنطقة
`DETECTED → CONFIRMED → ACTIVE → TESTED → REACTED → WEAKENED → INVALIDATED` — الإبطال بإغلاق شمعة خلف الحد البعيد فقط (الفتائل اختبارات).

### 4.5 التعلم بلا تهور
- **التسجيل:** كل منطقة تُسجَّل مع عواملها وسياقها (`zoneLog` → جدول `Zone` + `ZoneOutcome`).
- **التحقق:** Walk-forward زمني (لا خلط)، Out-of-sample lift مُبلَّغ، التسمية = «تفاعل/لا تفاعل» وليس ربح.
- **النشر:** الـML يقترح أوزانًا فقط → مراجعة بشرية → `SCORING_VERSION` جديدة → سجل في PROGRESS.md → إمكانية الرجوع.
- **فصل البيانات:** `ZoneFeedback` (رأي المستخدم) منفصل تمامًا عن `ZoneOutcome` (نتيجة السوق).

➡ [`docs/04-ai-architecture.md`](./docs/04-ai-architecture.md)

---

## 5. Database Schema (ملخص)

`User · Session · Instrument · Candle(hypertable) · EngineVersion · Zone · ZoneOutcome · ZoneFeedback · BacktestRun · Watchlist · Alert · Trade · Note · Goal · AuditLog · FeatureFlag`

المخطط الكامل: [`packages/db/prisma/schema.prisma`](./packages/db/prisma/schema.prisma) — الشرح: [`docs/05-database-schema.md`](./docs/05-database-schema.md)

---

## 6. API Architecture (ملخص)

Base: `/api/v1` — JSON — JWT Bearer — Rate limited.

| المجموعة | Endpoints |
|---|---|
| Health | `GET /health` |
| Auth | `POST /auth/register` · `POST /auth/login` · `GET /auth/me` |
| Market | `GET /instruments` · `GET /candles` · `GET /analysis` · `GET /overview` · `GET /modules` |
| AI | `POST /ai/chat` |
| User | `GET/PUT /watchlist` · `GET/POST/DELETE /alerts` · `GET/POST/PATCH/DELETE /journal` · `PATCH /settings` |
| Admin | `GET /admin/overview` · `GET /admin/users` · `PATCH /admin/users/:id/role` · `GET /admin/zones` · `GET /admin/audit` · `GET /admin/research/factors` |
| Realtime | `WS /ws` → `subscribe {symbol, timeframe}` ⇒ `candle · analysis · alert · status` |

➡ [`docs/06-api.md`](./docs/06-api.md)

---

## 7. MVP Roadmap (مراحل)

| المرحلة | المحتوى | الحالة |
|---|---|---|
| **P0 — Foundation** | Monorepo، المحرك، API، Web shell، DB schema، ML skeleton، CI، التوثيق | ✅ هذا الإصدار |
| **P1 — MVP V1** (بنود المواصفة الـ20) | تسجيل · شارت · Real-time · تاريخ · MTF · Liquidity · Structure · FVG · BOS/CHoCH · HTF Levels · Zones · Scoring · Explanation · Lifecycle · Alerts · AI Chat · Watchlist · Admin · Data logging · Backtest أساسي | 🟨 كلها موجودة كهيكل عامل؛ تحتاج: مزود مرخص، Prisma repos، أدوات رسم، Push/Email |
| **P2 — Trader OS** | Strategies · Setups · Scenario Builder · Journal المتقدم · Performance · Routine · Notes · Snapshots · Goals · Academy content · Calendar/News · Scanner · Private Intel · Cloud sync | 🔲 |
| **P3 — Community & Learning** | Community · Rooms · Teams · Psychology · AI Trade Review · Trader Memory · Replay · Strategy Tester · Progress system · Plans/Subscriptions | 🔲 |
| **P4 — Advanced Intelligence** | ML weights v2 · Order Flow/Footprint · Sentiment · Open Interest/Funding/Liquidations · Pattern Search · Mobile app | 🔲 |

➡ [`docs/07-roadmap.md`](./docs/07-roadmap.md)

---

## 8. Estimated Development Time

| المرحلة | فريق (2 Full-stack + 1 Quant/ML جزئي) | ملاحظة |
|---|---|---|
| P0 | ✅ منجز | |
| P1 MVP | **8–10 أسابيع** | أكبر مخاطرة: اعتماد مزود بيانات مرخص وجودة البيانات |
| P2 | 10–12 أسبوعًا | محتوى الأكاديمية يحتاج كاتبًا/خبيرًا شرعيًا بالتوازي |
| P3 | 8–10 أسابيع | المجتمع يحتاج Moderation من اليوم الأول |
| P4 | مستمر | يعتمد على حجم البيانات المتراكمة |

➡ [`docs/08-estimates.md`](./docs/08-estimates.md)

---

## 9. Estimated Infrastructure Cost (شهريًا، USD)

| البند | MVP (≤1k مستخدم) | نمو (≤20k) |
|---|---|---|
| Servers (api + web + ws) | 40–120 | 300–800 |
| PostgreSQL + Timescale (managed) | 25–60 | 150–400 |
| Redis | 10–30 | 50–150 |
| Data feed (مرخص) | 30–250 | 250–1,500 |
| LLM (Explanation/Chat) | 20–150 (مع caching) | 300–1,500 |
| Storage/Backups/CDN | 10–30 | 50–150 |
| Monitoring/Logs | 0–30 | 50–200 |
| **الإجمالي** | **≈ $135–670** | **≈ $1,150–4,700** |

➡ [`docs/08-estimates.md`](./docs/08-estimates.md)

---

## 10. Security Plan (ملخص)

JWT + scrypt · RBAC بست أدوار · Rate limiting (عام + حساس) · Helmet · CORS صارم · zod validation لكل مدخل · Audit log لكل عملية حساسة · لا مفاتيح في الـfrontend · 2FA وجلسات/أجهزة (P2) · تشفير at-rest للحقول الحساسة · نسخ احتياطي يومي + استرجاع مختبَر · مراقبة وتنبيهات نظام.

➡ [`docs/09-security.md`](./docs/09-security.md)

---

## 11. الوحدات الستون
السجل الرسمي في [`packages/shared/src/modules.ts`](./packages/shared/src/modules.ts) ويُعرض في `/modules` داخل المنصة. الكتالوج مع وصف كل وحدة ومرحلتها: [`docs/10-modules-catalog.md`](./docs/10-modules-catalog.md).

## 12. نظام التصميم: «خريطة» (Kharita)
الشارت خريطة والمحرك مسّاح. خمسة ألوان فقط (ميدان/حبر، زنجار للطلب، كهرمان للعرض، ختم للإبطال)، IBM Plex Sans Arabic + Plex Mono، ليلي افتراضي ونهاري ورقي بارد، سكة أطالس بدل الشريط الجانبي، كتلة عنوان تحت كل شارت، ورقة ميدان يومية بدل لوحة البطاقات، مناطق مهشّرة باتجاه يحدد الطلب/العرض. ➡ [`docs/12-design-system-kharita.md`](./docs/12-design-system-kharita.md) · صفحة المفهوم: [`docs/design/kharita-proposal-01.html`](./docs/design/kharita-proposal-01.html)

## 13. قرارات معمارية (ADR)
- [ADR-0001](./docs/adr/0001-deterministic-engine-llm-explains.md) — المحرك حتمي والـLLM يشرح فقط
- [ADR-0002](./docs/adr/0002-fastify-over-nestjs.md) — Fastify بدل NestJS
- [ADR-0003](./docs/adr/0003-lightweight-charts-plus-overlay.md) — lightweight-charts + overlay خاص
- [ADR-0004](./docs/adr/0004-versioned-scoring.md) — أوزان التقييم المُنسَّخة
- [ADR-0005](./docs/adr/0005-kharita-design-language.md) — اعتماد لغة التصميم «خريطة»
