# 03 — Data Providers (DATA-01)

## المبدأ
بيانات مرخصة للاستخدام التجاري، مع إظهار **المصدر، وقت الحدث، وقت الاستلام، وحالة التدفق** دائمًا. لا scraping مخالف. لا نفترض أن مصدرًا واحدًا يغطي كل الأسواق: التوجيه **حسب فئة الأصل**، وكل ما لم يُوجَّه أو لم يُهيَّأ مفتاحه يُخدَم من `demo` ويُبلَّغ عنه كتحذير في `/health` ولوحة الإدارة — لا يُعرض سعر اصطناعي بصمت على أنه حقيقي.

## الواجهة الموحدة
```ts
interface MarketDataProvider {
  id: "demo" | "binance" | "twelvedata" | "polygon";
  supports(instrument): boolean;
  getCandles(instrument, timeframe, limit, to?): Promise<Candle[]>;
  subscribe(instrument, timeframe, onUpdate): () => void;   // candle + closed + receivedAt + eventTime
  status(): ProviderStatus;                                 // state · transport · licensed · plan · budget · lastEventTime
  lastSeen?(symbol): { receivedAt, eventTime } | undefined; // لحالة التدفق لكل أداة
}
```
`Instrument Master` (`packages/shared/src/instruments.ts`) يربط كل رمز داخلي برمزه عند كل مزود (`providerSymbols`: `XAU/USD` عند Twelve Data، `C:XAUUSD` عند Polygon، `BTCUSDT` عند Binance).

## التوجيه (Routing)
```
MARKET_DATA_ROUTES=forex=twelvedata,metal=twelvedata,index=twelvedata,commodity=twelvedata,crypto=twelvedata
```
- الفئات: `forex metal crypto index stock commodity`. المزودون: `demo binance twelvedata polygon`.
- `ProviderRegistry.for(instrument)` يرجع المزود الموجَّه إن كان مهيأً ويحمل رمز الأداة، وإلا `demo`.
- `MARKET_DATA_PROVIDER` (المفتاح القديم) يعمل فقط عندما يكون `MARKET_DATA_ROUTES` فارغًا، ويوجّه كل الفئات إلى مزود واحد.
- أخطاء الصياغة والمفاتيح الناقصة لا توقف الـAPI؛ تظهر في `ProviderRegistry.warnings` → `/health.warnings` → لوحة الإدارة.

## طبقة الدعم المشتركة (`apps/api/src/providers/support`)
| الملف | الدور |
|---|---|
| `rateBudget.ts` | ميزانية نافذة منزلقة (credits/requests لكل دقيقة). الطلب ينتظر فتحة بدل أن يُرفض بـ429؛ الاستهلاك يُعرض في الإدارة |
| `cached.ts` | **مخزن شموع في الذاكرة** لكل (رمز، فريم): جلب كامل مرة واحدة، ثم تحديث الذيل (3 شموع) عند انقضاء `clamp(tf/4, 15s, 300s)`؛ تحديثات البث تُدمج فتصبح السلسلة المبثوثة بلا تكلفة REST. النصف الذاكري من DATA-02؛ مخزن Timescale يحل محله خلف نفس الواجهة |
| `tickAggregator.ts` | بناء شموع الفريم من تكّات السعر أو من شموع فريم أدنى؛ عند تبدّل الدلو تُبثّ الشمعة المكتملة (`closed: true`) ثم الجديدة |
| `socket.ts` | WebSocket بإعادة اتصال أسية (1s → 30s)، heartbeat اختياري، وإعادة الاشتراك/التوثيق بعد كل اتصال |
| `status.ts` | تحويل ساعة المزود (آخر استلام، آخر خطأ، النقل) إلى حالة موحدة |

## حالات التدفق (Feed states)
| الحالة | المعنى | متى |
|---|---|---|
| `LIVE` | بث مباشر ضمن الكمون المتوقع | WS وآخر رسالة خلال 60s |
| `DELAYED` | البيانات تتدفق لكن بالاستطلاع أو بتأخير الخطة | polling وآخر نجاح خلال `max(3×poll, 60s)` — يُعرض التأخير |
| `STALE` | السوق مفتوح ولم يصل شيء داخل النافذة | تجاوز النافذة أعلاه |
| `CLOSED` | **السوق مغلق** لهذه الأداة؛ آخر شمعة نهائية لا متوقفة | من تقويم السوق (`marketState`) |
| `OFFLINE` | لا مصدر مهيأ نجح (مفتاح ناقص، آخر طلب فشل) | خطأ بعد آخر نجاح أو لا طلبات بعد |

