/**
 * OPS-01 — OpenTelemetry for the API process.
 *
 * Metrics: always on. A MeterProvider with two readers: a Prometheus reader served by the API at /metrics (pull), and
 * an OTLP/HTTP push exporter when OTEL_EXPORTER_OTLP_ENDPOINT is set. Runtime metrics (event loop delay, heap, GC)
 * come from @opentelemetry/instrumentation-runtime-node.
 *
 * Traces: on when OTEL_EXPORTER_OTLP_ENDPOINT is set (or OTEL_TRACES_CONSOLE=true). HTTP server/client, PostgreSQL
 * (pg: candle store; Prisma: repositories) and fetch (provider calls) are instrumented. The instrumentations
 * must be registered before fastify/pg are loaded, which is why server.ts starts telemetry first and imports the app
 * dynamically. The HTTP server span is renamed to the Fastify route by app.ts (`GET /api/v1/candles`).
 *
 * Everything is process-wide and idempotent: the second call returns the first instance (tests build many apps).
 */
import {
  diag,
  DiagConsoleLogger,
  DiagLogLevel,
  metrics,
  SpanStatusCode,
  trace,
  type Attributes,
  type Context,
  type Link,
  type Meter,
  type SpanKind,
  type Tracer,
} from "@opentelemetry/api";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-http";
import { PrometheusExporter, PrometheusSerializer } from "@opentelemetry/exporter-prometheus";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { registerInstrumentations } from "@opentelemetry/instrumentation";
import { HttpInstrumentation } from "@opentelemetry/instrumentation-http";
import { PgInstrumentation } from "@opentelemetry/instrumentation-pg";
import { PrismaInstrumentation } from "@prisma/instrumentation";
import { RuntimeNodeInstrumentation } from "@opentelemetry/instrumentation-runtime-node";
import { UndiciInstrumentation } from "@opentelemetry/instrumentation-undici";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { MeterProvider, PeriodicExportingMetricReader, type MetricReader } from "@opentelemetry/sdk-metrics";
import {
  BatchSpanProcessor,
  ConsoleSpanExporter,
  NodeTracerProvider,
  ParentBasedSampler,
  SimpleSpanProcessor,
  TraceIdRatioBasedSampler,
  SamplingDecision,
  type Sampler,
  type SamplingResult,
  type SpanProcessor,
} from "@opentelemetry/sdk-trace-node";
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from "@opentelemetry/semantic-conventions";

export interface TelemetryOptions {
  serviceName?: string;
  serviceVersion?: string;
  environment?: string;
  /** OTLP/HTTP base URL, e.g. http://otel-collector:4318 — enables trace export and metric push */
  otlpEndpoint?: string;
  /** full OTLP/HTTP traces URL (OTEL_EXPORTER_OTLP_TRACES_ENDPOINT); wins over the base URL for traces. Alone it
   * exports traces only, for a backend without a metrics receiver such as Jaeger (Prometheus scrapes the metrics) */
  otlpTracesEndpoint?: string;
  /** extra OTLP headers, "k=v,k2=v2" (vendor API keys) */
  otlpHeaders?: string;
  /** 0..1 of new traces kept (children follow their parent) */
  sampleRatio?: number;
  /** print spans to stdout (local debugging without a collector) */
  consoleTraces?: boolean;
  /** extra span processors (tests) */
  spanProcessors?: SpanProcessor[];
}

export interface Telemetry {
  meter: Meter;
  tracer: Tracer;
  tracing: boolean;
  otlp: boolean;
  /** the current metrics in Prometheus text exposition format */
  prometheus(): Promise<string>;
  shutdown(): Promise<void>;
}

let current: Telemetry | undefined;

const parseHeaders = (s?: string) =>
  Object.fromEntries(
    (s ?? "")
      .split(",")
      .map((kv) => kv.trim())
      .filter(Boolean)
      .map((kv) => [kv.slice(0, kv.indexOf("=")).trim(), kv.slice(kv.indexOf("=") + 1).trim()]),
  );

