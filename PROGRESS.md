# PROGRESS.md — سجل تقدم TradingWorld

> هذا الملف هو **المرجع الحي** لحالة المشروع. أي تعديل أو إضافة تُسجَّل هنا، وكل جزئية تنتقل إلى «✅ معتمد» فقط بعد مراجعة صاحب المشروع ووضع ☑ في عمود الاعتماد.
>
> دليل الحالات: ⬜ مخطط · 🟦 هيكل أولي (يعمل كواجهة/بنية) · 🟨 قيد التنفيذ · 🟩 منجز (مكتمل ومختبَر) · ✅ معتمد (راجعه صاحب المشروع)

**آخر تحديث:** 2026-10-19 · **الإصدار:** 0.1.0 · **المحرك:** engine 1.0.0 / scoring-v1

---

## 1. لوحة الحالة العامة

| المكوّن | الحالة | الاختبارات | ملاحظات |
|---|---|---|---|
| Monorepo (pnpm workspaces) + CI | 🟩 | — | `pnpm typecheck && pnpm test` يمران |
| packages/shared | 🟩 | — | أنواع · schemas · سجل الـ60 وحدة · حاسبات · جلسات |
| packages/analysis-engine | 🟩 | 13 ✓ | حتمي ومُنسَّخ؛ انظر §3 |
| apps/api | 🟩 (MVP) | 5 ✓ | مستودعات ذاكرة افتراضيًا؛ Prisma لاحقًا (DB-02) |
| apps/web | 🟩 (MVP shell) | build ✓ | 24 مسارًا؛ RTL/LTR؛ داكن Premium |
| packages/db (Prisma + Timescale) | 🟦 | — | schema كاملة؛ لم يُولَّد client بعد (يحتاج DATABASE_URL) |
| services/ml | 🟦 | 3 ✓ | Walk-forward + registry + weight proposals |
| التوثيق (PROJECT.md + docs/) | 🟩 | — | |

---

## 2. الوحدات الستون (من المواصفة)