`demo` يُعرض دائمًا كـ`DEMO · SYNTHETIC` (ليس LIVE بلون النجاح) لأنه ليس أسعارًا حقيقية.

**تقويم السوق** (`packages/shared/src/marketHours.ts`): كريبتو 24/7؛ فوركس/معادن/سلع من الأحد 17:00 إلى الجمعة 17:00 بتوقيت نيويورك (DST عبر Intl)؛ مؤشرات/أسهم الجلسة النظامية 09:30–16:00 بتوقيت البورصة. العطل الرسمية غير مُنمذجة (تُضاف مع DATA-02).

## المزودون
### demo (مُنفَّذ)
سلسلة 1m اصطناعية حتمية (60k شمعة ≈ 42 يومًا) لكل رمز، تُجمَّع لأي فريم، مع محاكاة tick كل ثانية. **ليست أسعارًا حقيقية**؛ `licensed: false`.

### Binance (مُنفَّذ — كريبتو، غير مرخص للتوزيع التجاري)
REST `/api/v3/klines` + WS `@kline_<tf>` بلا مفتاح. `licensed: false` في الحالة. شروط الاستخدام تقيّد إعادة التوزيع التجاري → للتطوير فقط؛ في الإنتاج وجّه الكريبتو إلى المزود المرخص (`crypto=twelvedata`).

### Twelve Data (مُنفَّذ — REST + ميزانية + WebSocket/polling)
- التغطية: Forex، معادن (XAU/USD, XAG/USD)، مؤشرات (NDX, SPX)، WTI/USD، أسهم، كريبتو (BTC/USD, ETH/USD).
- REST `time_series` (`timezone=UTC`, `outputsize ≤ 5000`)؛ الفريمات غير الأصلية تُشتق: `3m` من `1m`، `12h` من `4h`.
- الميزانية: `TWELVEDATA_CREDITS_PER_MINUTE` (Basic 8 · Grow 55 · Pro 610 · Ultra 1500 تقريبًا — **تحقق من صفحة الأسعار قبل التوقيع**).
- البث: `wss://ws.twelvedata.com/v1/quotes/price` (`TWELVEDATA_WS=true` على الخطط التي تشمله): اشتراك واحد لكل رمز مع heartbeat كل 10s، والتكّات تُطوى في الفريم المطلوب. بدونه: استطلاع كل `TWELVEDATA_POLL_SECONDS`.
- الأخطاء: الـAPI يرجع 200 مع `{status:"error", code:429}` عند نفاد الرصيد — يُلتقط ويُعرض في الحالة كـ`OFFLINE` مع الرسالة.
- تنبيه: المؤشرات (NDX/SPX) وبعض الأسواق مقيدة بالخطة — تأكد من تغطية رموزك في الخطة الموقّعة.

### Polygon.io (مُنفَّذ — REST + ميزانية + WebSocket/polling)
- التغطية: US Stocks، Indices (`I:NDX`, `I:SPX`)، Forex (`C:EURUSD`)، Crypto (`X:BTCUSD`). لا سلع (USOIL بلا رمز هنا).
- REST `/v2/aggs/ticker/{t}/range/{mult}/{span}/{from}/{to}` بنطاق تقويمي يراعي الإغلاقات (×4.5 للمؤشرات/الأسهم داخل اليوم).
- البث: قناة لكل عنقود (`forex`/`crypto`/`indices`/`stocks`) مع توثيق ثم اشتراك `CA.C:EUR-USD` / `XA.X:BTC-USD` / `AM.I:NDX`؛ تجميعات الدقيقة تُطوى في الفريم.
- الميزانية: `POLYGON_REQUESTS_PER_MINUTE` (المجاني 5؛ المدفوع غير محدود — ضع 300).

### Databento / dxFeed / CQG / Rithmic (مرحلة متقدمة)
Futures وTick وOrder Flow/Footprint. مؤسسي، مئات إلى آلاف الدولارات شهريًا.

### الأخبار والتقويم (P2)
Trading Economics / Financial Modeling Prep / Finnhub. المطلوب: التاريخ/الوقت/الدولة/العملة/الأهمية/السابق/المتوقع/الفعلي + المصدر.

