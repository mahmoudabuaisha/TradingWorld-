# 07 — Roadmap

## P0 — Foundation ✅ (هذا الإصدار)
Monorepo · المحرك المختبَر · API · Web shell مع الشارت والمناطق والـChat · DB schema · ML skeleton · CI · التوثيق.

## P1 — MVP V1 (8–10 أسابيع)
**الهدف:** منتج قابل للاستخدام ببيانات حقيقية مرخصة.
1. DATA-01/02: اعتماد مزود + backfill + Timescale.
2. DB-01/02: Prisma repos بدل الذاكرة؛ seed للأدوات.
3. UI-01: أدوات الرسم (Trend/Horizontal/Rectangle/Fib) مرتبطة بالوقت/السعر + حفظ.
4. أنواع الشارت الأساسية + Multi-chart 2/4.
5. NOTIF-01: Push + Email للتنبيهات.
6. AI-01/02: Outcome tracker + Feedback.
7. OPS-01/02: مراقبة + نسخ احتياطي.
8. SEC-01: 2FA + جلسات.
**معايير القبول:** قائمة مواصفة الشارت §18 (15 بندًا) + 20 بند MVP في PROGRESS.md §3 كلها 🟩.

## P2 — Trader OS (10–12 أسبوعًا)
Strategies · Setups · Scenario Builder · Playbook · Journal المتقدم (صور، فلاتر، ربط) · Performance Analytics · Routine/Planner (أسبوعي/شهري) · Notes · Snapshots · Goals · Academy (المحتوى + الاختبارات + المسار الشرعي الموثق) · Economic Calendar · News · Market Scanner · Proprietary Intelligence (RBAC) · Cloud sync · Alarms.

## P3 — Community & Learning (8–10 أسابيع)
Community · Private Rooms · Teams · Psychology Tracker · AI Trade Review · Trader Memory · Learn-from-trades · Market Replay · Strategy Tester · Progress/Gamification (بلا تحفيز على المخاطرة) · Plans & Subscriptions (Stripe) · Market Map.

## P4 — Advanced Intelligence (مستمر)
scoring-v2 من ML · Order Flow/Footprint · Sentiment · OI/Funding/Liquidations · Historical Pattern Search · Options data · تطبيق الموبايل (نفس الـpackages).

## مخاطر رئيسية
| المخاطرة | التخفيف |
|---|---|
| ترخيص/تكلفة البيانات | demo + adapters جاهزة؛ قرار مبكر في P1 |
| جودة الكشف على بيانات حقيقية | Backtest Lab + ضبط المعاملات بالفريم/الأصل + سجل الإصدارات |
| Overfitting للـML | walk-forward، lift فوق base rate، اعتماد بشري، إمكانية الرجوع |
| محتوى شرعي | مصادر موثقة + مراجعة مختص + فصل التعليم عن الفتوى |
| تكلفة LLM | caching، مُفسِّر حتمي، حدود استخدام لكل خطة |