export function startTelemetry(o: TelemetryOptions = {}): Telemetry {
  if (current) return current;
  // OTEL_LOG_LEVEL=debug|info|warn|error: the SDK's own diagnostics (which modules were patched, export failures)
  const level = process.env.OTEL_LOG_LEVEL?.toUpperCase() as keyof typeof DiagLogLevel | undefined;
  if (level && level in DiagLogLevel) diag.setLogger(new DiagConsoleLogger(), DiagLogLevel[level]);
  const resource = resourceFromAttributes({
    [ATTR_SERVICE_NAME]: o.serviceName ?? "tradingworld-api",
    [ATTR_SERVICE_VERSION]: o.serviceVersion ?? "0.0.0",
    "deployment.environment.name": o.environment ?? "development",
  });
  const headers = parseHeaders(o.otlpHeaders);
  const base = o.otlpEndpoint?.replace(/\/$/, "");
  const tracesUrl = o.otlpTracesEndpoint || (base ? `${base}/v1/traces` : undefined);

  // metrics
  const prom = new PrometheusExporter({ preventServerStart: true });
  const readers: MetricReader[] = [prom];
  if (base)
    readers.push(
      new PeriodicExportingMetricReader({
        exporter: new OTLPMetricExporter({ url: `${base}/v1/metrics`, headers }),
        exportIntervalMillis: 30_000,
      }),
    );
  const meterProvider = new MeterProvider({ resource, readers });
  metrics.setGlobalMeterProvider(meterProvider);
  const serializer = new PrometheusSerializer();

  // traces
  const processors: SpanProcessor[] = [...(o.spanProcessors ?? [])];
  if (tracesUrl) processors.push(new BatchSpanProcessor(new OTLPTraceExporter({ url: tracesUrl, headers })));
  if (o.consoleTraces) processors.push(new SimpleSpanProcessor(new ConsoleSpanExporter()));
  const tracing = processors.length > 0;
  let tracerProvider: NodeTracerProvider | undefined;
  if (tracing) {
    tracerProvider = new NodeTracerProvider({
      resource,
      sampler: new ParentBasedSampler({ root: new DropOrphanPrisma(new TraceIdRatioBasedSampler(o.sampleRatio ?? 1)) }),
      spanProcessors: processors,
    });
    tracerProvider.register();
  }

  const http = tracing
    ? new HttpInstrumentation({
        // health checks and scrapes are noise; WebSocket upgrades are long-lived
        ignoreIncomingRequestHook: (req) => /\/(metrics|health)(\?|$)/.test(req.url ?? "") || req.headers.upgrade === "websocket",
      })
    : undefined;
  registerInstrumentations({
    tracerProvider,
    meterProvider,
    instrumentations: [
      // default precision (10 ms): the event-loop delay histogram includes its sampling interval, so a coarse precision
      // reads as lag (5000 ms reported ~5 s of "delay" on an idle process)
      new RuntimeNodeInstrumentation(),
      // pg: the candle store and backup tool; Prisma: the repositories (its engine does not go through pg)
      ...(http
        ? [http, new PgInstrumentation({ enhancedDatabaseReporting: false }), new PrismaInstrumentation(), new UndiciInstrumentation()]
        : []),
    ],
  });
  // http.server.request.duration with the Fastify route is recorded by app.ts; the HTTP instrumentation's own copy has
  // no route (one series per raw URL), so it records into a provider without readers
  http?.setMeterProvider(new MeterProvider());

  current = {
    meter: metrics.getMeter("tradingworld-api", o.serviceVersion),
    tracer: trace.getTracer("tradingworld-api", o.serviceVersion),
    tracing,
    otlp: !!tracesUrl,
    async prometheus() {
      const { resourceMetrics, errors } = await prom.collect();
      for (const e of errors) console.warn("metrics collection:", e);
      return serializer.serialize(resourceMetrics);
    },
    async shutdown() {
      await Promise.allSettled([meterProvider.shutdown(), tracerProvider?.shutdown()]);
      current = undefined;
    },
  };
  return current;
}

/** The process telemetry, started with defaults if nobody started it (tests, tools). */
export function telemetry(): Telemetry {
  return current ?? startTelemetry();
}

/**
 * Prisma spans without a parent (client start-up, engine connect) would each become a one-span trace; inside a request
 * or a job they are children and kept. Every other root follows the ratio sampler.
 */
class DropOrphanPrisma implements Sampler {
  constructor(private readonly inner: Sampler) {}
  shouldSample(ctx: Context, traceId: string, name: string, kind: SpanKind, attrs: Attributes, links: Link[]): SamplingResult {
    if (name.startsWith("prisma:")) return { decision: SamplingDecision.NOT_RECORD };
    return this.inner.shouldSample(ctx, traceId, name, kind, attrs, links);
  }
  toString() {
    return `DropOrphanPrisma{${this.inner.toString()}}`;
  }
}

/** Runs a background job iteration inside its own root span, so its queries and calls form one trace. */
export function traced<T>(name: string, fn: () => Promise<T>): Promise<T> {
  return trace.getTracer("tradingworld-api").startActiveSpan(name, async (span) => {
    try {
      return await fn();
    } catch (e) {
      span.recordException(e as Error);
      span.setStatus({ code: SpanStatusCode.ERROR, message: (e as Error).message });
      throw e;
    } finally {
      span.end();
    }
  });
}
