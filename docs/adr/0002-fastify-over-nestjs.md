# ADR-0002 — Fastify بدل NestJS

**الحالة:** مقبول · **التاريخ:** 2026-10-19

## السياق
نحتاج API عالي الأداء مع WebSocket وJWT وRate limiting وقابلية اختبار سريعة (inject).

## القرار
Fastify 5 مع بنية نطاقات (routes/services/providers/repositories) وحاوية `AppContext` بسيطة بدل DI الثقيل.

## البدائل
NestJS (أكثر boilerplate، لكن مألوف للفرق الكبيرة — يمكن الانتقال لاحقًا لأن المنطق في services/engine مستقل عن الإطار).

## العواقب
+ أداء وبساطة؛ اختبارات بلا شبكة عبر `app.inject`.
− لا decorators/DI جاهزة؛ ننضبط بالهيكل يدويًا.
