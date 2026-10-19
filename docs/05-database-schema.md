# 05 — Database Schema

المخطط الرسمي: [`packages/db/prisma/schema.prisma`](../packages/db/prisma/schema.prisma). Postgres 16 + TimescaleDB (`prisma/sql/0001_timescale.sql`).

## الكيانات
| الجدول | الغرض | ملاحظات |
|---|---|---|
| `User` | الحسابات، الدور، الإعدادات JSON، سر 2FA | أدوار: user/student/coach/moderator/admin/developer |
| `Session` | جلسات/أجهزة قابلة للإلغاء | tokenHash فريد |
| `Instrument` | Instrument Master | رموز المزودين JSON، دقة السعر، pip، حجم العقد |
| `market_candles` | **hypertable** (symbol, timeframe, time) — **خارج Prisma**، مملوك للـSQL ومكتوب من مخزن الشموع في الـAPI (DATA-02) | قطع 7 أيام، ضغط بعد 30 يومًا؛ `provider` لكل صف (`aggregate:1m` للمشتق) |
| `market_backfills` | سجل دورات التعبئة/اللحاق/الفجوات/الاشتقاق | خارج Prisma |
| `EngineVersion` | سجل إصدارات المحرك/التقييم + الأوزان | واحد `active` |
| `Zone` | كل منطقة أُنتجت + عواملها (JSON) + حالتها | مفهرس بالرمز/الفريم/الوقت والإصدار |
| `ZoneOutcome` | نتيجة السوق النهائية (label للـML) | MFE/MAE بالـATR، retests، session، regime |
| `ZoneFeedback` | رأي المستخدم 👍/👎 | **منفصل** عن ZoneOutcome عمدًا |
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
- جداول السوق (`market_*`) خارج Prisma: hypertables والضغط والاحتفاظ تُدار بالـSQL؛ الـAPI ينشئ الجداول العادية إن غابت فيعمل على Postgres بلا الامتداد أيضًا.
- النسخ الاحتياطي: pg_dump يومي + WAL archiving؛ اختبار استرجاع شهري (OPS-02).

## تشغيل
```bash
docker compose up -d db
export DATABASE_URL=postgresql://tradingworld:tradingworld@localhost:5432/tradingworld?schema=public
pnpm --filter @tradingworld/db generate && pnpm --filter @tradingworld/db migrate:dev
psql $DATABASE_URL -f packages/db/prisma/sql/0001_timescale.sql   # الامتداد + market_* + hypertable
BACKFILL_ENABLED=true pnpm --filter @tradingworld/api backfill all   # أول تعبئة (أو تلقائيًا مع تشغيل الـAPI)
```
