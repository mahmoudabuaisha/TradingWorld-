# 14 — المراقبة والسجلات والتنبيهات (OPS-01)

> ثلاث طبقات تجيب عن ثلاثة أسئلة: **المقاييس** (هل الخدمة بخير الآن؟)، **التتبع** (أين ذهب الوقت في هذا الطلب؟)، **السجلات** (ماذا حدث بالضبط؟). وفوقها **المراقب الداخلي** الذي يُبلغ المشرفين دون حاجة لأي خدمة خارجية، و**فحص خارجي** لما لا يستطيع المراقب الداخلي رؤيته: توقف العملية نفسها.

كل شيء مبني على OpenTelemetry، فيعمل مع أي منصة (Grafana Cloud، Honeycomb، Datadog، Jaeger محليًا، Prometheus) دون تغيير الكود.

## 1. المقاييس

`GET /metrics` بصيغة Prometheus (خارج `/api/v1`).

| البيئة | الوصول |
|---|---|
| الإنتاج | **معطّل** ما لم يُضبط `METRICS_TOKEN` (16 حرفًا على الأقل)، ثم بـ`Authorization: Bearer <token>` فقط |
| التطوير | مفتوح، والرمز اختياري |

ويُرسل أيضًا بـOTLP كل 30 ثانية عند ضبط `OTEL_EXPORTER_OTLP_ENDPOINT`.

| المقياس (اسم Prometheus) | النوع | المعنى |
|---|---|---|
| `http_server_request_duration_{bucket,sum,count}` | histogram (ثوانٍ) | زمن كل طلب، بأوسمة `http_request_method` و`http_route` (قالب مسار Fastify مثل `/api/v1/candles`) و`http_response_status_code`. المسارات غير المعروفة تُجمع في `unmatched` حتى لا ينفجر عدد السلاسل بسبب الماسحات |
| `tw_ws_connections` | gauge | اتصالات WebSocket المفتوحة |
| `tw_analysis_duration_*{timeframe}` | histogram | زمن تشغيل المحرك مع جلب الشموع |
| `tw_alerts_fired_total` | counter | تنبيهات المستخدمين التي أُطلقت |
| `tw_notifications_deliveries_total{channel,status}` | counter | نتائج إرسال Push والبريد |
| `tw_feed_up{symbol,provider,licensed}` | gauge | 1 = بيانات تتدفق أو السوق مغلق؛ 0 = STALE/OFFLINE |
| `tw_feed_age{symbol,provider}` | gauge (ثوانٍ) | منذ آخر بيان |
| `tw_provider_up` · `tw_provider_budget_utilization` | gauge | حالة كل مزود ونسبة ميزانية طلباته |
| `tw_alerts_watch_age` | gauge (ثوانٍ) | منذ آخر فحص للتنبيهات |
| `tw_backup_age` · `tw_backup_drill_ok` | gauge | من `status.json` لحاوية النسخ (OPS-02) |
| `tw_process_heap_ratio` | gauge | الـheap المستخدم ÷ حد V8 |
| `tw_ops_alerts_firing{alert,severity}` | gauge | قواعد المراقب الداخلي القائمة الآن |
| `nodejs_eventloop_delay_p99`، `nodejs_eventloop_utilization`، `v8js_memory_*`، `v8js_gc_duration_*` | runtime | من `@opentelemetry/instrumentation-runtime-node` |
| `db_client_operation_duration_*{db_operation_name}` | histogram | استعلامات `pg` (مخزن الشموع) |

ملاحظة: هذا المُصدِّر لا يضيف لاحقة الوحدة (`_seconds`) إلى الأسماء؛ الأسماء أعلاه هي ما يظهر فعلًا.

## 2. التتبع

يعمل عند ضبط `OTEL_EXPORTER_OTLP_ENDPOINT` (OTLP/HTTP، مثل `http://jaeger:4318`) أو `OTEL_TRACES_CONSOLE=true` للطباعة محليًا.

