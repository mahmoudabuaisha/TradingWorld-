# 01 — System Architecture

## 1. نظرة عامة
TradingWorld نظام واحد مترابط وليس 60 صفحة منفصلة. الربط يتم عبر **IDs** مشتركة: `Instrument.symbol` · `Zone.id` · `Trade.id` · `Strategy/Setup.id` · `Snapshot.id`، وكل كيان يحمل `engineVersion/scoringVersion` إن كان تحليليًا.

```
User ─► Web (Next.js) ─► API (Fastify) ─► Engine (TS) ─► Providers (demo/binance/twelvedata/polygon — موجَّهة حسب فئة الأصل)
                                   │                └─► Repositories ─► Postgres/Timescale · Redis
                                   └─► WS /ws (candle · analysis · alert · status)
Offline: Zone log + Outcomes ─► services/ml (walk-forward) ─► weight proposal ─► human approval ─► new SCORING_VERSION
```

## 2. الطبقات

### 2.1 Frontend — `apps/web`
- **App Router**، كل الصفحات client-side حول Shell واحد (`AppShell`): Sidebar قابل للطي، Topbar، ⌘K، تبديل اللغة (ar RTL / en LTR)، Footer إخلاء مسؤولية.
- **ChartWorkspace**: يجلب `/candles` + `/analysis`، يشترك في `/ws`، يرسم عبر `TradingChart` (lightweight-charts + Canvas overlay)، ويعرض `SidePanel`، `ZoneDetails`، `AiChat`.
- **Mode**: `manual` (شارت + مستويات فقط) / `ai` (طبقة التحليل كاملة).
- **State**: Zustand persist (آخر أصل/فريم/وضع/Watchlist/لغة/توكن).
- **Backtest Lab** يستورد المحرك مباشرة ويعمل في المتصفح.

### 2.2 API Gateway — `apps/api`
- `app.ts` يبني التطبيق ويحقن `AppContext` (config, repos, providers, analysis, ai, alerts).
- Plugins: helmet · cors · rate-limit · jwt (`authenticate`, `requireRole`).
- Routes تحت `/api/v1` (health, auth, market, user, admin). Realtime في `/ws`.
- **ProviderRegistry**: يوجّه كل أداة إلى مزودها حسب فئة الأصل (`MARKET_DATA_ROUTES`)، يلفّ المزودين المرخصين بميزانية ومخزن شموع، يحسب حالة التدفق لكل أداة (`LIVE/DELAYED/STALE/CLOSED/OFFLINE`)، ويرجع إلى `demo` مع تحذير مرئي.
- **CandleStore** (`store/`): واجهة واحدة بتطبيقين — ذاكري و PostgreSQL/TimescaleDB — خلف كل مزود مرخص؛ **BackfillService** يبقيه كاملًا (تعبئة، لحاق، إصلاح فجوات، اشتقاق الفريمات الأعلى من 1m بنفس دلاء المحرك).
- **AnalysisService**: يجلب الشموع الأساسية + شموع HTF الصريحة (من المخزن عندما تكون مشتقة)، يشغّل المحرك، يخزّن مؤقتًا (TTL 5s)، يسجل المناطق (`zoneLog`).
- **AlertService**: تقييم لحظي للتنبيهات على كل tick/تحليل.
- **AiService**: Claude عبر SDK الرسمي (system prompt مثبت + prompt caching) أو مُفسِّر حتمي.

### 2.3 Analysis Engine — `packages/analysis-engine`
```
engine.ts
 ├─ analyzeTimeframe(candles, tf)
 │    ├─ indicators.atr
 │    ├─ detectors/swings → structure (BOS/CHoCH)
 │    ├─ detectors/displacement → orderBlocks
 │    ├─ detectors/fvg
 │    ├─ detectors/liquidity (EQH/EQL, swing pools, sweeps)
 │    └─ detectors/regime
 ├─ detectors/levels (PDH/PDL/PWH/PWL, session H/L)
 ├─ mtf/aggregate (resample) + HTF contexts + key levels
 ├─ zones/builder → scoring/confluence → zones/naming → zones/lifecycle → explain/explainer
 └─ explain/llm (grounding payload + prompts + deterministic answerer)
```
- **Pure**: لا I/O، لا تواريخ حالية إلا عبر `now` في المدخل.
- **No repaint**: السوينغ يُؤكَّد بعد `lookback` شموع؛ البنية تُكسر بالإغلاق فقط.

### 2.4 Data — `packages/db`
Postgres + TimescaleDB. الشموع hypertable مضغوطة بعد 30 يومًا. كل ما عداها جداول عادية عبر Prisma.

### 2.5 ML — `services/ml`
معزول تمامًا عن مسار الإنتاج. يستهلك المناطق المسجلة ونتائجها ويُخرج **اقتراحات** مُنسَّخة.

## 3. تدفق الطلب الكامل (مثال: فتح XAUUSD 5m)
1. الويب يطلب `/candles?symbol=XAUUSD&timeframe=5m&limit=600` و`/analysis?...`.
2. `AnalysisService.run` → provider.getCandles(5m, 600) + getCandles(1d/4h/1h/15m).
3. `analyze()` → النتيجة (zones, htf, keyLevels, regime, session, narrative).
4. الويب يرسم الشموع، المستويات، markers، والمناطق (overlay) ويعرض Side Panel.
5. الويب يشترك في `/ws` → كل ثانية `candle`، وكل إغلاق شمعة أو 15s `analysis`؛ عند تحقق تنبيه `alert`.
6. المستخدم يضغط منطقة → `ZoneDetails` (أسباب/عوامل/ضعف/إبطال) → يسأل الـAI → `/ai/chat` مؤسَّس على نفس JSON.

## 4. قابلية التوسع
- **مزود جديد**: ملف واحد يطبق `MarketDataProvider` (يستفيد من `providers/support`: ميزانية، مخزن، مجمّع تكّات، socket) + سطر في `ProviderRegistry` + رموزه في `Instrument Master`.
- **عامل تحليلي جديد**: detector + factor key + وزن (مع bump للإصدار) + نص دليل ar/en.
- **وحدة منتج جديدة**: سطر في `modules.ts` + مسار في `apps/web/src/app`.
- **أفقيًا**: API stateless (JWT) → عدة instances خلف load balancer + Redis pub/sub للـWS.
