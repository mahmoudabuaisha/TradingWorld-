# 05 — Database Schema

المخطط الرسمي: [`packages/db/prisma/schema.prisma`](../packages/db/prisma/schema.prisma). Postgres 16 + TimescaleDB (`prisma/sql/0001_timescale.sql`).

## الكيانات
| الجدول | الغرض | ملاحظات |
|---|---|---|
| `User` | الحسابات، الدور، الإعدادات JSON، سر 2FA | أدوار: user/student/coach/moderator/admin/developer |
| `Session` | جلسات/أجهزة قابلة للإلغاء | tokenHash فريد |
| `Instrument` | Instrument Master | رموز المزودين JSON، دقة السعر، pip، حجم العقد |
| `market.candles` | **hypertable** (symbol, timeframe, time) — **خارج Prisma**، مملوك للـSQL ومكتوب من مخزن الشموع في الـAPI (DATA-02) | قطع 7 أيام، ضغط بعد 30 يومًا؛ `provider` لكل صف (`aggregate:1m` للمشتق) |
| `market.backfills` | سجل دورات التعبئة/اللحاق/الفجوات/الاشتقاق | خارج Prisma |
| `EngineVersion` | سجل إصدارات المحرك/التقييم + الأوزان | واحد `active` |
| `Zone` | المناطق التي يتابعها متتبع النتائج (AI-01): صف لكل مكان سوقي، لقطة عند **أول ملاحظة** | المعرف مفتاح ثابت `symbol:tf:origin:direction:createdTime:engine:scoring`؛ `provider` (لاستثناء demo)، `atr`، `context` (النظام/الجلسة/HTF)، `snapshot`، `detectedBarTime` |
| `ZoneLog` | سجل بحثي إلحاقي: صف لكل منطقة كلما ظهرت بحالة جديدة (`repos.zoneLog`)، والكائن الكامل JSON | مفهرس بالوقت والرمز/الفريم والإصدار |
| `ZoneOutcome` | نتيجة السوق النهائية (label للـML) عند الإبطال أو نهاية الأفق | `label` (REACTED/INVALIDATED/TESTED/UNTOUCHED)، `reason`، `outcomeVersion`، MFE/MAE/التفاعل بالـATR، `barsToOutcome`، `horizonBars`، retests، session، regime |
| `ZoneFeedback` | رأي المستخدم في منطقة (AI-02): مفيد/غير مفيد، العامل الأكثر إقناعًا، ملاحظة | **منفصل** عن ZoneOutcome عمدًا؛ فريد (zoneId, userId)، `updatedAt` للتعديل |
| `BacktestRun` | نتائج اختبارات تاريخية مع المعاملات والإصدار | |
| `Watchlist` | قوائم متابعة متعددة لكل مستخدم | |
| `Alert` | سعر/منطقة، triggeredAt | |
| `Trade` | سجل التداول + `zoneId` و`snapshotId` للربط | R multiple مخزن |
| `Note` | ملاحظات مع tags وربط بأي كيان | |
| `Goal` | أهداف يومية/أسبوعية/شهرية/سنوية | |
| `AuditLog` | كل عملية حساسة | actor، action، target، meta، ip |
| `FeatureFlag` | تفعيل الوحدات تدريجيًا | rollout % |

## الجداول المخططة (P2/P3)
`Strategy` · `Setup` · `Scenario` · `Snapshot` · `RoutineTask` · `Lesson/Course/Quiz/Progress` · `Term` (القاموس) · `ShariahRuling` (مع المصدر والتاريخ) · `Post/Comment/Room/Team/Membership` · `Plan/Subscription/Invoice` · `Notification`.

## قواعد
- كل كيان تحليلي يحمل `engineVersion`/`scoringVersion`.
- لا حذف فعلي للمناطق (تاريخ التدريب)؛ `status` فقط.
- الشموع upsert بالمفتاح (symbol, timeframe, time)؛ الصف الأصلي من مزود يغلب المشتق محليًا، والمشتق لا يكتب فوق أصلي أبدًا.
- جداول السوق في **مخطط Postgres مستقل `market`** خارج Prisma: hypertables والضغط والاحتفاظ تُدار بالـSQL؛ الـAPI ينشئها عادية إن غابت فيعمل على Postgres بلا الامتداد أيضًا. Prisma يملك `public` وحده لأن `migrate deploy` يرفض مخططًا غير فارغ لم يُنشئه (P3005)، فيعمل ملف Timescale والترحيلات بأي ترتيب.
- `Alert.zoneId` و`Trade.zoneId` نصوص بلا مفتاح أجنبي: معرفات مناطق المحرك محلية لنافذة التحليل.

## المستودعات (DB-02)
الـAPI يتعامل مع البيانات عبر واجهة `Repositories` واحدة بتطبيقين: ذاكري (`repositories/memory.ts`) وPostgreSQL عبر Prisma (`repositories/prisma.ts`). الاختيار بـ`REPOSITORIES=auto|memory|prisma` (`auto` = Prisma عند وجود `DATABASE_URL`)، ووحدة Prisma تُحمَّل ديناميكيًا فلا يحتاج المسار الذاكري العميل المولَّد.
- **عند الإقلاع**: التحقق من أن المخطط مُرحَّل (وإلا خطأ واضح بالأمر الذي يصلحه) ثم زرع `Instrument Master` (idempotent، يحتاجه المفتاح الأجنبي للتنبيهات).
- **دلالات مطابقة للذاكري**: الأوقات بالميلي ثانية، وفتح/إغلاق الصفقات بثواني Unix (مع تحمّل الميلي ثانية)، الحقول الغائبة `undefined`، ومفتاح موجود بقيمة `undefined` في التحديث يعني «امسح» (null)، والتحديث/الحذف مقيد بمالك السجل.
- **اختبار عقد واحد** (`__tests__/repositories.test.ts`) يشغّل نفس التأكيدات على التطبيقين، إضافة إلى: الاستمرار عبر عميل جديد، فشل واضح على قاعدة غير مُرحَّلة، وإعادة تشغيل الـAPI كاملة مع بقاء المستخدم والتنبيهات والصفقات.
- **الترحيلات**: `packages/db/prisma/migrations` (الأولى `20261020000000_init`). بعد تعديل المخطط: `pnpm --filter @tradingworld/db migrate:dev` (أو `migrate:diff` لمعاينة SQL). صورة Docker للـAPI تشغّل `migrate:deploy` قبل الإقلاع عند وجود `DATABASE_URL`.
- النسخ الاحتياطي: pg_dump يومي + WAL archiving؛ اختبار استرجاع شهري (OPS-02).

## تشغيل
```bash
docker compose up -d db
export DATABASE_URL=postgresql://tradingworld:tradingworld@localhost:5432/tradingworld?schema=public
pnpm --filter @tradingworld/db build            # prisma generate + dist (لا يحتاج قاعدة بيانات)
pnpm --filter @tradingworld/db migrate:deploy   # جداول public (المستخدمون، التنبيهات، السجل، ZoneLog، …)
psql $DATABASE_URL -f packages/db/prisma/sql/0001_timescale.sql   # الامتداد + مخطط market + hypertable (أي ترتيب)
pnpm dev:api                                    # REPOSITORIES=auto → Prisma، CANDLE_STORE=auto → Timescale
BACKFILL_ENABLED=true pnpm --filter @tradingworld/api backfill all   # أول تعبئة (أو تلقائيًا مع تشغيل الـAPI)
```