## تقدير الاستهلاك (credits/min) — Twelve Data
| السيناريو | الحساب | ≈ credits/min |
|---|---|---|
| شارت واحد 5m مع التحليل (polling) | الفريم الأساسي كل 75s + 15m كل 225s + 1h/4h/1d كل 300s | 1.9 |
| الشارت نفسه مع WS | البث يغني عن REST للفريم الأساسي | 1.1 |
| ورقة الأسواق (10 رموز، 15m + 4 HTF) | كل 300s | 10 |
| 20 مستخدمًا متزامنًا على رموز مختلفة | 20 × 1.9 | 38 |
المخزن يجعل الاستهلاك دالّة في **عدد الرموز المميزة** لا عدد المستخدمين: مئة مستخدم على نفس 10 رموز = استهلاك 10 رموز. Grow (55/min) يكفي الـMVP؛ Pro لمستخدمين ورموز أكثر أو للبث.

## قائمة التحقق قبل توقيع العقد (مهمة صاحب المشروع)
1. **التغطية**: XAU/USD، XAG/USD، EUR/USD، GBP/USD، USD/JPY، NDX، SPX، WTI/USD، BTC/USD، ETH/USD متاحة في الخطة (المؤشرات والسلع غالبًا في مستويات أعلى).
2. **الزمن الحقيقي أم المتأخر** لكل فئة، ومدة التأخير إن وجد؛ **WebSocket** مشمول؟ كم اتصال وكم رمزًا؟
3. **الحدود**: credits/min واليومي مقابل التقدير أعلاه مع هامش 20%.
4. **الترخيص**: عرض الأسعار والتحليل المشتق لمستخدمين نهائيين (B2C) ولقطات المجتمع = حقوق **عرض/إعادة توزيع**؛ بيانات البورصات (CME/NASDAQ) قد تحمل رسومًا إضافية.
5. **العمق التاريخي**: ≥ 5000 شمعة لكل فريم للمختبر؛ سنتان من 1m مفضلة.
6. **SLA**: نسبة التوفر، صفحة الحالة، سياسة التصحيحات، الدعم.
7. **الإنهاء والتسعير**: مدة الإشعار، تغيّر السعر، ما يحدث للبيانات المخزنة بعد الإنهاء.
8. **الأمان**: تدوير المفتاح، قائمة IP مسموحة، لا PII يُرسل للمزود.

## الانتقال للإنتاج (runbook)
```bash
# 1) المفاتيح في Secrets وليس في .env المرفوع
MARKET_DATA_ROUTES=forex=twelvedata,metal=twelvedata,index=twelvedata,commodity=twelvedata,crypto=twelvedata
TWELVEDATA_API_KEY=… TWELVEDATA_PLAN=grow TWELVEDATA_CREDITS_PER_MINUTE=44   # 80% من 55

# 2) فحص المسار من طرف إلى طرف (REST + 30 ثانية بث/استطلاع)
pnpm --filter @tradingworld/api build
pnpm --filter @tradingworld/api feed:check XAUUSD 5m 30

# 3) بعد التشغيل: /health.warnings فارغة، /feeds كل الأدوات LIVE/DELAYED (أو CLOSED خارج الدوام)،
#    لوحة الإدارة تعرض الميزانية؛ راقب يومًا كاملًا ثم اضبط credits/min.
# 4) عند تفعيل البث في الخطة: TWELVEDATA_WS=true ثم أعد feed:check.
```

## الحدود والتعامل مع الأخطاء
- إعادة اتصال WS أسية مع إعادة الاشتراك/التوثيق (`support/socket.ts`).
- الميزانية تمنع 429 استباقيًا؛ وإن حدث يُعرض ولا يُعاد الطلب بعنف.
- اكتشاف الفجوات وإعادة الملء التاريخي إلى Timescale (DATA-02).
- Timestamp بالثواني UTC؛ التوقيت الصيفي يُعالج عند طبقة العرض وتقويم السوق فقط.

## اختلاف الأسعار بين المصادر
لا سعر مركزي للفوركس الفوري. الفرق مع البروكر ينتج عن السيولة/السبريد/نوع السعر (Bid/Ask/Mid/Last)/التوقيت. لوحة مقارنة المصادر مخططة (المواصفة §12 للشارت).

## الملفات
`apps/api/src/providers/{registry,twelvedata,polygon,binance,demo}.ts` · `providers/support/*` · `apps/api/src/tools/feed-check.ts` · `packages/shared/src/{feeds,marketHours,instruments}.ts` · اختبارات `apps/api/src/__tests__/providers.test.ts` (20) — بدون شبكة: fetch وWebSocket مزيفان بحمولات حقيقية الشكل.
