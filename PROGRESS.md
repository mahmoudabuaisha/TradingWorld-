# PROGRESS.md — سجل تقدم TradingWorld

> هذا الملف هو **المرجع الحي** لحالة المشروع. أي تعديل أو إضافة تُسجَّل هنا، وكل جزئية تنتقل إلى «✅ معتمد» فقط بعد مراجعة صاحب المشروع ووضع ☑ في عمود الاعتماد.
>
> دليل الحالات: ⬜ مخطط · 🟦 هيكل أولي (يعمل كواجهة/بنية) · 🟨 قيد التنفيذ · 🟩 منجز (مكتمل ومختبَر) · ✅ معتمد (راجعه صاحب المشروع)

**آخر تحديث:** 2026-10-20 · **الإصدار:** 0.4.0 · **المحرك:** engine 1.1.1 / scoring-v1

---

## 1. لوحة الحالة العامة

| المكوّن | الحالة | الاختبارات | ملاحظات |
|---|---|---|---|
| Monorepo (pnpm workspaces) + CI | 🟩 | — | `pnpm typecheck && pnpm test` يمران |
| packages/shared | 🟩 | — | أنواع · schemas · سجل الـ60 وحدة · حاسبات · جلسات |
| packages/analysis-engine | 🟩 | 14 ✓ | حتمي ومُنسَّخ (1.1.0)؛ انظر §3 |
| apps/api | 🟩 (MVP) | 6 ✓ | مستودعات ذاكرة افتراضيًا؛ Prisma لاحقًا (DB-02) |
| apps/web | 🟩 (MVP shell) | build ✓ | 24 مسارًا؛ RTL/LTR؛ لغة «خريطة» كاملة (A إلى D) |
| نظام التصميم «خريطة» | ✅ معتمد | — | docs/12 · ADR-0005 · المراحل الأربع منجزة |
| packages/db (Prisma + Timescale) | 🟦 | — | schema كاملة؛ لم يُولَّد client بعد (يحتاج DATABASE_URL) |
| services/ml | 🟦 | 3 ✓ | Walk-forward + registry + weight proposals |
| التوثيق (PROJECT.md + docs/) | 🟩 | — | |

---

## 2. الوحدات الستون (من المواصفة)