- **ما يُتتبع**: طلبات HTTP الواردة والصادرة، استعلامات Prisma (المستودعات) و`pg` (مخزن الشموع وأداة النسخ)، و`fetch` (طلبات مزودي البيانات).
- **أسماء مقروءة**: span الطلب يُسمى بمسار Fastify (`GET /api/v1/analysis`) ويحمل `tw.request_id`. كل دورة لمهمة خلفية لها span جذري خاص (`job alerts.watch`، `job outcomes.run`، `job backfill.cycle`، `job backfill.aggregate`)، فتظهر استعلاماتها في أثر واحد مفهوم.
- **بلا ضجيج**: spans لـPrisma بلا أب (تهيئة العميل) تُسقط؛ داخل طلب أو مهمة تبقى. `/metrics` و`/health` ومقابس WebSocket الطويلة لا تُتتبع.
- **أخذ العينات**: `OTEL_TRACES_SAMPLE_RATIO` (افتراضيًا 1 = الكل). مع حركة كبيرة يُخفض إلى 0.1 مثلًا؛ الـspans الأبناء تتبع قرار الأب دائمًا.
- **منصات مستضافة**: `OTEL_EXPORTER_OTLP_HEADERS` للمفاتيح، مثل `x-honeycomb-team=…` أو `Authorization=Basic …` لـGrafana Cloud.
- **تشخيص**: `OTEL_LOG_LEVEL=debug` يطبع ما رُقّع من وحدات وأخطاء الإرسال.
- **ESM**: الـAPI وحدات ES، فـ`server.ts` يسجل خطاف الاستيراد ويبدأ القياس **قبل** تحميل fastify وpg وPrisma، ثم يستورد التطبيق ديناميكيًا. تشغيل `node dist/server.js` كافٍ؛ لا حاجة لـ`--import`.

## 3. السجلات

- JSON سطرًا بسطر (pino)، المستوى من `LOG_LEVEL` (افتراضيًا `info`).
- **معرّف الطلب**: يُقبل `X-Request-Id` صالح من الوكيل أو العميل (حروف وأرقام و`._:-`، من 8 إلى 128 حرفًا)، وإلا يُولَّد UUID. يُعاد في رأس الاستجابة ويظهر في كل سطر بالمفتاح `reqId`.
- **ربط بالأثر**: كل سطر يُكتب داخل طلب أو مهمة متتبعة يحمل `trace_id` و`span_id`، فيقود السطر إلى أثره في Jaeger أو Tempo.
- **إخفاء الأسرار**: `authorization`، `cookie`، `set-cookie`، وأي حقل باسم `password` أو `token` أو `apiKey` أو `secret` أو `smtpUrl` أو `databaseUrl` يُكتب `[redacted]`.

## 4. المراقب الداخلي (التنبيهات)

يعمل داخل الـAPI ويفحص كل دقيقة. القاعدة يجب أن تبقى قائمة مدة «المهلة» قبل الإبلاغ، ويُعاد الإبلاغ كل `OPS_ALERT_REPEAT_HOURS` (4 ساعات) ما دامت قائمة، ويُبلَّغ عن العودة للطبيعي أيضًا.

| القاعدة | الخطورة | الشرط | المهلة |
|---|---|---|---|
| `api_errors` | حرجة | أخطاء 5xx أكثر من `OPS_ERROR_RATIO` (5%) من آخر 5 دقائق، مع 20 طلبًا على الأقل | — |
| `api_latency` | تحذير | p95 أكثر من `OPS_P95_MS` (2000 ms) في آخر 5 دقائق، مع 20 طلبًا على الأقل | — |
| `feed_down` | حرجة | أداة من مزود حقيقي (ليس demo) بحالة STALE/OFFLINE والسوق مفتوح | `OPS_FEED_DOWN_MINUTES` (5) |
| `provider_budget` | تحذير | استهلاك 90% من ميزانية مزود، أو طلبات تنتظر | 5 دقائق |
| `alert_watcher` | حرجة | آخر فحص لتنبيهات المستخدمين أقدم من 3 دورات + 60 ث | — |
| `event_loop` | تحذير | p99 لتأخر حلقة الأحداث أكثر من `OPS_EVENT_LOOP_P99_MS` (500 ms) | دقيقتان |
| `memory` | تحذير | الـheap أكثر من `OPS_HEAP_RATIO` (85%) من حد V8 | 5 دقائق |
| `disk` (OPS-01b) | حرجة | القرص الذي عليه القاعدة والنسخ ممتلئ أكثر من `OPS_DISK_RATIO` (85%) كما يحسبه `df` | — |
| `background_jobs` | تحذير | آخر تشغيل لمتتبع النتائج أو التعبئة فشل | — |
| `data_routing` (إنتاج فقط) | تحذير | فئات أصول تُخدم من البيانات التجريبية | — |
| `backups` (إنتاج فقط) | حرجة | أي مشكلة من `backup status` (نسخة متقادمة، فشل، اختبار استرجاع فاشل أو متأخر) | — |