| # | الوحدة | المسار | المرحلة | الحالة | معتمد | ما أُنجز / ما يلزم |
|---|---|---|---|---|---|---|
| 1 | 🏠 الرئيسية — Dashboard | `/` | MVP | 🟦 هيكل أولي | ☐ | Dashboard بـWatchlist overview + ساعة التداول + إجراءات سريعة. يحتاج: Widgets قابلة للسحب، Focus Mode |
| 2 | 📊 التحليل — Analysis | `/chart` | MVP | 🟨 قيد التنفيذ | ☐ | شارت lightweight-charts + overlay مناطق + مستويات + markers BOS/CHoCH + Side Panel + تفاصيل المنطقة. يحتاج: أدوات الرسم، حفظ التحليل، مقارنة الأصول |
| 3 | 🧠 المعلومات الخاصة — Proprietary Intelligence | `/intel` | P2 | ⬜ مخطط | ☐ |  |
| 4 | 🤖 مساعد التحليل بالـAI — AI Analysis Assistant | `/chart#ai` | MVP | 🟨 قيد التنفيذ | ☐ | AI Chat مؤسَّس على JSON المحرك؛ مُفسِّر حتمي + Claude اختياري |
| 5 | 🧩 الاستراتيجيات — Strategies | `/strategies` | P2 | ⬜ مخطط | ☐ |  |
| 6 | 🎯 الـSetups — Setups | `/setups` | P2 | ⬜ مخطط | ☐ |  |
| 7 | 💻 الخوارزميات والأكواد الخاصة — Proprietary Algorithms | `/admin/algorithms` | P2 | ⬜ مخطط | ☐ |  |
| 8 | 🔍 فاحص الأسواق — Market Scanner | `/scanner` | P2 | ⬜ مخطط | ☐ |  |
| 9 | 🗺️ خريطة الأسواق — Market Map | `/market-map` | P3 | ⬜ مخطط | ☐ |  |
| 10 | 📈 نظرة عامة على الأسواق — Market Overview | `/markets` | MVP | 🟦 هيكل أولي | ☐ | بطاقات لكل أصل: سعر/نظام/تقلب/HTF/عدد المناطق |
| 11 | 🔔 التنبيهات الذكية — Smart Alerts | `/alerts` | MVP | 🟦 هيكل أولي | ☐ | تنبيهات سعر + دخول منطقة؛ تقييم لحظي عبر WS. يحتاج: Push/Email |
| 12 | ⏱️ ساعة التداول — Trading Clock | `/tools/clock` | MVP | 🟦 هيكل أولي | ☐ | ساعة UTC/محلي + شريط الجلسات + الجلسة التالية |
| 13 | 🌍 توقيت الأسواق والجلسات — Market Sessions & Time Zones | `/tools/sessions` | MVP | 🟦 هيكل أولي | ☐ | لوحة الجلسات + محول المناطق الزمنية |
| 14 | 📰 الأخبار المباشرة — Live Market News | `/news` | P2 | ⬜ مخطط | ☐ |  |
| 15 | 📅 التقويم الاقتصادي — Economic Calendar | `/calendar` | P2 | ⬜ مخطط | ☐ |  |
| 16 | 🧮 حاسبة المخاطرة — Risk Calculator | `/tools/risk` | MVP | 🟦 هيكل أولي | ☐ | حسابات R/R، Risk $, Position size، تحذيرات — دوال مشتركة في shared |
| 17 | 💰 حاسبة الصفقات — Position Calculator | `/tools/position` | MVP | 🟦 هيكل أولي | ☐ | نفس المحرك الحسابي مع Long/Short. يحتاج: Multiple targets |
| 18 | 📐 بناء السيناريوهات — Scenario Builder | `/scenarios` | P2 | ⬜ مخطط | ☐ |  |
| 19 | 🔬 مختبر الاختبار التاريخي — Backtesting Lab | `/lab/backtest` | MVP | 🟦 هيكل أولي | ☐ | Walk-forward للمناطق في المتصفح بنفس محرك الإنتاج (بدون look-ahead): Reacted/Invalidated/MFE/MAE حسب الجودة/الأصل/العوامل/الجلسة |
| 20 | ⏪ إعادة تشغيل السوق — Market Replay | `/lab/replay` | P3 | ⬜ مخطط | ☐ |  |
| 21 | 🧪 اختبار الاستراتيجيات — Strategy Tester | `/lab/strategy` | P3 | ⬜ مخطط | ☐ |  |
| 22 | 📖 دفتر التداول — Trading Playbook | `/playbook` | P2 | ⬜ مخطط | ☐ |  |
| 23 | 🧠 ذاكرة المتداول — Trader Memory | `/memory` | P3 | ⬜ مخطط | ☐ |  |
| 24 | 🤖 مراجعة الصفقة بالـAI — AI Trade Review | `/journal/review` | P3 | ⬜ مخطط | ☐ |  |
| 25 | 🔎 البحث عن الأنماط التاريخية — Historical Pattern Search | `/lab/patterns` | P4 | ⬜ مخطط | ☐ |  |
| 26 | 🧩 محرك توافق التحليل — Confluence Engine | `/chart#confluence` | MVP | 🟨 قيد التنفيذ | ☐ | 10 عوامل بأوزان SCORING_V1 ودليل لكل عامل |
| 27 | 📒 سجل التداول — Trading Journal | `/journal` | MVP | 🟦 هيكل أولي | ☐ | تسجيل صفقات + R multiple + Win rate + حذف. يحتاج: صور، فلاتر، ربط بالمنطقة في الواجهة |
| 28 | 📈 تتبع الصفقات — Trade Tracker | `/journal/tracker` | P2 | ⬜ مخطط | ☐ |  |
| 29 | 📊 تحليل أداء المتداول — Performance Analytics | `/journal/performance` | P2 | ⬜ مخطط | ☐ |  |
| 30 | 🧠 تتبع الحالة النفسية — Psychology Tracker | `/journal/psychology` | P3 | ⬜ مخطط | ☐ |  |
| 31 | 🔄 روتين التداول اليومي — Daily Trading Routine | `/routine` | P2 | ⬜ مخطط | ☐ |  |
| 32 | 📝 الملاحظات — Notes | `/notes` | P2 | ⬜ مخطط | ☐ |  |
| 33 | 🖼️ حفظ تحليلات الشارت — Chart Snapshots | `/snapshots` | P2 | ⬜ مخطط | ☐ |  |
| 34 | 🔗 ربط الصفقة بالتحليل — Trade-to-Chart Linking | `/journal#links` | P2 | ⬜ مخطط | ☐ |  |
| 35 | 📚 التعلم من الصفقات — Learn From Your Trades | `/journal/lessons` | P3 | ⬜ مخطط | ☐ |  |
| 36 | 🎯 الأهداف والإنجازات — Goals & Progress | `/goals` | P2 | ⬜ مخطط | ☐ |  |
| 37 | 🎓 ابدأ من الصفر — Trading From Zero | `/academy/from-zero` | P2 | ⬜ مخطط | ☐ |  |
| 38 | 📚 أكاديمية التداول — Trading Academy | `/academy` | P2 | 🟦 هيكل أولي | ☐ | هيكل المسارات الست (من الصفر، الدليل، الأساسيات، القاموس، الحلال والحرام، الضوابط الشرعية). يحتاج: المحتوى |
| 39 | 🧭 شرح مجال التداول بالكامل — Trading World Guide | `/academy/guide` | P2 | ⬜ مخطط | ☐ |  |
| 40 | 💡 أساسيات الأسواق — Market Fundamentals | `/academy/fundamentals` | P2 | ⬜ مخطط | ☐ |  |
| 41 | 📖 قاموس التداول — Trading Dictionary | `/academy/dictionary` | P2 | ⬜ مخطط | ☐ |  |
| 42 | 🕌 الحلال والحرام في التداول — Islamic Trading Guide | `/academy/islamic` | P2 | ⬜ مخطط | ☐ |  |
| 43 | ⚖️ الأحكام والضوابط الشرعية — Shariah Guidelines | `/academy/shariah` | P2 | ⬜ مخطط | ☐ |  |
| 44 | 📚 المقالات والتعليم — Education | `/academy/articles` | P2 | ⬜ مخطط | ☐ |  |
| 45 | 💬 المجتمع — Community | `/community` | P3 | 🟦 هيكل أولي | ☐ | صفحة تعريفية + البنية (WS/أدوار/Audit) جاهزة |
| 46 | 🔐 الغرف والسيرفرات الخاصة — Private Rooms | `/community/rooms` | P3 | ⬜ مخطط | ☐ |  |
| 47 | 👥 مساحات الفرق — Team Workspaces | `/community/teams` | P3 | ⬜ مخطط | ☐ |  |
| 48 | 🏆 نظام الإنجازات والتقدم — Progress System | `/progress` | P3 | ⬜ مخطط | ☐ |  |
| 49 | ☁️ المزامنة بين الأجهزة — Cloud Sync | `/settings/sync` | P2 | ⬜ مخطط | ☐ |  |
| 50 | 🔎 البحث الشامل — Global Search | `/search` | P2 | 🟦 هيكل أولي | ☐ | ⌘K: بحث في الوحدات والأصول |
| 51 | ⏰ المنبهات والتذكيرات — Alarms & Reminders | `/tools/alarms` | P2 | ⬜ مخطط | ☐ |  |
| 52 | ⏱️ المؤقت — Timer | `/tools/timer` | MVP | 🟦 هيكل أولي | ☐ | Presets + صوت اختياري |
| 53 | ⏱️ ساعة الإيقاف — Stopwatch | `/tools/stopwatch` | MVP | 🟦 هيكل أولي | ☐ | Laps |
| 54 | 🧮 الحاسبة العامة — Calculator | `/tools/calculator` | MVP | 🟦 هيكل أولي | ☐ | تعبيرات + اختصارات R/% |
| 55 | 🌍 محول المناطق الزمنية — Time Zone Converter | `/tools/timezones` | MVP | 🟦 هيكل أولي | ☐ | DST-aware |
| 56 | 👤 الملف الشخصي — Profile | `/profile` | MVP | 🟦 هيكل أولي | ☐ | بطاقة المستخدم + Watchlist |
| 57 | ⚙️ الإعدادات — Settings | `/settings` | MVP | 🟦 هيكل أولي | ☐ | اللغة/الأصل/الفريم/الوضع الافتراضي |
| 58 | 🛡️ لوحة الإدارة — Admin Panel | `/admin` | MVP | 🟦 هيكل أولي | ☐ | Overview · users · roles · zone log · audit · AI research (factor frequency) |
| 59 | 🔒 نظام الصلاحيات والحماية — Security & Permissions | `/admin/security` | MVP | 🟨 قيد التنفيذ | ☐ | JWT/scrypt/RBAC/rate-limit/helmet/zod/audit. يحتاج: 2FA، جلسات/أجهزة، Prisma sessions |
| 60 | 💳 الاشتراكات والباقات — Subscriptions & Plans | `/plans` | P3 | ⬜ مخطط | ☐ |  |

