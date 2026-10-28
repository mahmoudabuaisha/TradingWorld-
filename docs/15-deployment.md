# 15 — النشر على الخادم (DEPLOY-01)

> خادم واحد (Contabo VPS، Ubuntu 24.04، 4 أنوية و8 GB) يشغّل المنصة كاملة خلف نطاق واحد بـHTTPS. كل تحديث يمر بطلب دمج (Pull Request) على GitHub؛ بعد الدمج في `main` يسحب الخادم النسخة الجديدة ويشغّلها خلال دقيقتين، ويعود للنسخة السابقة وحده إن فشلت.

## 1. الشكل العام

```
الزائر ──HTTPS──► Caddy (المنفذان 80 و443 فقط، شهادة Let's Encrypt تلقائية)
                    ├─ /api/* و /ws ──► api   (Fastify، المنفذ 4000 داخل شبكة Docker)
                    ├─ /grafana ──────► grafana (لوحات المراقبة بتسجيل دخول، OPS-01b)
                    └─ كل ما عدا ذلك ──► web   (Next.js، المنفذ 3000 داخل شبكة Docker)
                                         db     (TimescaleDB 2.30.2 / PostgreSQL 16، داخلي فقط)
                                         backup (نسخة يومية مشفرة + اختبار استرجاع أسبوعي، OPS-02)
                                         prometheus · jaeger · node-exporter (المراقبة، داخلية فقط)
```

- **أصل واحد**: المتصفح يطلب `/api` و`/ws` من نطاق الصفحة نفسه. صورة الويب لا تحمل أي عنوان مثبت، فتصلح لأي نطاق دون إعادة بناء.
- **لا شيء مكشوف** إلا Caddy: قاعدة البيانات والـAPI بلا منافذ على الخادم، والجدار الناري يسمح بـSSH و80 و443 فقط.
- **الملفات**: `deploy/docker-compose.prod.yml`، `deploy/caddy/Caddyfile`، `deploy/setup.sh`، `deploy/deploy.sh`، `deploy/tw`، `deploy/smoke-test.sh`، وإعدادات المراقبة في `infra/monitoring/`.

## 2. قبل الإعداد: سجل DNS

في Cloudflare، النطاق `mediatechnologies.uk` ثم DNS ثم Add record:

| Type | Name | IPv4 address | Proxy status |
|---|---|---|---|
| A | `trading` | `207.180.249.220` | **DNS only** (السحابة رمادية) |

البروكسي البرتقالي يمنع إصدار الشهادة في البداية. يمكن تفعيله لاحقًا مع وضع SSL/TLS على **Full (strict)**.

## 3. الإعداد الأول (مرة واحدة)

على الخادم كـroot:
```bash
apt-get update && apt-get install -y git
git clone -b main https://github.com/mahmoudabuaisha/TradingWorld-.git /opt/tradingworld
bash /opt/tradingworld/deploy/setup.sh trading.mediatechnologies.uk
```

ما يفعله `setup.sh` (يمكن تشغيله مرة ثانية بأمان؛ لا يغيّر الأسرار الموجودة):
1. يثبت Docker وCompose وfail2ban (حماية SSH من التخمين) وage.
2. يحدد حجم سجلات الحاويات (10 MB × 3) حتى لا تملأ القرص.
3. يضيف 4 GB swap: بناء الواجهة يحتاج 2 إلى 3 GB للحظات.
4. الجدار الناري: SSH و80 و443 فقط.
5. **يولّد كل الأسرار على الخادم نفسه** في `deploy/.env` (صلاحية 600): كلمة سر القاعدة، مفتاح JWT، رمز المقاييس، مفاتيح Web Push، مفتاح تشفير النسخ، وكلمة سر المشرف. لا يمر أي سر عبر GitHub.
6. يتحقق من أن النطاق يشير إلى هذا الخادم.
7. يبني الصور ويشغّل كل شيء (5 إلى 10 دقائق أول مرة).
8. يفعّل مؤقّت التحديث التلقائي.
9. **يطبع بريد المشرف وكلمة سره مرة واحدة**: احفظهما.

## 4. التحديثات

```
تعديل في الجلسة ← صور PNG للمراجعة ← «اعتمد» ← Pull Request ← CI أخضر ← Merge
      ← الخادم يلاحظ الـcommit الجديد خلال دقيقتين ← يبني ← يشغّل ← يتحقق ← يعمل
```

- **التحقق**: يبني الصور بوسم الـcommit، يشغّلها، ثم ينتظر حتى يرد الـAPI بالـcommit الجديد في `/api/v1/health` وتجيب الواجهة.
- **الإعدادات المركّبة**: إن تغيّر `deploy/caddy/` يعيد تحميل Caddy (ملف مرفوض يُفشل النشر ويعيد السابق)، وإن تغيّر `infra/monitoring/` يعيد تشغيل Prometheus وGrafana.
- **إن فشل**: يعيد النسخة السابقة بصورها، ويسجّل الـcommit الفاشل فلا يعيد المحاولة حتى يأتي commit أحدث.
- **أي نسخة تعمل الآن؟** `https://trading.mediatechnologies.uk/api/v1/health` ثم الحقل `commit`.
- **السجل**: `journalctl -u tradingworld-deploy -f`
- **ملاحظة**: الترحيلات (migrations) تُطبَّق عند إقلاع الـAPI ولا تُعكَس عند العودة لنسخة سابقة. ترحيلاتنا إضافية دائمًا (أعمدة وجداول جديدة)، فالنسخة السابقة تعمل معها.