**القنوات**: كل مشرف (دور admin أو أعلى) يتلقى إشعارًا من نوع `ops` في صندوقه، ثم Push والبريد حسب تفضيلاته (NOTIF-01)، والرابط يفتح `/admin#ops`. و`OPS_ALERT_WEBHOOK_URL` يتلقى JSON فيه `text` (Slack، Teams، Mattermost) و`content` (Discord) وكائن `alert` كاملًا.

**في لوحة الإدارة** (قسم «صحة النظام»): حالة كل قاعدة، الطلبات في الدقيقة، نسبة 5xx، p95، حلقة الأحداث، الذاكرة، WebSocket، المصادر المتوقفة، آخر التحولات، وزرّا «فحص الآن» و«إرسال تنبيه تجريبي». الثاني يثبت أن البريد والـwebhook مضبوطان قبل أن يُحتاج إليهما. وعند ضبط `MONITORING_URL` يظهر زر «لوحات المراقبة ↗» إلى Grafana.

## 5. ما لا يراه المراقب الداخلي

المراقب يعيش داخل العملية: إن توقفت العملية توقف معه. لذلك:

1. **فحص خارجي (OPS-01b)**: `.github/workflows/uptime.yml` يشغّل `deploy/smoke-test.sh` على الموقع الحي كل 10 دقائق من خوادم GitHub: الصفحة، الـAPI، الـWebSocket، HTTPS وHSTS، Grafana، والمنافذ المغلقة. يرى ما لا يراه الخادم عن نفسه: توقف الخادم كله أو Docker أو Caddy، أو DNS، أو الشهادة. الفشل يُعاد بعد دقيقة (النشر يعيد تشغيل الـAPI لثوانٍ)، ثم يرسل GitHub بريدًا لصاحب المستودع (Settings ثم Notifications ثم Actions: «Only notify for failed workflows»). نطاق آخر: متغير المستودع `SITE_DOMAIN`. حدود: جدولة GitHub قد تتأخر دقائق، وتتوقف تلقائيًا إن لم يتغير المستودع 60 يومًا (يكفي تشغيلها يدويًا مرة من Actions).
2. **إعادة التشغيل**: كل الخدمات بـ`restart: unless-stopped`، والـAPI والويب وPrometheus وGrafana لها healthcheck.
3. **حاوية النسخ** لها healthcheck مستقل (`backup status --check`)، فتعطّل النسخ يظهر حتى لو توقف الـAPI.

## 6. Prometheus وGrafana وJaeger

### في الإنتاج (OPS-01b، تعمل دائمًا)

| الخدمة | أين | المحتوى |
|---|---|---|
| Grafana | `https://DOMAIN/grafana/` بتسجيل دخول | لوحة «TradingWorld · API» (الصفحة الأولى بعد الدخول) ولوحة «TradingWorld · Server»، والآثار من Explore ثم Jaeger. وزر «لوحات المراقبة ↗» في لوحة الإدارة يفتحها |
| Prometheus | داخلي فقط | يجمع `/metrics` من الـAPI بالرمز ومقاييس الخادم كل 15 ث، احتفاظ 30 يومًا أو 4 GB، والقواعد الـ12 في `infra/monitoring/alerts.yml` |
| Jaeger | داخلي فقط | آخر 20,000 أثر في الذاكرة (تضيع عند إعادة تشغيله). الـAPI يرسل إليه بـ`OTEL_EXPORTER_OTLP_TRACES_ENDPOINT` |
| node-exporter | داخلي فقط | المعالج والذاكرة والقرص والشبكة والحمل للخادم نفسه |

