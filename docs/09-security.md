# 09 — Security Plan

## الحالة الحالية (مُنفَّذ)
- **Authentication**: JWT (HS256، صلاحية 7 أيام افتراضيًا)، كلمات مرور scrypt (N=16384 افتراضي node) مع salt عشوائي و`timingSafeEqual`.
- **Authorization**: RBAC بست أدوار (`roleAtLeast`)، `requireRole("admin")` لمسارات الإدارة.
- **Input validation**: zod لكل body/query (مشترك مع الويب).
- **Rate limiting**: عام 300/دقيقة؛ register 10/د؛ login 20/د؛ ai/chat 30/د.
- **Headers**: helmet؛ CORS مقيد بـ`CORS_ORIGIN`.
- **Secrets**: `.env` فقط؛ `.env.example` بلا قيم؛ فشل التشغيل في production بسر JWT افتراضي.
- **النشر (DEPLOY-01)**: Caddy وحده على 80/443 بـHTTPS وHSTS، والقاعدة والـAPI بلا منافذ على الخادم؛ ufw يسمح بـ22/80/443 فقط وfail2ban على SSH؛ الأسرار تُولَّد على الخادم ولا تمر عبر Git؛ في الإنتاج لا يصبح أول مسجّل مشرفًا (المشرف من `ADMIN_EMAIL`). انظر docs/15.
- **المراقبة**: `/metrics` معطّل في الإنتاج دون `METRICS_TOKEN` ومقارنة الرمز بزمن ثابت؛ السجلات تخفي الترويسات والحقول الحساسة؛ معرّف الطلب الوارد يُقبل فقط بصيغة محدودة (لا حقن أسطر في السجلات)؛ منافذ Prometheus وGrafana وJaeger مربوطة بـ127.0.0.1.
- **النسخ الاحتياطي**: مشفرة بمفاتيح age العامة (المفتاح الخاص خارج الخادم ما لم يجرِ الاختبار عليه)، نسخة خارجية بمفتاح وصول بلا صلاحية حذف، والأداة لا تحذف من التخزين الخارجي؛ كلمات مرور القاعدة تُمرر لأدوات PostgreSQL بمتغيرات البيئة لا بالأوامر. انظر docs/13.
- **Audit log**: register/login/alert.create/role.change (قابل للتوسع).
- **Errors**: لا تسريب stack traces في production.
- **Realtime**: اشتراك واحد لكل socket، تنظيف عند الإغلاق، تحقق من الرمز/الفريم. الهوية بـJWT في رسالة `subscribe`/`auth`؛ أحداث التنبيهات والإشعارات تُرسل لمقابس المالك فقط (كانت قبل NOTIF-01 تُبث لكل مشتركي الرمز، فيرى غيرك نص تنبيهك).
- **الإشعارات**: مفتاح VAPID الخاص وSMTP_URL أسرار خادم فقط؛ اشتراكات Push مقيدة بالمالك عند الحذف؛ endpoint يجب أن يكون https؛ البريد اختياري ومعطّل افتراضيًا؛ نص الإشعار حقائق فقط (لا BUY/SELL) مع تنبيه «ليست نصيحة مالية» في البريد.

## المخطط (P1–P2)
| البند | التفاصيل |
|---|---|
| 2FA (TOTP) | `User.twoFactorSecret` + رموز احتياطية |
| Sessions/الأجهزة | جدول `Session` بـtokenHash، إلغاء، حد أقصى للأجهزة |
| Refresh tokens | access قصير (15m) + refresh دوّار |
| Secrets manager | Doppler/Vault/Cloud KMS؛ تدوير JWT |
| التشفير at-rest | أعمدة حساسة (2FA secret، مفاتيح مزودين) بـAES-GCM |
| CSP | Content-Security-Policy صارم للويب |
| Brute-force | قفل مؤقت بعد N محاولات + CAPTCHA اختياري |
| Backups | يومية مشفرة + اختبار استرجاع شهري |
| Monitoring | OpenTelemetry + تنبيهات على 5xx/latency/feed staleness |
| Dependency scanning | `pnpm audit` في CI + Dependabot |
| Privacy | حذف الحساب وتصدير البيانات (GDPR-style) |
| Admin | كل عملية إدارية في AuditLog مع IP |
| Proprietary content | RBAC على مستوى المحتوى (Private Intel/Algorithms) + عدم إرسال الكود للعميل |