| # | الوحدة | المسار | المرحلة | الحالة | معتمد | ما أُنجز / ما يلزم |
|---|---|---|---|---|---|---|
| 1 | 🏠 الرئيسية — Dashboard | `/` | MVP | 🟨 قيد التنفيذ | ☐ | الورقة اليومية (خريطة): ماذا تغير منذ الأمس، المتابعة كتضاريس، روتين اليوم (محفوظ محليًا)، الصفقات المفتوحة بخط أبعاد، ساعة المسح. يحتاج: Widgets قابلة للسحب، Focus Mode، حفظ الروتين في الخادم |
| 2 | 📊 التحليل — Analysis | `/chart` | MVP | 🟨 قيد التنفيذ | ☐ | شارت lightweight-charts + overlay مناطق + مستويات + markers BOS/CHoCH + Side Panel + تفاصيل المنطقة + أدوات الرسم بالطباشير (UI-01). يحتاج: حفظ التحليل كلقطة، مقارنة الأصول، أدوات إضافية (شعاع، قناة، نص) |
| 3 | 🧠 المعلومات الخاصة — Proprietary Intelligence | `/intel` | P2 | ⬜ مخطط | ☐ |  |
| 4 | 🤖 مساعد التحليل بالـAI — AI Analysis Assistant | `/chart#ai` | MVP | 🟨 قيد التنفيذ | ☐ | AI Chat مؤسَّس على JSON المحرك؛ مُفسِّر حتمي + Claude اختياري |
| 5 | 🧩 الاستراتيجيات — Strategies | `/strategies` | P2 | ⬜ مخطط | ☐ |  |
| 6 | 🎯 الـSetups — Setups | `/setups` | P2 | ⬜ مخطط | ☐ |  |
| 7 | 💻 الخوارزميات والأكواد الخاصة — Proprietary Algorithms | `/admin/algorithms` | P2 | ⬜ مخطط | ☐ |  |
| 8 | 🔍 فاحص الأسواق — Market Scanner | `/scanner` | P2 | ⬜ مخطط | ☐ |  |
| 9 | 🗺️ خريطة الأسواق — Market Map | `/market-map` | P3 | ⬜ مخطط | ☐ |  |
| 10 | 📈 نظرة عامة على الأسواق — Market Overview | `/markets` | MVP | 🟨 قيد التنفيذ | ☐ | مسح الأسواق: صف تضاريس لكل أصل مجمّعًا بالفئة، سعر وتغير، حالة وتقلب، انحياز بتهشير، عدد المناطق وأقواها، متابعة؛ تحديث كل 30 ثانية. يلزم: أخبار وجلسة وملخص فني |
| 11 | 🔔 التنبيهات الذكية — Smart Alerts | `/alerts` | MVP | 🟨 قيد التنفيذ | ☐ | ورقة تنبيهات: نموذج بحقول معنونة، صفوف بالشرط والسعر والحالة (ACTIVE / TRIGGERED بوقت)؛ مراقب على الخادم يُطلق كل تنبيه مرة واحدة بلا متصفح مفتوح؛ صندوق إشعارات مع نتيجة كل قناة وجرس بعدد غير المقروء؛ Web Push وبريد (NOTIF-01). يحتاج: شروط Setup والمؤشرات والجلسة والخبر |
| 12 | ⏱️ ساعة التداول — Trading Clock | `/tools/clock` | MVP | 🟦 هيكل أولي | ☐ | ساعة UTC/محلي + شريط الجلسات + الجلسة التالية |
| 13 | 🌍 توقيت الأسواق والجلسات — Market Sessions & Time Zones | `/tools/sessions` | MVP | 🟦 هيكل أولي | ☐ | لوحة الجلسات + محول المناطق الزمنية |
| 14 | 📰 الأخبار المباشرة — Live Market News | `/news` | P2 | ⬜ مخطط | ☐ |  |
| 15 | 📅 التقويم الاقتصادي — Economic Calendar | `/calendar` | P2 | ⬜ مخطط | ☐ |  |
| 16 | 🧮 حاسبة المخاطرة — Risk Calculator | `/tools/risk` | MVP | 🟦 هيكل أولي | ☐ | حسابات R/R، Risk $, Position size، تحذيرات — دوال مشتركة في shared |
| 17 | 💰 حاسبة الصفقات — Position Calculator | `/tools/position` | MVP | 🟦 هيكل أولي | ☐ | نفس المحرك الحسابي مع Long/Short. يحتاج: Multiple targets |
| 18 | 📐 بناء السيناريوهات — Scenario Builder | `/scenarios` | P2 | ⬜ مخطط | ☐ |  |
| 19 | 🔬 مختبر الاختبار التاريخي — Backtesting Lab | `/lab/backtest` | MVP | 🟦 هيكل أولي | ☐ | Walk-forward للمناطق في المتصفح بنفس محرك الإنتاج (بدون look-ahead): كتلة عنوان بالنتائج وجداول بتهشير حسب الجودة/الأصل/العوامل/الجلسة؛ REACTED يُحسب عند أول تفاعل حتى لو كُسرت المنطقة لاحقًا، وMFE/MAE من أول لمسة |
| 20 | ⏪ إعادة تشغيل السوق — Market Replay | `/lab/replay` | P3 | ⬜ مخطط | ☐ |  |
| 21 | 🧪 اختبار الاستراتيجيات — Strategy Tester | `/lab/strategy` | P3 | ⬜ مخطط | ☐ |  |
| 22 | 📖 دفتر التداول — Trading Playbook | `/playbook` | P2 | ⬜ مخطط | ☐ |  |
| 23 | 🧠 ذاكرة المتداول — Trader Memory | `/memory` | P3 | ⬜ مخطط | ☐ |  |
| 24 | 🤖 مراجعة الصفقة بالـAI — AI Trade Review | `/journal/review` | P3 | ⬜ مخطط | ☐ |  |
| 25 | 🔎 البحث عن الأنماط التاريخية — Historical Pattern Search | `/lab/patterns` | P4 | ⬜ مخطط | ☐ |  |
| 26 | 🧩 محرك توافق التحليل — Confluence Engine | `/chart#confluence` | MVP | 🟨 قيد التنفيذ | ☐ | 10 عوامل بأوزان SCORING_V1 ودليل لكل عامل |
| 27 | 📒 سجل التداول — Trading Journal | `/journal` | MVP | 🟨 قيد التنفيذ | ☐ | كتلة عنوان بالإحصاءات، نموذج معنون مع خط أبعاد حي أثناء الإدخال، صفوف بالـR مع تهشير، تفصيل الصفقة بخط أبعاد والملاحظات. يحتاج: صور، فلاتر، ربط بالمنطقة في الواجهة |
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
| 50 | 🔎 البحث الشامل — Global Search | `/search` | P2 | 🟦 هيكل أولي | ☐ | ⌘K: بحث في الأوراق (برقم الورقة وكود الأطلس) والأصول |
| 51 | ⏰ المنبهات والتذكيرات — Alarms & Reminders | `/tools/alarms` | P2 | ⬜ مخطط | ☐ |  |
| 52 | ⏱️ المؤقت — Timer | `/tools/timer` | MVP | 🟦 هيكل أولي | ☐ | Presets + صوت اختياري |
| 53 | ⏱️ ساعة الإيقاف — Stopwatch | `/tools/stopwatch` | MVP | 🟦 هيكل أولي | ☐ | Laps |
| 54 | 🧮 الحاسبة العامة — Calculator | `/tools/calculator` | MVP | 🟦 هيكل أولي | ☐ | تعبيرات + اختصارات R/% |
| 55 | 🌍 محول المناطق الزمنية — Time Zone Converter | `/tools/timezones` | MVP | 🟦 هيكل أولي | ☐ | DST-aware |
| 56 | 👤 الملف الشخصي — Profile | `/profile` | MVP | 🟦 هيكل أولي | ☐ | بطاقة المستخدم + Watchlist |
| 57 | ⚙️ الإعدادات — Settings | `/settings` | MVP | 🟦 هيكل أولي | ☐ | المسح ليلي/نهاري/النظام، ألوان الاتجاه (خريطة أو كلاسيكي)، اللغة، الأصل، الفريم، وضع التحليل، المناطق منخفضة الجودة والمبطلة |
| 58 | 🛡️ لوحة الإدارة — Admin Panel | `/admin` | MVP | 🟦 هيكل أولي | ☐ | ورقة النظام: كتلة عنوان، مصادر البيانات، حالة الأوراق، أوزان التقييم كتهشير، ورقة الأبحاث (تكرار العوامل). يلزم: إدارة المستخدمين والمحتوى من الواجهة |
| 59 | 🔒 نظام الصلاحيات والحماية — Security & Permissions | `/admin/security` | MVP | 🟨 قيد التنفيذ | ☐ | JWT/scrypt/RBAC/rate-limit/helmet/zod/audit. يحتاج: 2FA، جلسات/أجهزة، Prisma sessions |
| 60 | 💳 الاشتراكات والباقات — Subscriptions & Plans | `/plans` | P3 | ⬜ مخطط | ☐ |  |

---

## 3. محرك التحليل — بنود MVP V1 (المواصفة §43)