- **الدخول إلى Grafana**: بريد المشرف (`ADMIN_EMAIL`) أو `admin`، وكلمة السر هي `ADMIN_PASSWORD` من `deploy/.env` (أو `GRAFANA_ADMIN_PASSWORD` إن ضُبط). تُضبط مرة واحدة عند أول تشغيل لـGrafana؛ تغييرها لاحقًا:
  ```bash
  deploy/tw exec grafana grafana cli admin reset-admin-password 'NEW-PASSWORD'
  ```
- **لا يبدأ Grafana أبدًا بـadmin/admin**: إن لم توجد كلمة سر عند أول تشغيل يرفض البدء ويكتب السبب في سجله، وبقية المنصة تعمل.
- **الحماية**: التسجيل الذاتي والدخول المجهول معطلان، والكوكي آمنة، وGrafana يحظر تخمين كلمة السر بعد محاولات فاشلة. Prometheus وJaeger بلا أي مسار من الخارج.
- **الذاكرة**: حدود 768 MB لـPrometheus وJaeger، و512 MB لـGrafana، و128 MB للمُصدِّر.
- **القرص**: لوحة «Server» وقاعدة `TradingWorldDiskSpace` وقاعدة `disk` في المراقب الداخلي تحسب كلها مثل `df`: المستخدم ÷ (المستخدم + المتاح).
- **تعديل الإعدادات**: `deploy.sh` يعيد تشغيل Prometheus وGrafana عند تغيّر `infra/monitoring/`، ويعيد تحميل Caddy عند تغيّر `deploy/caddy/`.

قواعد Prometheus تظهر في Grafana (Alerting ثم Alert rules) وفي اللوحات. الإشعار نفسه يأتي من المراقب الداخلي (صندوق المشرفين والإشعارات والبريد والـwebhook) ومن الفحص الخارجي، فلا حاجة لـAlertmanager على خادم واحد.

### محليًا (ملف التعريف `monitoring`)

```bash
echo -n "$METRICS_TOKEN" > secrets/metrics-token.txt      # نفس قيمة METRICS_TOKEN في .env
# في .env: GRAFANA_ADMIN_PASSWORD=… و OTEL_EXPORTER_OTLP_TRACES_ENDPOINT=http://jaeger:4318/v1/traces
docker compose --profile app --profile monitoring up -d
```
| الخدمة | العنوان (محلي فقط) |
|---|---|
| Prometheus | `127.0.0.1:9090` |
| Grafana | `127.0.0.1:3001` |
| Jaeger | `127.0.0.1:16686` |

## 7. المتغيرات

| المتغير | الافتراضي |
|---|---|
| `LOG_LEVEL` | `info` |
| `OTEL_EXPORTER_OTLP_ENDPOINT` · `OTEL_EXPORTER_OTLP_HEADERS` | — (خدمة OTLP مستضافة: آثار ومقاييس) |
| `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT` | — (آثار فقط؛ الإنتاج: `http://jaeger:4318/v1/traces`) |
| `MONITORING_URL` | — (الإنتاج: `https://DOMAIN/grafana/`) |
| `GRAFANA_ADMIN_PASSWORD` | — (الإنتاج: `ADMIN_PASSWORD` عند أول تشغيل) |
| `OTEL_SERVICE_NAME` | `tradingworld-api` |
| `OTEL_TRACES_SAMPLE_RATIO` | `1` |
| `OTEL_TRACES_CONSOLE` · `OTEL_LOG_LEVEL` | `false` · — |
| `METRICS_TOKEN` | — (إلزامي لـ`/metrics` في الإنتاج) |
| `OPS_WATCHDOG_ENABLED` | `true` |
| `OPS_ALERT_WEBHOOK_URL` | — |
| `OPS_ALERT_REPEAT_HOURS` | `4` |
| `OPS_ERROR_RATIO` · `OPS_P95_MS` · `OPS_FEED_DOWN_MINUTES` · `OPS_EVENT_LOOP_P99_MS` · `OPS_HEAP_RATIO` · `OPS_DISK_RATIO` | `0.05` · `2000` · `5` · `500` · `0.85` · `0.85` |

