# 03 — Data Providers

## المبدأ
بيانات مرخصة للاستخدام التجاري، مع إظهار **المصدر، وقت الحدث، وقت الاستلام، وحالة Live/Delayed/Stale** دائمًا. لا scraping مخالف. لا نفترض أن مصدرًا واحدًا يغطي كل الأسواق.

## الواجهة الموحدة
```ts
interface MarketDataProvider {
  id: "demo" | "binance" | "twelvedata";
  supports(instrument): boolean;
  getCandles(instrument, timeframe, limit, to?): Promise<Candle[]>;
  subscribe(instrument, timeframe, onUpdate): () => void;   // candle + closed flag + receivedAt
  status(): { id, live, lastUpdate?, message? };
}
```
`Instrument Master` (`packages/shared/src/instruments.ts`) يربط كل رمز داخلي برمز المزود (`providerSymbols`).

## المزودون
### demo (مُنفَّذ)
سلسلة 1m اصطناعية حتمية (60k شمعة ≈ 42 يومًا) لكل رمز، تُجمَّع لأي فريم، مع محاكاة tick كل ثانية. نظام تبديل أنظمة + تجمع تقلب + جلسات + فتائل سحب. **ليست أسعارًا حقيقية** (تظهر رسالة في الواجهة).

### Binance (مُنفَّذ — كريبتو)
REST `/api/v3/klines` + WS `@kline_<tf>`. بلا مفتاح. **شروط الاستخدام** تقيّد إعادة التوزيع التجاري → مراجعة قانونية أو استخدام مزود مرخص (CoinAPI, Kaiko, Amberdata) للإنتاج.

### Twelve Data (مُنفَّذ — REST + polling)
Forex/Metals/Indices/Stocks/Crypto. حدود API حسب الخطة (Basic 8 req/min مجاني، Grow/Pro/Enterprise أعلى + WebSocket). ترخيص تجاري متاح في الخطط المدفوعة. التكلفة التقريبية $29–$229+/شهر.

### Polygon.io (مخطط)
US Stocks/Options/Forex/Crypto، WS، تاريخ عميق. $29–$199+/شهر. ترخيص تجاري متاح.

### Databento / dxFeed / CQG / Rithmic (مرحلة متقدمة)
Futures وTick وOrder Flow/Footprint. مؤسسي، مئات إلى آلاف الدولارات شهريًا.

### الأخبار والتقويم (P2)
Trading Economics / Financial Modeling Prep / Finnhub / ForexFactory (غير رسمي — تجنب). المطلوب: التاريخ/الوقت/الدولة/العملة/الأهمية/السابق/المتوقع/الفعلي + المصدر.

## الحدود والتعامل مع الأخطاء
- إعادة اتصال WS أسية (مُنفَّذة في الويب والـBinance adapter).
- اكتشاف الفجوات وإعادة الملء عند الاستئناف (DATA-02).
- `Feed Staleness`: إن تجاوز الفاصل الحد لكل أداة → `STALE` في الواجهة ولا يُعرض السعر كـLive.
- Timestamp بالثواني UTC، التوقيت الصيفي يُعالج عند طبقة العرض فقط.

## اختلاف الأسعار بين المصادر
لا سعر مركزي للفوركس الفوري. الفرق مع البروكر ينتج عن السيولة/السبريد/نوع السعر (Bid/Ask/Mid/Last)/التوقيت. لوحة مقارنة المصادر مخططة (المواصفة §12 للشارت).