---

## 3. محرك التحليل — بنود MVP V1 (المواصفة §43)

| # | البند | الحالة | معتمد | التفاصيل |
|---|---|---|---|---|
| 1 | تسجيل المستخدم | 🟩 | ☐ | register/login/me · JWT · scrypt · أول مستخدم Admin |
| 2 | شارت احترافي | 🟨 | ☐ | شموع · zoom/pan · crosshair · فريمات · مستويات · markers · overlay مناطق. يلزم: أدوات الرسم، أنواع الشارت، Multi-chart |
| 3 | Real-Time Data | 🟩 (demo/binance) | ☐ | WS تحديث الشمعة الحالية دون إعادة تحميل |
| 4 | Historical Data | 🟩 | ☐ | `/candles` مع `to` للتحميل التدريجي |
| 5 | Multi-Timeframe | 🟩 | ☐ | HTF candles من المزود أو تجميع داخلي؛ سياق 1w→1d→4h→1h→15m حسب الفريم |
| 6 | Liquidity Detection | 🟩 | ☐ | EQH/EQL · Swing · PDH/PDL/PWH/PWL · Session H/L · Sweeps + reclaim |
| 7 | Market Structure | 🟩 | ☐ | Swings fractal بلا repaint · BOS/CHoCH بالإغلاق فقط · bias |
| 8 | FVG | 🟩 | ☐ | 3-candle + mitigation + fill ratio + حد أدنى بالـATR |
| 9 | BOS / CHoCH | 🟩 | ☐ | |
| 10 | HTF Levels | 🟩 | ☐ | Swing H/L · FVG · OB · EQH/EQL من الفريمات الأعلى |
| 11 | AI Zone Detection | 🟩 | ☐ | مرشحون من FVG/OB/Sweep-reclaim/HTF level → دمج وفلترة |
| 12 | Zone Scoring | 🟩 | ☐ | SCORING_V1 (10 عوامل = 100) · HIGH≥72 · MEDIUM≥52 |
| 13 | Zone Explanation | 🟩 | ☐ | أسماء تحليلية · أسباب · نقاط ضعف · إبطال — ar/en |
| 14 | Zone Lifecycle | 🟩 | ☐ | DETECTED→…→INVALIDATED بإعادة التشغيل الحتمي |
| 15 | Alerts | 🟩 (in-app) | ☐ | سعر/منطقة · لا تقول BUY/SELL. يلزم Push/Email |
| 16 | AI Chat | 🟩 | ☐ | مُفسِّر حتمي + Claude (SDK) مؤسَّس على JSON |
| 17 | Watchlist | 🟩 | ☐ | |
| 18 | Admin Dashboard | 🟩 (أساسي) | ☐ | |
| 19 | Data Logging | 🟩 (memory) | ☐ | zoneLog → جدول Zone عند تفعيل Prisma |
| 20 | Backtesting أساسي | 🟩 | ☐ | Lab في المتصفح بدون look-ahead |