## 8. ما تم التحقق منه

| السيناريو | النتيجة |
|---|---|
| الـAPI على TimescaleDB مع إرسال OTLP إلى Jaeger 1.62 | آثار بأسماء المسارات، فيها استعلامات Prisma و`pg`؛ دورة `job alerts.watch` أثر مستقل؛ لا آثار يتيمة |
| سطر السجل والأثر | `trace_id` في السجل يطابق الأثر في Jaeger |
| Prometheus 3.5 يجمع `/metrics` بالرمز | الهدف `up`؛ القواعد العشر بلا أخطاء؛ كل تعبير يعيد سلاسل حقيقية |
| Grafana 12.1 مع اللوحة المهيأة | كل اللوحات تعرض بيانات حقيقية |
| `/metrics` في الإنتاج | 404 بلا رمز مضبوط، 401 برمز خاطئ، 200 بالصحيح |
| المراقب في الإنتاج | `data_routing` و`backups` قامتا فعلًا؛ وصل الـwebhook إلى مستقبل HTTP حقيقي بالنص المتوقع |
| الاختبارات (11) | نافذة الطلبات، دورة حياة القاعدة (انتظار ← قيام ← تكرار ← عودة، والقفزة الأقصر من المهلة لا تُبلغ)، القواعد على تطبيق حقيقي، المشرفون فقط يتلقون، الـwebhook، معرّف الطلب، إخفاء الأسرار، ربط السجل بالأثر، `/metrics` في الإنتاج، spans المهام، إسقاط Prisma اليتيم |

| **الإنتاج (OPS-01b)**: ملف الإنتاج نفسه محليًا عبر `https://localhost` | 11 فحصًا من `smoke-test.sh` نجحت؛ Prometheus يجمع الـAPI والخادم (`up` = 1 لكليهما) والقواعد الـ12 سليمة؛ اللوحتان وأثر حقيقي من Jaeger داخل Grafana؛ الدخول بالبريد وبـ`admin`؛ كلمة سر خاطئة 401 |
| تعديل `Caddyfile` بعد استبداله (كما يفعل git) | Caddy رأى الملف الجديد عبر المجلد وأعاد التحميل؛ ملف مكسور رُفض والموقع استمر |
| تعديل القواعد | بعد إعادة تشغيل Prometheus صارت 13 قاعدة، ثم 12 بعد التراجع |
| Grafana بلا كلمة سر | أول تشغيل يرفض البدء؛ Grafana قائم يستمر إن حُذف السطر |
| منطق `deploy.sh` بـ`docker` مزيف | تغيير Caddyfile ← إعادة تحميل فقط؛ تغيير القواعد ← إعادة تشغيل فقط؛ تغيير التطبيق ← لا شيء؛ Caddyfile مرفوض ← فشل وعودة للسابق ولا إعادة محاولة |
| وظيفة CI `deploy-stack` | تنشر `main` أولًا ثم تُرقّي بـ`deploy.sh` الموجود فيه، كما سيحدث على الخادم، ثم تتحقق من المراقبة كاملة |

خطأ وجدته أثناء التحقق: دقة قياس حلقة الأحداث كانت 5000 ms، والمقياس يتضمن فترة أخذ العينة، فقرأ 5 ثوانٍ «تأخيرًا» على عملية خاملة، وكانت قاعدة Prometheus ستقوم دائمًا. عادت الدقة إلى الافتراضي (10 ms).

## 9. حدود معروفة وخطوات لاحقة

- نافذة الطلبات التي يقرأها المراقب داخل كل عملية: مع أكثر من نسخة للـAPI يرى كل مراقب نسخته فقط، والصورة الكاملة في Prometheus.
- تطبيق الويب (Next.js) غير مُقاس بعد: أخطاء المتصفح وWeb Vitals خطوة لاحقة (OTel للمتصفح أو Sentry).
- Alertmanager غير مضبوط: الإشعار من المراقب الداخلي والفحص الخارجي (انظر §5 و§6).
- Jaeger يحفظ الآثار في الذاكرة: تضيع عند إعادة تشغيله، وهذا مقصود لخادم واحد.
