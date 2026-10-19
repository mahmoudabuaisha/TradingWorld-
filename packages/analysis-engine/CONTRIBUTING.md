# المساهمة في TradingWorld

## القواعد الذهبية
1. **الاكتشاف حتمي دائمًا.** أي عامل تحليلي جديد يُضاف كـ`detector` في `packages/analysis-engine/src/detectors` مع اختبار وحدة، ولا يُستخدم LLM في الاكتشاف.
2. **كل تغيير في الأوزان = نسخة جديدة.** عدّل `SCORING_VERSION` في `packages/analysis-engine/src/version.ts` وسجّل التغيير في `PROGRESS.md`.
3. **لا بيانات مستقبلية.** أي كود يعمل على سلسلة تاريخية يجب أن يرى الشموع السابقة فقط (انظر `BacktestLab`).
4. **كل وحدة جديدة تُسجَّل** في `packages/shared/src/modules.ts` ثم في `PROGRESS.md`.
5. **لا مفاتيح في الكود.** كل الأسرار عبر `.env` (انظر `.env.example`).

## سير العمل
```bash
pnpm install && pnpm build:packages
pnpm typecheck && pnpm test
```
- الفروع: `feature/<module-id>-<short-desc>` · الالتزامات بصيغة Conventional Commits (`feat(engine): ...`).
- كل PR يجب أن يحدّث `PROGRESS.md` (الحالة + سطر في سجل التعديلات).
- الاعتماد: صاحب المشروع يضع ✅ في عمود "معتمد" داخل `PROGRESS.md` بعد المراجعة.
