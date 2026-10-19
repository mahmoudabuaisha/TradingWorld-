# 02 — Technology Stack

| الطبقة | الاختيار | الإصدار | البدائل المدروسة | سبب الاختيار |
|---|---|---|---|---|
| Language | TypeScript | 5.x | — | نوع واحد من الطرف للطرف؛ المحرك يعمل في الخادم والمتصفح |
| Frontend | Next.js + React | 15 / 19 | Vite+React, SvelteKit | نضج، App Router، SSR للصفحات العامة (الأكاديمية/الخطط)، SEO لاحقًا |
| UI | Tailwind CSS | 3.4 | CSS Modules, MUI | سرعة + تناسق + RTL عبر logical props؛ لا مكتبة ثقيلة |
| Chart | lightweight-charts | 4.2 | TradingView Charting Library (ترخيص)، محرك خاص (مكلف) | Apache-2.0، Canvas سريع، ونبني الأدوات الخاصة فوقه (Overlay) — الخيار B في مواصفة الشارت. **ملاحظة:** الإصدار 5 غيّر الـAPI؛ الترقية مهمة مستقلة |
| State | Zustand | 5 | Redux, Jotai | أبسط ما يفي بالغرض + persist |
| Backend | Fastify | 5 | NestJS, Express, Hono | أداء، plugins رسمية (jwt, rate-limit, websocket, helmet). ADR-0002 |
| Validation | zod | 3 | yup, valibot | schema مشتركة ويب/API |
| Auth | @fastify/jwt + scrypt (node:crypto) | — | Passport, Lucia | بلا تبعيات إضافية؛ scrypt مقاوم للـGPU |
| DB | PostgreSQL + TimescaleDB | 16 / 2.x | ClickHouse, QuestDB, Mongo | شموع كـhypertable مضغوطة + علاقات قوية لكل الكيانات في قاعدة واحدة |
| ORM | Prisma | 6 | Drizzle, Kysely | schema موثقة، migrations، Studio |
| Cache | Redis | 7 | Valkey, Dragonfly | pub/sub + cache + rate-limit موزع |
| Realtime | WebSocket (ws) | — | SSE, Socket.IO | ثنائي الاتجاه وخفيف؛ SSE بديل للمتصفحات المقيدة |
| ML | Python + FastAPI + scikit-learn | 3.12 | TS-only ML | معيار البحث الكمي؛ معزول عن الإنتاج |
| LLM | Anthropic SDK (`@anthropic-ai/sdk`) | 0.5x | OpenAI | جودة التفسير + prompt caching؛ قابل للاستبدال خلف `AiService` |
| Tests | vitest / pytest | 2 / 8 | jest | سرعة وESM |
| Infra | Docker Compose → K8s/Fly/Render | — | — | انظر 08 |
| CI | GitHub Actions | — | — | |

## الأداء (أهداف من مواصفة الشارت)
- تحميل الشارت الأولي ≤ 2s: 600 شمعة + تحليل ≈ 30–80ms في المحرك.
- تحديث الشارت بعد الاستلام ≤ 100ms: `series.update` + إعادة رسم overlay فقط.
- تحليل كامل MTF للذهب 5m (600 + HTF): ≈ 20–60ms (Node 22).
- 60 FPS: Canvas rendering، لا React re-render على كل tick (refs).
