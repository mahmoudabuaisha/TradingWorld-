# 08 — Estimated Development Time & Infrastructure Cost

## الوقت (فريق: 2 Full-stack TS + 1 Quant/ML جزئي + مصمم جزئي + كاتب محتوى في P2)
| المرحلة | المدة | أبرز المخرجات |
|---|---|---|
| P0 | ✅ | الأساس كاملًا |
| P1 MVP | 8–10 أسابيع | بيانات مرخصة، Prisma، أدوات الرسم، إشعارات، مراقبة، نسخ احتياطي |
| P2 | 10–12 أسبوعًا | Strategies/Setups/Journal المتقدم/Academy/Calendar/Scanner |
| P3 | 8–10 أسابيع | Community/Rooms/Teams/Replay/Subscriptions |
| P4 | مستمر | ML v2، Order flow، Mobile |

العوامل المؤثرة: سرعة اعتماد المزود، حجم محتوى الأكاديمية، متطلبات الـModeration.

## التكلفة الشهرية (USD)
| البند | MVP (≤1k) | نمو (≤20k) | ملاحظات |
|---|---|---|---|
| Compute (api/web/ws) | 40–120 | 300–800 | Fly.io/Render/Hetzner → K8s عند النمو |
| Postgres+Timescale | 25–60 | 150–400 | Timescale Cloud / Neon+ext / self-managed |
| Redis | 10–30 | 50–150 | |
| Data feed | 30–250 | 250–1,500 | Twelve Data/Polygon؛ Order flow أعلى بكثير |
| LLM | 20–150 | 300–1,500 | Opus 5.5: $4/M in، $20/M out؛ caching يقلل المدخلات ~90% |
| Storage/CDN/Backups | 10–30 | 50–150 | صور Snapshots |
| Monitoring/Logs | 0–30 | 50–200 | |
| Email/Push | 0–20 | 30–100 | |
| **الإجمالي** | **≈135–690** | **≈1,180–4,800** | |

تقدير تكلفة LLM: 20k سؤال/شهر × (6k input مُخزَّن مؤقتًا + 400 output) ≈ $0.6 + $160 ⇒ ~$170؛ بالمُفسِّر الحتمي للأسئلة الشائعة تنخفض أكثر.
