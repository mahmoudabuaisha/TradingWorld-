/**
 * OPS-01 — the platform's own metrics, on top of OpenTelemetry's runtime metrics.
 *
 * Synchronous instruments (created once per process, shared by every app instance):
 *   http.server.request.duration{http.request.method, http.route, http.response.status_code}  seconds
 *   tw.ws.connections                         open WebSocket connections
 *   tw.analysis.duration{timeframe}           seconds per engine run
 *   tw.alerts.fired                           user alerts that fired
 *   tw.notifications.deliveries{channel,status}
 * Observable gauges, read from the app at collection time (`observe`):
 *   tw.feed.up{symbol,provider,licensed}      1 = data flowing or market closed, 0 = STALE/OFFLINE
 *   tw.feed.age{symbol,provider}              seconds since the last datum
 *   tw.provider.up{provider} · tw.provider.budget.utilization{provider}
 *   tw.alerts.watch.age                       seconds since the alert watcher last polled
 *   tw.backup.age · tw.backup.drill.ok        from the backup job's status.json
 *   tw.ops.alerts.firing{alert,severity}      the watchdog's own view
 *   tw.process.heap.ratio                     heap used / V8 heap limit (the watchdog's memory rule)
 * Prometheus names: dots become underscores; this exporter adds no unit suffix (http_server_request_duration_bucket).
 */
import { getHeapStatistics } from "node:v8";
import { ValueType, type Attributes, type BatchObservableCallback, type Meter, type Observable } from "@opentelemetry/api";

const LATENCY_BUCKETS = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];

export interface Instruments {
  httpDuration: ReturnType<Meter["createHistogram"]>;
  wsConnections: ReturnType<Meter["createUpDownCounter"]>;
  analysisDuration: ReturnType<Meter["createHistogram"]>;
  alertsFired: ReturnType<Meter["createCounter"]>;
  deliveries: ReturnType<Meter["createCounter"]>;
  feedUp: Observable;
  feedAge: Observable;
  providerUp: Observable;
  providerBudget: Observable;
  watchAge: Observable;
  backupAge: Observable;
  drillOk: Observable;
  opsFiring: Observable;
  heapRatio: Observable;
}

const cache = new WeakMap<Meter, Instruments>();

export function instruments(meter: Meter): Instruments {
  const hit = cache.get(meter);
  if (hit) return hit;
  const made: Instruments = {
    httpDuration: meter.createHistogram("http.server.request.duration", {
      unit: "s",
      description: "Duration of HTTP server requests, by Fastify route",
      advice: { explicitBucketBoundaries: LATENCY_BUCKETS },
    }),
    wsConnections: meter.createUpDownCounter("tw.ws.connections", { description: "Open WebSocket connections" }),
    analysisDuration: meter.createHistogram("tw.analysis.duration", {
      unit: "s",
      description: "Analysis engine run time",
      advice: { explicitBucketBoundaries: LATENCY_BUCKETS },
    }),
    alertsFired: meter.createCounter("tw.alerts.fired", { description: "User alerts that fired" }),
    deliveries: meter.createCounter("tw.notifications.deliveries", { description: "Notification deliveries by channel and outcome" }),
    feedUp: meter.createObservableGauge("tw.feed.up", { description: "1 when data flows or the market is closed, 0 when STALE/OFFLINE" }),
    feedAge: meter.createObservableGauge("tw.feed.age", { unit: "s", description: "Seconds since the last datum per instrument" }),
    providerUp: meter.createObservableGauge("tw.provider.up", { description: "1 when the provider is LIVE/DELAYED/CLOSED" }),
    providerBudget: meter.createObservableGauge("tw.provider.budget.utilization", {
      description: "Share of the provider's request/credit budget used in the current window",
      valueType: ValueType.DOUBLE,
    }),
    watchAge: meter.createObservableGauge("tw.alerts.watch.age", { unit: "s", description: "Seconds since the alert watcher last polled" }),
    backupAge: meter.createObservableGauge("tw.backup.age", { unit: "s", description: "Seconds since the last successful backup" }),
    drillOk: meter.createObservableGauge("tw.backup.drill.ok", { description: "1 when the last restore drill passed" }),
    opsFiring: meter.createObservableGauge("tw.ops.alerts.firing", { description: "1 per watchdog alert currently firing" }),
    heapRatio: meter.createObservableGauge("tw.process.heap.ratio", {
      description: "Heap used / V8 heap limit",
      valueType: ValueType.DOUBLE,
    }),
  };
  cache.set(meter, made);
  return made;
}