## 5. أوامر التشغيل اليومية

من `/opt/tradingworld`:

| الغرض | الأمر |
|---|---|
| حالة الحاويات | `deploy/tw ps` |
| السجلات | `deploy/tw logs -f api` (أو `web`، `caddy`، `db`، `backup`) |
| فحص الموقع من الخارج | `deploy/smoke-test.sh trading.mediatechnologies.uk` |
| لوحات المراقبة | `https://trading.mediatechnologies.uk/grafana/` (بريد المشرف وكلمة سره) |
| كلمة سر جديدة لـGrafana | `deploy/tw exec grafana grafana cli admin reset-admin-password 'NEW'` |
| نسيت كلمة سر المشرف | `deploy/tw exec api node apps/api/dist/tools/admin.js reset-password admin@mediatechnologies.uk` |
| ترقية حساب إلى مشرف | `deploy/tw exec api node apps/api/dist/tools/admin.js promote EMAIL` |
| حالة النسخ الاحتياطي | `deploy/tw exec backup node apps/api/dist/tools/backup.js status` |
| بعد تعديل `deploy/.env` | `deploy/deploy.sh --force` |
| إيقاف التحديث التلقائي مؤقتًا | `systemctl stop tradingworld-deploy.timer` |

## 6. الأمان

| البند | الحالة |
|---|---|
| HTTPS | Let's Encrypt عبر Caddy مع تجديد تلقائي، وHSTS، وتحويل HTTP إلى HTTPS |
| المنافذ | 22 و80 و443 فقط؛ القاعدة والـAPI داخل شبكة Docker |
| المشرف | من `ADMIN_EMAIL` في الإعداد. في الإنتاج لا يصبح أول مسجّل مشرفًا |
| الأسرار | تُولَّد على الخادم وتبقى في `deploy/.env` و`deploy/secrets/` (خارج Git) |
| SSH | fail2ban يحظر التخمين. يُنصح بالدخول بمفتاح SSH وتعطيل كلمة السر |
| عنوان العميل | Caddy يضع `X-Forwarded-For` بنفسه، فلا يمكن تزويره لتجاوز حدود الطلبات |
| `/metrics` | غير متاح من الخارج (404 عبر Caddy) |
| المراقبة | Grafana بتسجيل دخول وحظر للتخمين، بلا تسجيل ذاتي أو دخول مجهول، ولا يبدأ بكلمة سر افتراضية. Prometheus وJaeger ومُصدِّر الخادم بلا أي مسار من الخارج |

## 7. ما يبقى بعد الإطلاق

| البند | لماذا |
|---|---|
| ~~تفعيل المراقبة~~ | ✓ OPS-01b: Grafana على `/grafana`، وPrometheus وJaeger ومقاييس الخادم (docs/14 §6) |
| ~~فحص خارجي لتوقف الخادم~~ | ✓ OPS-01b: GitHub Actions كل 10 دقائق يرسل بريدًا عند الفشل (docs/14 §5) |
| نسخة خارجية للنسخ الاحتياطي | النسخ الآن على الخادم نفسه ومشفرة. ضياع الخادم يعني ضياعها؛ Cloudflare R2 يكفي (docs/13 §6) |
| مزود بيانات مرخص | الأسعار الآن تجريبية، ولوحة الإدارة تنبّه لذلك (docs/03) |
| البريد (SMTP) | لإرسال التنبيهات بالبريد |
| مفتاح SSH بدل كلمة السر | أمان الدخول للخادم |

## 8. ما تم التحقق منه

| السيناريو | أين |
|---|---|
| الحزمة كاملة كما على الخادم: نشر `main` ثم الترقية بـ`deploy.sh` الموجود فيه، ثم فحص عبر Caddy (HTTPS، API من الأصل نفسه، WebSocket، Grafana، منافذ مغلقة)، المراقبة كاملة، دخول المشرف، أول مسجّل ليس مشرفًا، أدوات النسخ واختبار استرجاع حقيقي داخل الحزمة | وظيفة CI `deploy-stack` مع كل push |
| منطق `deploy.sh`: أول نشر، لا شيء جديد، فشل الفحص مع العودة للنسخة السابقة، تجاهل الـcommit الفاشل، commit أحدث ينجح وتُحذف الصور القديمة | محليًا بـ`docker` مزيف |
| صورة الويب بلا `localhost:4000` (كانت في 10 ملفات)، Caddy يوجّه `/api` و`/ws` والواجهة، الدخول من النموذج الحقيقي، الشارت يعمل مباشرة | محليًا عبر `https://localhost` |
| مفاتيح Web Push المولّدة بـopenssl صالحة | محليًا بمكتبة web-push |