| # | البند | الحالة | معتمد | التفاصيل |
|---|---|---|---|---|
| 1 | تسجيل المستخدم | 🟩 | ☐ | register/login/me · JWT · scrypt · أول مستخدم Admin |
| 2 | شارت احترافي | 🟨 | ☐ | شموع · zoom/pan · crosshair · فريمات · مستويات · markers · مناطق مهشّرة بكنتور وختم · تعليق مساحي بخط دليل · أبعاد المسافة والصفقات المفتوحة. يلزم: أدوات الرسم، أنواع الشارت، Multi-chart |
| 3 | Real-Time Data | 🟩 (demo/binance) | ☐ | WS تحديث الشمعة الحالية دون إعادة تحميل |
| 4 | Historical Data | 🟩 | ☐ | `/candles` مع `to` للتحميل التدريجي |
| 5 | Multi-Timeframe | 🟩 | ☐ | HTF candles من المزود أو تجميع داخلي؛ سياق 1w→1d→4h→1h→15m حسب الفريم؛ سلاسل HTF تُخدم من مخزن الشموع فلا تستهلك رصيد المزود مع كل تحليل |
| 6 | Liquidity Detection | 🟩 | ☐ | EQH/EQL · Swing · PDH/PDL/PWH/PWL · Session H/L · Sweeps + reclaim |
| 7 | Market Structure | 🟩 | ☐ | Swings fractal بلا repaint · BOS/CHoCH بالإغلاق فقط · bias |
| 8 | FVG | 🟩 | ☐ | 3-candle + mitigation + fill ratio + حد أدنى بالـATR |
| 9 | BOS / CHoCH | 🟩 | ☐ | |
| 10 | HTF Levels | 🟩 | ☐ | Swing H/L · FVG · OB · EQH/EQL من الفريمات الأعلى |
| 11 | AI Zone Detection | 🟩 | ☐ | مرشحون من FVG/OB/Sweep-reclaim/HTF level → دمج وفلترة |
| 12 | Zone Scoring | 🟩 | ☐ | SCORING_V1 (10 عوامل = 100) · HIGH≥72 · MEDIUM≥52 |
| 13 | Zone Explanation | 🟩 | ☐ | أسماء تحليلية · أسباب · نقاط ضعف · إبطال — ar/en |
| 14 | Zone Lifecycle | 🟩 | ☐ | DETECTED→…→INVALIDATED بإعادة التشغيل الحتمي؛ المبطلة حديثًا تُعرض بختم عند الطلب (`keepInvalidatedBars`) |
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
| DATA-01 | اعتماد مزود بيانات مرخص (Twelve Data / Polygon) وتوقيع العقد | 🔴 عالية | 🟩 الهندسة (توجيه حسب الفئة، Twelve Data + Polygon بميزانية ومخزن وبث، حالة التدفق، feed:check، ADR-0006) · ⬜ توقيع العقد — قائمة التحقق في docs/03 |
| DATA-02 | Backfill تاريخي إلى Timescale + job تجميع الشموع | 🔴 | 🟩 مخزن `CandleStore` (ذاكري/Timescale) خلف المزودين، تعبئة بصفحات، لحاق، إصلاح فجوات واعٍ بساعات السوق، اشتقاق كل الفريمات من 1m، CLI `backfill`، لوحة الإدارة، اختبارات على Postgres حقيقي |
| DB-01 | تشغيل `prisma generate` + migrations + seed للـInstrument Master (جداول السوق خارج Prisma منذ DATA-02) | 🔴 | 🟩 الحزمة تبني العميل، ترحيل `20261020000000_init`، الزرع عند الإقلاع، الترحيل قبل تشغيل صورة Docker |
| DB-02 | Prisma repositories تطبق نفس واجهة `Repositories` | 🔴 | 🟩 `repositories/prisma.ts` + `REPOSITORIES=auto/memory/prisma` + اختبار عقد على التطبيقين + اختبار إعادة تشغيل |
| RT-01 | Redis pub/sub للـWS عند أكثر من instance | 🟠 | ⬜ |
| SEC-01 | 2FA + جدول Sessions/الأجهزة + revoke | 🟠 | ⬜ |
| SEC-02 | Secrets manager + تدوير JWT | 🟠 | ⬜ |
| AI-01 | Outcome tracker يملأ `ZoneOutcome` عند انتهاء دورة الحياة | 🔴 | 🟩 مفتاح منطقة ثابت، لقطة عند أول ملاحظة، وسم `outcome-v1` من الشموع المغلقة اللاحقة فقط (مشترك مع المختبر)، وظيفة دورية + قائمة مسح، إحصاءات ولوحة إدارة، مجموعة تدريب بشكل `services/ml` |
| AI-02 | Zone feedback 👍/👎 (منفصل عن نتائج السوق) | 🟠 | 🟩 ملاحظة ميدانية في بطاقة المنطقة (مفيد/غير مفيد، العامل الأكثر إقناعًا، ملاحظة)، صوت واحد قابل للتعديل والسحب، بلا عدادات عامة، لوحة إدارة مع جدول الرأي مقابل النتيجة |
| AI-03 | أول تدريب walk-forward على ≥ 5k منطقة ← اقتراح scoring-v2 | 🟢 | ⬜ |
| UI-01 | أدوات الرسم (خطوط، فيبوناتشي، مستطيلات) مرتبطة بالوقت/السعر، بالطباشير (لون الإنسان) | 🔴 | 🟩 خط اتجاه، أفقي، مستطيل، فيبوناتشي؛ تحديد وسحب الجسم والمقابض؛ اختصارات؛ مرساة (وقت، سعر) تعمل عبر الفريمات والمنطقة المستقبلية؛ حفظ على الخادم أو محليًا |
| UI-04 | خريطة المرحلة C: التعليق المساحي بخط دليل، كومة الأدلة، بوصلة الانحياز، قرص الجلسات، الختم على الشارت، الأبعاد في الحاسبات | 🔴 | 🟩 |
| UI-05 | خريطة المرحلة D: أشرطة التضاريس في الأسواق، بقية الأوراق، مراجعة الوصولية، خيار الأخضر/الأحمر الكلاسيكي | 🟠 | 🟩 |
| UI-02 | Widgets قابلة للسحب في Dashboard + Focus Mode | 🟠 | ⬜ |
| UI-03 | Light theme (المسح النهاري) | 🟢 | 🟩 |
| OPS-01 | Monitoring (OpenTelemetry) + logs + alerting | 🟠 | 🟩 مقاييس (`/metrics` + OTLP)، تتبع (HTTP وPrisma وpg وfetch والمهام)، سجلات JSON مربوطة بالأثر مع إخفاء الأسرار، مراقب داخلي بعشر قواعد يُبلغ المشرفين والـwebhook، لوحة «صحة النظام»، Prometheus/Grafana/Jaeger اختياريًا. يتبقى: فحص خارجي عند النشر، قياس تطبيق الويب |
| OPS-02 | Backups يومية + اختبار استرجاع | 🔴 | 🟩 نسخة يومية بلقطة واحدة وقائمة محتوى، تشفير age، نسخة خارجية rclone، احتفاظ GFS، اختبار استرجاع أسبوعي صفًا بصف (TimescaleDB أيضًا)، استرجاع الكارثة، لوحة الإدارة وفحص صحة الحاوية. يتبقى: ربط مزود تخزين حقيقي، وPITR لخفض RPO |
| NOTIF-01 | Push (Web Push) + Email للتنبيهات | 🟠 | 🟩 مراقب على الخادم، إطلاق ذري مرة واحدة، صندوق إشعارات، Web Push (VAPID) لكل الأجهزة، بريد SMTP اختياري، تفضيلات لكل مستخدم، أحداث WS للمالك فقط |
| QA-01 | ESLint + Prettier + husky pre-commit لكل الحزم | 🟢 | 🟩 ESLint بإعداد واحد (قواعد وعود تعتمد الأنواع، hooks، Next، a11y)، Prettier، ruff لخدمة ML، husky + lint-staged، فحص أنواع الاختبارات، بوابات CI |