---

## 4. مهام البنية التحتية المفتوحة

| المعرف | المهمة | الأولوية | الحالة |
|---|---|---|---|
| DATA-01 | اعتماد مزود بيانات مرخص (Twelve Data / Polygon) وتوقيع العقد | 🔴 عالية | ⬜ |
| DATA-02 | Backfill تاريخي إلى Timescale + job تجميع الشموع | 🔴 | ⬜ |
| DB-01 | تشغيل `prisma generate` + migrations + seed للـInstrument Master | 🔴 | ⬜ |
| DB-02 | Prisma repositories تطبق نفس واجهة `Repositories` | 🔴 | ⬜ |
| RT-01 | Redis pub/sub للـWS عند أكثر من instance | 🟠 | ⬜ |
| SEC-01 | 2FA + جدول Sessions/الأجهزة + revoke | 🟠 | ⬜ |
| SEC-02 | Secrets manager + تدوير JWT | 🟠 | ⬜ |
| AI-01 | Outcome tracker يملأ `ZoneOutcome` عند انتهاء دورة الحياة | 🔴 | ⬜ |
| AI-02 | Zone feedback 👍/👎 (منفصل عن نتائج السوق) | 🟠 | ⬜ |
| AI-03 | أول تدريب walk-forward على ≥ 5k منطقة ← اقتراح scoring-v2 | 🟢 | ⬜ |
| UI-01 | أدوات الرسم (خطوط، فيبوناتشي، مستطيلات) مرتبطة بالوقت/السعر | 🔴 | ⬜ |
| UI-02 | Widgets قابلة للسحب في Dashboard + Focus Mode | 🟠 | ⬜ |
| UI-03 | Light theme | 🟢 | ⬜ |
| OPS-01 | Monitoring (OpenTelemetry) + logs + alerting | 🟠 | ⬜ |
| OPS-02 | Backups يومية + اختبار استرجاع | 🔴 | ⬜ |
| NOTIF-01 | Push (Web Push) + Email للتنبيهات | 🟠 | ⬜ |
| QA-01 | ESLint + Prettier + husky pre-commit لكل الحزم | 🟢 | ⬜ |