export interface ObservedSignals {
  feeds(): { symbol: string; provider: string; state: string; licensed: boolean; ageSeconds?: number }[];
  providers(): { id: string; state: string; budget?: { used: number; limit: number } }[];
  watchAgeSeconds(): number | undefined;
  backup(): Promise<{ ageSeconds?: number; drillOk?: boolean } | undefined>;
  firing(): { id: string; severity: string }[];
}

const UP = new Set(["LIVE", "DELAYED", "CLOSED"]);

/** Registers the observable callbacks for one app; returns the function that removes them (app close). */
export function observe(meter: Meter, s: ObservedSignals): () => void {
  const i = instruments(meter);
  const cb: BatchObservableCallback = async (r) => {
    for (const f of s.feeds()) {
      const a: Attributes = { symbol: f.symbol, provider: f.provider, licensed: String(f.licensed) };
      r.observe(i.feedUp, UP.has(f.state) ? 1 : 0, a);
      if (f.ageSeconds !== undefined) r.observe(i.feedAge, f.ageSeconds, { symbol: f.symbol, provider: f.provider });
    }
    for (const p of s.providers()) {
      r.observe(i.providerUp, UP.has(p.state) ? 1 : 0, { provider: p.id });
      if (p.budget?.limit) r.observe(i.providerBudget, p.budget.used / p.budget.limit, { provider: p.id });
    }
    const w = s.watchAgeSeconds();
    if (w !== undefined) r.observe(i.watchAge, w);
    const b = await s.backup();
    if (b?.ageSeconds !== undefined) r.observe(i.backupAge, b.ageSeconds);
    if (b?.drillOk !== undefined) r.observe(i.drillOk, b.drillOk ? 1 : 0);
    for (const f of s.firing()) r.observe(i.opsFiring, 1, { alert: f.id, severity: f.severity });
    r.observe(i.heapRatio, process.memoryUsage().heapUsed / getHeapStatistics().heap_size_limit);
  };
  const all = [i.feedUp, i.feedAge, i.providerUp, i.providerBudget, i.watchAge, i.backupAge, i.drillOk, i.opsFiring, i.heapRatio];
  meter.addBatchObservableCallback(cb, all);
  return () => meter.removeBatchObservableCallback(cb, all);
}

/**
 * Requests per minute for the last few minutes, kept in-process so the watchdog can judge error rate and latency
 * without a metrics backend. Up to 2,000 latency samples per minute (reservoir), enough for a stable p95.
 */
export class RequestWindow {
  private buckets = new Map<number, { n: number; errors: number; samples: number[]; seen: number }>();
  constructor(private readonly minutes = 15) {}

  record(status: number, ms: number, now = Date.now()) {
    const key = Math.floor(now / 60_000);
    let b = this.buckets.get(key);
    if (!b) {
      b = { n: 0, errors: 0, samples: [], seen: 0 };
      this.buckets.set(key, b);
      for (const k of this.buckets.keys()) if (k <= key - this.minutes) this.buckets.delete(k);
    }
    b.n++;
    if (status >= 500) b.errors++;
    b.seen++;
    if (b.samples.length < 2000) b.samples.push(ms);
    else {
      const j = Math.floor(Math.random() * b.seen);
      if (j < 2000) b.samples[j] = ms;
    }
  }

  /** totals over the last `minutes` complete-or-current minutes */
  summary(minutes = 5, now = Date.now()) {
    const from = Math.floor(now / 60_000) - minutes + 1;
    let n = 0,
      errors = 0;
    const samples: number[] = [];
    for (const [k, b] of this.buckets)
      if (k >= from) {
        n += b.n;
        errors += b.errors;
        samples.push(...b.samples);
      }
    samples.sort((a, b) => a - b);
    const q = (p: number) => (samples.length ? samples[Math.min(samples.length - 1, Math.ceil(p * samples.length) - 1)]! : undefined);
    return { requests: n, errors, errorRatio: n ? errors / n : 0, p50Ms: q(0.5), p95Ms: q(0.95), perMinute: n / minutes };
  }
}