---

## 5. سجل التعديلات والإضافات (Changelog)

> كل سطر: التاريخ · النطاق · ما تغير · الحالة · معتمد (☐/☑ + التاريخ). الأسطر الجديدة تُضاف في الأعلى.

| التاريخ | النطاق | التغيير | الحالة | معتمد |
|---|---|---|---|---|
| 2026-10-20 | apps/api · apps/web · infra · docs (OPS-01) | المراقبة: `ops/telemetry.ts` (OpenTelemetry: MeterProvider بقارئ Prometheus ومُصدِّر OTLP؛ تتبع HTTP وPrisma وpg وundici؛ مقاييس runtime؛ `traced()` لمهام الخلفية؛ إسقاط spans Prisma اليتيمة؛ `server.ts` يبدأ القياس وخطاف ESM قبل استيراد التطبيق)؛ `ops/metrics.ts` (زمن الطلب لكل مسار Fastify، WebSocket، المحرك، التنبيهات، الإشعارات، حالة كل مصدر وعمره، المزودون وميزانياتهم، المراقب، النسخ، الذاكرة)؛ `ops/observability.ts` (سجلات JSON بمستوى من البيئة وإخفاء الأسرار و`trace_id`، معرّف طلب يُقبل أو يُولَّد ويُعاد، تسمية span بالمسار، `/metrics` بالرمز وإلزامي في الإنتاج)؛ `ops/watchdog.ts` (محرك قواعد: انتظار ← قيام ← تكرار ← عودة، وعشر قواعد للمنصة منها اثنتان للإنتاج فقط؛ إبلاغ المشرفين عبر الصندوق وPush والبريد وwebhook متوافق مع Slack/Discord)؛ `GET /admin/ops` و`POST /admin/ops/evaluate|test` وقسم «صحة النظام» في لوحة الإدارة؛ `infra/monitoring` (Prometheus بعشر قواعد، Grafana بلوحة من 20 لوحة فرعية، Jaeger) وملف تعريف `monitoring` في docker-compose، و`restart: unless-stopped` وhealthcheck للـAPI. 11 اختبارًا جديدًا (101 في الـAPI). docs/14، docs/06/09، README، .env.example | 🟩 | ☐ |
| 2026-10-20 | apps/api (إصلاح أثناء OPS-01) | دقة قياس حلقة الأحداث 5000 ms جعلت `nodejs_eventloop_delay_p99` يقرأ 5 ثوانٍ على عملية خاملة (المقياس يتضمن فترة العينة)، فكانت قاعدة Prometheus ستقوم دائمًا؛ عادت إلى الافتراضي 10 ms. وملخصا قاعدتي المراقب وحلقة الأحداث صارا يصفان العاقبة عند القيام فقط، فلا يقول إشعار العودة «التنبيهات لا تُطلق» | 🟩 | ☐ |
| 2026-10-20 | repo (QA-01، إصلاح) | `services/` في `.prettierignore` كان يطابق أي مجلد بهذا الاسم فلم يُنسَّق `apps/api/src/services/` قط؛ الآن `/services/` وتنسيق الملفات السبعة في commit مستقل مثبت أنه بلا تغيير في الكود | 🟩 | ☐ |
| 2026-10-20 | infra · CI · apps/api (إصلاح بعد OPS-02) | (1) ملفا Docker للـAPI والويب يمرران `--filter ./packages/*` بلا اقتباس، فلم تُبنَ الصورتان قط (كشفته وظيفة CI الجديدة لبناء الصورة)؛ (2) صورة `ubuntu-latest` في CI لم تعد تحوي `postgresql-client-16`، فثُبّتت الوظائف على `ubuntu-24.04`؛ (3) الاسترجاع يرفض مبكرًا نسخة من `pg_dump` أحدث من خادم الهدف بدل الفشل في منتصفه (`SET transaction_timeout` من 17+ لا يعرفه 16) + اختبار | 🟩 | ☐ |
| 2026-10-20 | apps/api · infra · CI · docs (OPS-02) | النسخ الاحتياطي: `ops/backup.ts` + `tools/backup.ts` (`run`, `drill`, `restore`, `status`, `prune`, `schedule`). النسخة `pg_dump` للقاعدة كاملة داخل لقطة مُصدَّرة، مع قائمة بعدد صفوف كل جدول وبصمة محتوى للجداول حتى 200 ألف صف، وsha256، والترحيلات والإضافات؛ تشفير بمفاتيح age العامة؛ نسخة خارجية بـrclone مع مقارنة الحجم؛ احتفاظ محلي GFS (7/4/6) والأداة لا تحذف خارجيًا. اختبار الاسترجاع: جلب من الخارج ← checksum ← فك التشفير والاسترجاع في قاعدة مؤقتة (مع خطافات TimescaleDB) ← مقارنة الجداول صفًا بصف والترحيلات وفحص الإقلاع والـhypertables ← حذف القاعدة. `restore` يرفض قاعدة غير فارغة ويجلب الملف من الخارج. الجدولة تلحق عند الإقلاع. `GET /admin/backups` ولوحة «النسخ الاحتياطي» في الإدارة؛ خدمة `backup` في docker-compose مع فحص صحة؛ `pg_dump`/age/rclone في صورة الـAPI؛ وظيفتا CI جديدتان: اختبار استرجاع على TimescaleDB حقيقي، وبناء صورة الـAPI. 7 اختبارات جديدة (90 في الـAPI). docs/13 (دليل التشغيل والكارثة)، docs/05/06/09، .env.example | 🟩 | ☐ |
| 2026-10-20 | apps/api (config) | `loadConfig(env, { requireJwtSecret: false })` لأداة النسخ التي لا تتعامل مع الرموز؛ الخادم ما زال يرفض الإقلاع في الإنتاج بسر افتراضي | 🟩 | ☐ |
| 2026-10-20 | repo · CI (إصلاح) | الـCI كان أحمر في كل التشغيلات الـ13 منذ أول commit ولم يفحص شيئًا فعليًا: (1) `build:packages` يمرر `--filter ./packages/*` بلا اقتباس فيوسّعه الـshell قبل pnpm ويفشل الأمر؛ (2) pnpm 10 لا يشغّل سكربتات تثبيت التبعيات إلا بإذن، فلا تُنزَّل محركات Prisma ولا ثنائي esbuild. الآن الأنماط مقتبسة (`build:packages` و`dev`) و`onlyBuiltDependencies` في `pnpm-workspace.yaml`؛ تسلسل الـCI كاملًا مرّ في نسخة نظيفة من المستودع | 🟩 | ☐ |
| 2026-10-20 | repo (QA-01) | جودة الكود: `eslint.config.mjs` واحد للمستودع (typescript-eslint + `no-floating-promises`/`no-misused-promises`/`await-thenable` بالأنواع + react-hooks + Next.js core-web-vitals + jsx-a11y)؛ Prettier (عرض 140) مع `.prettierignore` (docs/ كما هي)؛ ruff لـ`services/ml`؛ husky + lint-staged قبل كل commit؛ `tsconfig.test.json` لكل حزمة لها اختبارات (كانت كل tsconfig تستثني `__tests__` فلم تُفحص أنواع الاختبارات قط)؛ سكربتات `lint`، `lint:fix`، `format`، `format:check`، `lint:py`، `check`؛ الـCI يشغّل format:check وlint وruff؛ تنسيق المستودع في commit مستقل مثبت أنه بلا تغيير في الكود (مقارنة شجرة الصياغة لكل ملف) ومسجل في `.git-blame-ignore-revs` | 🟩 | ☐ |
| 2026-10-20 | apps/api (إصلاحات من ESLint) | دوال async تُمرر إلى `setInterval` ومعالج الإشارات ومقبس WS: رفض غير معالج فيها يوقف عملية Node كاملة (نبضة المزود التجريبي، استطلاع Polygon وTwelve Data، مؤقت التحليل في WS، الإغلاق)؛ الآن كل وعد معالج | 🟩 | ☐ |
| 2026-10-20 | apps/web (إصلاحات من ESLint والتحقق) | (1) لوحة البحث ⌘K تعرض تلميح ESC لكن Escape لم يغلقها؛ هي وقائمة الأطالس في الهاتف الآن حوارات (`role="dialog"`) تُغلق بـEscape وبالنقر خارجها. (2) ثلاثة تعطيلات لـexhaustive-deps في الشارت كانت بعد السطر المقصود فلم تعطّل شيئًا. (3) سباق في تهيئة الشارت: المكتبة تُحمّل بشكل غير متزامن، فإن وصلت الشموع قبلها رسمت التهيئة بيانات قديمة فارغة، وظهرت شمعة حية واحدة تتكدس عليها كل العلامات. أُعيد إنتاجه بتأخير حزمة المكتبة 2.5 ثانية (8 أعمدة شموع بدل نحو 450)، والآن حالة `ready` تعيد تشغيل تأثيرات البيانات والتحليل والرسم بالقيم الحالية (454 عمودًا مع تأخير 6 ثوانٍ) | 🟩 | ☐ |
| 2026-10-20 | services/ml | ruff (F, E, W, I, UP, B, RUF) وتنسيقه؛ `zip(strict=True)` بين أسماء الخصائص ومعاملات النموذج | 🟩 | ☐ |
| 2026-10-20 | apps/api · packages/shared · packages/db (NOTIF-01) | التنبيهات تعمل بلا متصفح: `AlertService` أعيد بناؤه بمراقب على الخادم كل `ALERT_POLL_SECONDS` (آخر شمعتي 1m لكل رمز له تنبيه نشط)، `price_above` بالأعلى و`price_below` بالأدنى و`zone_enter` بحدود مخزنة (`zoneTop/zoneBottom`)، الشمعة الجارية عند إنشاء التنبيه تُقيَّم بإغلاقها فقط، والإطلاق ذري (`alerts.trigger`) فلا يتكرر بين المراقب وWS؛ `NotificationService`: صف في الصندوق دائمًا ثم Web Push (VAPID، TTL ساعة، حذف الاشتراك عند 404/410) وبريد SMTP (نص + HTML مع رابط وإخلاء مسؤولية) حسب التفضيلات (push مفعّل، email معطّل افتراضيًا) مع سجل نتيجة كل قناة؛ نماذج `PushSubscription` و`Notification` وترحيل `20261020210000_notifications`؛ مسارات `/notifications`، `/notifications/read`، `/notifications/settings`، `/push/subscriptions`، `/push/unsubscribe`، `/notifications/test`؛ أداة `vapid-keys`؛ 9 اختبارات جديدة (83 في الـAPI) | 🟩 | ☐ |
| 2026-10-20 | apps/api (إصلاح أمني) | أحداث التنبيه في WebSocket كانت تُبث لكل مشتركي الرمز، فيرى مستخدم آخر نص تنبيهك وملاحظتك. الآن المقبس يعرّف نفسه بـJWT (`token` في `subscribe` أو رسالة `auth`) وتُرسل `alert` و`notification` لمقابس المالك فقط؛ اختبار خصوصية بمقبسين حقيقيين | 🟩 | ☐ |
| 2026-10-20 | packages/shared (إصلاح) | تنبيه السعر كان يقبل سعرًا سالبًا أو صفرًا؛ الآن `price` موجب + اختبار | 🟩 | ☐ |
| 2026-10-20 | apps/web (NOTIF-01) | قسم «الإشعارات» في الإعدادات (حالة تهيئة Push والبريد، تفعيل/إيقاف Push في هذا المتصفح، تفضيل البريد، إشعار تجريبي مع نتيجة كل قناة)؛ صندوق الإشعارات في ورقة التنبيهات (غير المقروء، شرائح IN-APP/PUSH/EMAIL بالحالة، تعليم الكل كمقروء)؛ جرس بعدد غير المقروء في شريط الورقة؛ `sw.js` (إشعار بالاتجاه واللغة، النقر يفتح الرابط)؛ رابط عميق `/chart?symbol=`؛ تنبيه المنطقة يرسل حدودها؛ تحقق طرفي حقيقي: خادم SMTP محلي استلم البريد، وخدمة Push محلية عبر HTTPS تحققت من ترويسة VAPID وفكّت تشفير aes128gcm | 🟩 | ☐ |
| 2026-10-20 | packages/shared · apps/api · packages/db · apps/web (UI-01) | أدوات الرسم بالطباشير: `drawings.ts` في الحزمة المشتركة (الأنواع، مستويات الفيبوناتشي، تحويل الوقت↔رقم الشمعة الكسري مع الاستيفاء والاستقراء، اختبار الإصابة) + `drawingCreateSchema` + أول اختبارات للحزمة المشتركة (5)؛ نموذج `Drawing` وترحيل `20261020180000_drawings`؛ مستودع `drawings` على التطبيقين و`/drawings` (المالك فقط، عدد النقاط حسب النوع، حد 200 لكل أصل)؛ `DrawingToolbar` و`useDrawings` (الخادم أو `localStorage`، تحديث متفائل مع تراجع) والتفاعل والرسم داخل `TradingChart` (نقرة-نقرة بمعاينة، سحب الجسم/المقابض، إيقاف تمرير الشارت أثناء الرسم، كبت نقرة المنطقة تحت الرسم)؛ اختبار عبر متصفح حقيقي بأحداث فأرة ولوحة مفاتيح حقيقية | 🟩 | ☐ |
| 2026-10-20 | apps/web (3 إصلاحات) | (1) الشارت كان فارغًا من الشموع والشبكة منذ المرحلة C في بيئة لغتها `en-US@posix`: lightweight-charts ينسّق التواريخ بـ`navigator.language` فيرمي خطأ في كل رسم — الآن `localization.locale = "en-US"` صريح. (2) عميل الويب كان يرسل `content-type: application/json` مع طلبات DELETE بلا جسم فيرفضها Fastify بـ400 — كان حذف التنبيهات والصفقات من الواجهة معطلًا؛ الآن الترويسة مع الجسم فقط + اختبار انحدار. (3) `logicalToCoordinate` يرجع 0 لرقم شمعة كسري، فيُستوفى بين شمعتين متجاورتين | 🟩 | ☐ |
| 2026-10-20 | packages/shared · apps/api · packages/db · apps/web (AI-02) | رأي المستخدم في المنطقة: `zoneTrackKey` و`FACTOR_KEYS` و`zoneFeedbackSchema` في الحزمة المشتركة (المفتاح يُحسب في المتصفح والخادم بنفس الدالة)؛ مستودع `feedback` و`zones.get` على التطبيقين؛ ترحيل `20261020150000_zone_feedback`؛ `GET/PUT/DELETE /zones/:key/feedback` (منطقة متابَعة فقط، العامل يجب أن يكون حاضرًا، ملاحظة ≤ 280 منظَّفة، 30/دقيقة، تدقيق)؛ `GET /admin/feedback` (نسب «مفيد»، العامل الأكثر إقناعًا، الرأي مقابل نتيجة السوق، ملاحظات بلا نسبة)؛ «ملاحظة ميدانية» في بطاقة المنطقة ولوحة «آراء المستخدمين» في الإدارة؛ اختبارات العقد على التطبيقين + اختبار API (70) واختبار تطابق قائمة العوامل (18) | 🟩 | ☐ |
| 2026-10-20 | packages/analysis-engine · apps/api · packages/db (AI-01) | متتبع نتائج المناطق: `resolveOutcome` + `OUTCOME_VERSION` في المحرك (REACTED/INVALIDATED/TESTED/UNTOUCHED، MFE/MAE من أول لمسة) ومختبر الاختبار التاريخي يستخدمه الآن؛ `OutcomeService` (مراقبة نتائج التحليل بمفتاح ثابت وأول ملاحظة تفوز، وسم من الشموع المغلقة بعد شمعة الاكتشاف فقط عند الإبطال أو نهاية الأفق، نافذة خاصة للمناطق القديمة، `OUTCOME_SCAN`)؛ مستودع `zones` على التطبيقين؛ ترحيل `20261020120000_zone_outcomes`؛ `GET /admin/outcomes`، `POST /admin/outcomes/run`، `GET /admin/research/dataset` (demo مستثنى)؛ لوحة «نتائج المناطق» في الإدارة؛ 6 اختبارات للمتتبع + عقد المستودع + اختبار API (67) واختبارا محرك (17) | 🟩 | ☐ |
| 2026-10-20 | packages/analysis-engine (إصلاحان) | `evaluateLifecycle` كان يقرأ آخر شمعة من قائمة فارغة لمنطقة مؤكدة (لم يظهر سابقًا لأن التحليل يمرر شموعًا دائمًا)؛ والسوق الاصطناعي الحي كان متجمدًا عند لحظة أول طلب بلا مشترك WebSocket، فلا شموع بعد الاكتشاف — الآن يتقدم دقيقة بدقيقة ببذرة (الرمز، الدقيقة) فتتطابق العمليات المستقلة. مخرجات التحليل لم تتغير | 🟩 | ☐ |
| 2026-10-20 | apps/api · packages/db (DB-01/DB-02) | مستودعات PostgreSQL عبر Prisma بنفس واجهة الذاكرية ودلالاتها (التحويلات، «undefined يمسح»، تقييد المالك)؛ `REPOSITORIES=auto` مع تحميل ديناميكي وفحص الترحيل وزرع Instrument Master عند الإقلاع؛ نموذج `ZoneLog` إلحاقي جديد (معرفات مناطق المحرك محلية للنافذة) وإزالة المفتاح الأجنبي `Alert.zoneId→Zone`؛ أول ترحيل `20261020000000_init`؛ حزمة `@tradingworld/db` تبني العميل وتصدّره؛ هدف محرك musl وتشغيل `migrate:deploy` في صورة Docker؛ اختبار عقد يشغّل نفس التأكيدات على التطبيقين + الاستمرار عبر عميل جديد + خطأ واضح لقاعدة غير مُرحَّلة + إعادة تشغيل الـAPI كاملة (15 اختبارًا، 58 في الـAPI) | 🟩 | ☐ |
| 2026-10-20 | packages/db · apps/api (إصلاح) | جداول السوق نُقلت إلى مخطط Postgres مستقل `market` (`market.candles`، `market.backfills`): وجودها في `public` كان يجعل `prisma migrate deploy` يفشل بـP3005، وفي Docker Compose يُنفَّذ ملف Timescale أولًا فكانت الترحيلات ستفشل دائمًا | 🟩 | ☐ |
| 2026-10-19 | apps/api · packages/db (DATA-02) | مخزن الشموع: واجهة `CandleStore` بتطبيقين ذاكري و`TimescaleCandleStore` (pg، upsert بـunnest بدفعات 5000، فهرس (symbol, timeframe, time DESC))؛ `CachedProvider` أعيد بناؤه على المخزن: جلب ما حدث منذ آخر شمعة مخزنة بدل ذيل ثابت، وكتابة تحديثات البث؛ `BackfillService`: تعبئة بصفحات إلى الخلف، لحاق بعد التوقف، `findGaps` واعٍ بتقويم السوق، اشتقاق كل الفريمات الأعلى بدلاء المحرك مع قاعدة «الأصلي يغلب المشتق»، دورة كل 15 دقيقة واشتقاق الدلو الحالي كل 60 ثانية؛ `GET/POST /admin/backfill`؛ CLI `backfill`؛ SQL `0001_timescale.sql` أُعيدت كتابته (`market_candles` hypertable + `market_backfills`) ونموذج `Candle` أُزيل من Prisma؛ 16 اختبارًا جديدًا تعمل على Postgres حقيقي عند `TEST_DATABASE_URL` (خدمة postgres في CI)؛ docs/03/05/06/01 و.env.example | 🟩 | ☐ |
| 2026-10-19 | apps/web (DATA-02) | لوحة الإدارة: قسم مخزن الشموع (النوع، حالة الوظيفة، تغطية كل سلسلة، آخر الدورات، زر تشغيل دورة صيانة) | 🟩 | ☐ |
| 2026-10-19 | apps/api · packages/shared (DATA-01) | طبقة البيانات المرخصة: توجيه حسب فئة الأصل `MARKET_DATA_ROUTES` مع احتياط demo مُعلَن؛ Twelve Data (REST + ميزانية credits + فريمات مشتقة + WebSocket/polling) وPolygon (REST aggregates + ميزانية + WS للعناقيد) مُنفَّذان؛ `support/`: RateBudget، CachedProvider (مخزن شموع في الذاكرة)، TickAggregator، ReconnectingSocket؛ حالة التدفق لكل أداة `LIVE/DELAYED/STALE/CLOSED/OFFLINE` من صحة المزود × تقويم السوق (`marketHours.ts`)؛ `/feeds` و`feed` في `/candles` و`/overview` و`/health.routes+warnings` ورسالة `status` في WS؛ أداة `feed:check`؛ 21 اختبارًا جديدًا بلا شبكة (27 في الـAPI)؛ docs/03 أُعيدت كتابتها + ADR-0006 + .env.example | 🟩 | ☐ |
| 2026-10-19 | apps/web (DATA-01) | علامة المصدر `FeedMark` في كتلة العنوان (المصدر · الحالة · النقل/التأخير)، الورقة اليومية، ورقة الأسواق (مصدر كل فئة وشارة DELAYED/STALE/CLOSED/OFFLINE)، ولوحة الإدارة (المزودون، الميزانية، الخطة، الترخيص، التحذيرات، جدول الأدوات) | 🟩 | ☐ |
| 2026-10-19 | packages/analysis-engine 1.1.1 · apps/web (المختبر) | إصلاح خلل في مختبر الاختبار التاريخي: كانت نسبة REACTED صفرًا دائمًا لأن دورة الحياة تُرجع الحالة النهائية فقط (منطقة تفاعلت ثم كُسرت لاحقًا تُحسب INVALIDATED). الآن `evaluateLifecycle` يرجع أيضًا `reacted/reactedIndex/firstTestIndex`؛ المختبر يحسب REACTED عند أول تفاعل، وINVALIDATED كنسبة كسر مستقلة، وMFE/MAE من أول لمسة وللمناطق الملموسة فقط؛ عمود Touched وسطر توضيح؛ اختبار جديد (15). مخرجات التحليل الحية لم تتغير | 🟩 | ☐ |
| 2026-10-19 | apps/web (السجل) · docs/06 | توثيق أن `openedAt/closedAt` بثواني Unix؛ عرض التاريخ في السجل يتحمّل القيم بالميلي ثانية من عملاء أقدم | 🟩 | ☐ |
| 2026-10-19 | docs | إصلاح: README الجذري كان مكتوبًا بالخطأ في `packages/analysis-engine/README.md` (روابطه النسبية معطّلة)؛ نُقل إلى الجذر مع قسم التصميم وصف docs/12 وشارة المحرك 1.1.0 وعدد الاختبارات؛ README خاص بحزمة المحرك | 🟩 | ☐ |
| 2026-10-19 | apps/web (المرحلة D) | ورقة الأسواق كصفوف تضاريس مجمّعة بالفئة؛ السجل والتنبيهات والإدارة والمختبر على ورقة خريطة (كتل عنوان، تهشير، نماذج معنونة، خط أبعاد حي في نموذج السجل)؛ الإعدادات: ألوان الاتجاه خريطة/كلاسيكي وإظهار المبطلة | 🟩 | ☐ |
| 2026-10-19 | apps/web (الوصولية) | رفع تباين `ink-3` والختم إلى ≥ 4.5:1؛ `--up-ink/--down-ink` للنص بلون الاتجاه؛ رابط تخطي، `aria-pressed`/`aria-label`، تسميات لكل الحقول، أهداف لمس ≥ 32px، `role="status"` للتنبيهات، احترام تقليل الحركة | 🟩 | ☐ |
| 2026-10-19 | apps/web (المرحلة C) | التعليق المساحي بخط دليل ودبوس إلى المنطقة المحددة؛ كومة الأدلة التفاعلية (ماذا لو) في التعليق؛ بوصلة الانحياز في الهامش؛ قرص الجلسات (شريط الشارت، الورقة اليومية، ورقة الساعة)؛ ختم المناطق المبطلة على الشارت والفهرس والتعليق مع مفتاح إظهار؛ بُعد المسافة إلى المنطقة بالسعر و×ATR؛ الصفقات المفتوحة كخطوط أبعاد على الشارت؛ خط الأبعاد في حاسبتي المخاطرة والحجم | 🟩 | ☐ |
| 2026-10-19 | packages/analysis-engine 1.1.0 | خيار `keepInvalidatedBars` يُبقي المناطق المبطلة حديثًا (حتى 4) بحالة INVALIDATED مع `invalidatedIndex`؛ المخرجات الافتراضية لم تتغير؛ اختبار جديد (14) | 🟩 | ☐ |
| 2026-10-19 | packages/shared · apps/api | إصلاح خلل: `z.coerce.boolean()` كان يحوّل `"false"` إلى true في استعلامات `/analysis`؛ الآن `queryBool` صريح مع اختبار (6)؛ العلمان `includeLowQuality/includeInvalidated` عبر REST وWebSocket | 🟩 | ☐ |
| 2026-10-19 | design · docs | اعتماد لغة التصميم «خريطة»: docs/12 + ADR-0005 + صفحة المفهوم في docs/design؛ docs/11 أصبح أرشيفًا | ✅ | ☑ 2026-10-19 |
| 2026-10-19 | apps/web (المرحلة A) | رموز خريطة في globals.css + tailwind (ليلي/نهاري/النظام)، IBM Plex Sans Arabic + Plex Mono مستضافان ذاتيًا، سكربت الثيم قبل أول رسم، إعادة تسمية كل أصناف الألوان، إزالة الرموز التعبيرية من الواجهة | 🟩 | ☐ |
| 2026-10-19 | apps/web (المرحلة B) | السكة بثمانية أطالس مع فهرس الأوراق، شريط الورقة (الموقع، ⌘K، ساعة UTC والجلسة، ليل/نهار، اللغة)، شريط الهاتف، كتلة العنوان تحت الشارت، الورقة اليومية بدل الـDashboard، فهرس الأوراق بترقيم المواصفة، مناطق مهشّرة بكنتور وتسميات مونو على الشارت، أيقونات خطية | 🟩 | ☐ |
| 2026-10-19 | packages/shared · apps/api | `ATLASES` و`atlasOf/modulesOfAtlas/atlasForRoute` في سجل الوحدات؛ `/overview` يرجع narrative وlastSweep وspark وchangePct وsession لكل أصل | 🟩 | ☐ |
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
| 1.1.0 | scoring-v1 | 2026-10-19 | خيار `keepInvalidatedBars` (المخرجات الافتراضية بلا تغيير)؛ `Zone.invalidatedIndex` | ☐ |
| 1.0.0 | scoring-v1 | 2026-10-19 | الإصدار الأول: 10 عوامل (18/16/15/13/10/8/7/5/5/3) | ☐ |

---

## 7. كيف تُحدِّث هذا الملف
1. عند بدء العمل على وحدة: غيّر حالتها إلى 🟨 وأضف سطرًا في §5.
2. عند الانتهاء والاختبار: 🟩 + سطر في §5.
3. عند اعتماد صاحب المشروع: ✅ في الجدول + ☑ وتاريخ في عمود «معتمد».
4. أي تغيير في أوزان/منطق المحرك: سطر في §6 + bump للإصدار في `packages/analysis-engine/src/version.ts`.