---

## 5. سجل التعديلات والإضافات (Changelog)

> كل سطر: التاريخ · النطاق · ما تغير · الحالة · معتمد (☐/☑ + التاريخ). الأسطر الجديدة تُضاف في الأعلى.

| التاريخ | النطاق | التغيير | الحالة | معتمد |
|---|---|---|---|---|
| 2026-10-19 | docs | إنشاء PROJECT.md و PROGRESS.md و docs/ (11 وثيقة + 4 ADR) و README | 🟩 | ☐ |
| 2026-10-19 | services/ml | خدمة FastAPI: features · walk-forward · registry · propose_weights + 3 اختبارات | 🟦 | ☐ |
| 2026-10-19 | packages/db | Prisma schema (16 نموذجًا) + SQL hypertable/compression | 🟦 | ☐ |
| 2026-10-19 | apps/web | Next.js 15: Shell/RTL/⌘K · Chart + overlay مناطق · Side Panel · Zone Details · AI Chat · Dashboard · Markets · Alerts · Journal · Tools (8) · Academy · Community · Modules · Settings · Profile · Admin · Backtest Lab · Login | 🟩 | ☐ |
| 2026-10-19 | apps/api | Fastify 5: config · auth/JWT/RBAC · providers (demo/binance/twelvedata) · AnalysisService · AlertService · AiService (Claude SDK + حتمي) · routes (health/auth/market/user/admin) · WS gateway · 5 اختبارات | 🟩 | ☐ |
| 2026-10-19 | packages/analysis-engine | المحرك v1.0.0 / scoring-v1: 12 مكتشفًا · MTF · scoring · naming · lifecycle · explainer · LLM grounding · synthetic market · 13 اختبارًا | 🟩 | ☐ |
| 2026-10-19 | packages/shared | timeframes · instruments · sessions · modules(60) · roles · zod schemas · calculators · i18n | 🟩 | ☐ |
| 2026-10-19 | repo | تهيئة monorepo (pnpm) · tsconfig · docker-compose (Timescale/Redis) · Dockerfiles · CI | 🟩 | ☐ |

---

## 6. سجل إصدارات المحرك والتقييم

| engineVersion | scoringVersion | التاريخ | ما تغير | معتمد |
|---|---|---|---|---|
| 1.0.0 | scoring-v1 | 2026-10-19 | الإصدار الأول: 10 عوامل (18/16/15/13/10/8/7/5/5/3) | ☐ |

---

## 7. كيف تُحدِّث هذا الملف
1. عند بدء العمل على وحدة: غيّر حالتها إلى 🟨 وأضف سطرًا في §5.
2. عند الانتهاء والاختبار: 🟩 + سطر في §5.
3. عند اعتماد صاحب المشروع: ✅ في الجدول + ☑ وتاريخ في عمود «معتمد».
4. أي تغيير في أوزان/منطق المحرك: سطر في §6 + bump للإصدار في `packages/analysis-engine/src/version.ts`.
