# 09 — Security Plan

## الحالة الحالية (مُنفَّذ)
- **Authentication**: JWT (HS256، صلاحية 7 أيام افتراضيًا)، كلمات مرور scrypt (N=16384 افتراضي node) مع salt عشوائي و`timingSafeEqual`.
- **Authorization**: RBAC بست أدوار (`roleAtLeast`)، `requireRole("admin")` لمسارات الإدارة.
- **Input validation**: zod لكل body/query (مشترك مع الويب).
- **Rate limiting**: عام 300/دقيقة؛ register 10/د؛ login 20/د؛ ai/chat 30/د.
- **Headers**: helmet؛ CORS مقيد بـ`CORS_ORIGIN`.
- **Secrets**: `.env` فقط؛ `.env.example` بلا قيم؛ فشل التشغيل في production بسر JWT افتراضي.
- **Audit log**: register/login/alert.create/role.change (قابل للتوسع).
- **Errors**: لا تسريب stack traces في production.
- **Realtime**: اشتراك واحد لكل socket، تنظيف عند الإغلاق، تحقق من الرمز/الفريم.

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
