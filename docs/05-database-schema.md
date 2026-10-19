# 05 — Database Schema

المخطط الرسمي: [`packages/db/prisma/schema.prisma`](../packages/db/prisma/schema.prisma). Postgres 16 + TimescaleDB (`prisma/sql/0001_timescale.sql`).

## الكيانات
| الجدول | الغرض | ملاحظات |
|---|---|---|
| `User` | الحسابات، الدور، الإعدادات JSON، سر 2FA | أدوار: user/student/coach/moderator/admin/developer |
| `Session` | جلسات/أجهزة قابلة للإلغاء | tokenHash فريد |
| `Instrument` | Instrument Master | رموز المزودين JSON، دقة السعر، pip، حجم العقد |
| `Candle` | **hypertable** (symbol, timeframe, time) | ضغط بعد 30 يومًا؛ `provider` لكل صف |
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
- الشموع تُكتب مرة واحدة (append-only)؛ التصحيحات عبر صف جديد بـ`provider` مختلف إن لزم.
- النسخ الاحتياطي: pg_dump يومي + WAL archiving؛ اختبار استرجاع شهري (OPS-02).

## تشغيل
```bash
docker compose up -d db
export DATABASE_URL=postgresql://tradingworld:tradingworld@localhost:5432/tradingworld?schema=public
pnpm --filter @tradingworld/db generate && pnpm --filter @tradingworld/db migrate:dev
psql $DATABASE_URL -f packages/db/prisma/sql/0001_timescale.sql
```
