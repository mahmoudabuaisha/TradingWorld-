/**
 * OPS-01 — the in-process watchdog: alerting that works without a metrics backend.
 *
 * Every minute each rule looks at what the process already knows (requests of the last 5 minutes, feeds, providers,
 * the alert watcher, event loop, heap, the backup job's status) and says firing or not. A rule must stay firing for its
 * `forSeconds` before it notifies; a firing rule is re-notified every `repeatMs`; recovery is notified too. Notices go
 * to every admin through the notification channels (inbox, push, email per their preferences) and to an optional
 * webhook. The same conditions exist as Prometheus rules (infra/monitoring/alerts.yml) for teams running Prometheus.
 */
import { monitorEventLoopDelay, type IntervalHistogram } from "node:perf_hooks";
import { getHeapStatistics } from "node:v8";
import { resolve } from "node:path";
import { roleAtLeast } from "@tradingworld/shared";
import type { AppContext } from "../context.js";
import { readStatus, statusProblems } from "./backup.js";
import type { RequestWindow } from "./metrics.js";

export type Severity = "critical" | "warning";
type Text = { ar: string; en: string };

export interface RuleResult {
  firing: boolean;
  summary: Text;
  value?: number;
}

export interface Rule {
  id: string;
  severity: Severity;
  title: Text;
  /** must be firing this long before anyone is told */
  forSeconds: number;
  evaluate(now: number): RuleResult | Promise<RuleResult>;
}

export interface AlertState {
  id: string;
  severity: Severity;
  title: Text;
  state: "ok" | "pending" | "firing";
  /** ms — when it became pending, then firing */
  since?: number;
  summary?: Text;
  value?: number;
  lastNotifiedAt?: number;
  lastEvaluatedAt?: number;
  error?: string;
}

export interface Transition {
  id: string;
  severity: Severity;
  kind: "firing" | "repeat" | "resolved";
  at: number;
  title: Text;
  summary: Text;
}

export type Notify = (t: Transition) => Promise<void>;

export class Watchdog {
  private states = new Map<string, AlertState>();
  private timer?: NodeJS.Timeout;
  private busy = false;
  readonly history: Transition[] = [];

  constructor(
    private readonly rules: Rule[],
    private readonly notify: Notify,
    private readonly opts: { intervalMs?: number; repeatMs?: number; now?: () => number; log?: (m: string) => void } = {},
  ) {
    for (const r of rules) this.states.set(r.id, { id: r.id, severity: r.severity, title: r.title, state: "ok" });
  }

  private now() {
    return this.opts.now?.() ?? Date.now();
  }

  async evaluate(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try {
      for (const rule of this.rules) await this.step(rule);
    } finally {
      this.busy = false;
    }
  }

  private async step(rule: Rule) {
    const s = this.states.get(rule.id)!;
    const now = this.now();
    let r: RuleResult;
    try {
      r = await rule.evaluate(now);
      s.error = undefined;
    } catch (e) {
      // a rule that cannot evaluate keeps its state; the error is visible on the admin sheet
      s.error = (e as Error).message;
      this.opts.log?.(`rule ${rule.id}: ${s.error}`);
      return;
    }
    s.lastEvaluatedAt = now;
    s.summary = r.summary;
    s.value = r.value;
    if (r.firing) {
      if (s.state === "ok") {
        s.state = "pending";
        s.since = now;
      }
      if (s.state === "pending" && now - s.since! >= rule.forSeconds * 1000) {
        s.state = "firing";
        s.since = now;
        await this.emit(rule, s, "firing", now);
      } else if (s.state === "firing" && now - (s.lastNotifiedAt ?? 0) >= (this.opts.repeatMs ?? 4 * 36e5)) {
        await this.emit(rule, s, "repeat", now);
      }
    } else {
      if (s.state === "firing") await this.emit(rule, s, "resolved", now);
      s.state = "ok";
      s.since = undefined;
    }
  }

  private async emit(rule: Rule, s: AlertState, kind: Transition["kind"], at: number) {
    const t: Transition = { id: rule.id, severity: rule.severity, kind, at, title: rule.title, summary: s.summary! };
    s.lastNotifiedAt = at;
    this.history.unshift(t);
    if (this.history.length > 100) this.history.pop();
    this.opts.log?.(`${kind.toUpperCase()} ${rule.severity} ${rule.id}: ${t.summary.en}`);
    try {
      await this.notify(t);
    } catch (e) {
      this.opts.log?.(`notify ${rule.id}: ${(e as Error).message}`);
    }
  }

  state(): AlertState[] {
    return [...this.states.values()];
  }

  firing(): AlertState[] {
    return this.state().filter((s) => s.state === "firing");
  }

  start() {
    if (this.timer) return;
    this.timer = setInterval(() => void this.evaluate(), this.opts.intervalMs ?? 60_000);
    this.timer.unref();
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }
}

// ── the platform's rules ────────────────────────────────────

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
const DOWN = new Set(["STALE", "OFFLINE"]);

export interface RuleDeps {
  window: RequestWindow;
  /** started by buildRules' caller; reset after every read */
  loop: IntervalHistogram;
}

export function eventLoopMonitor(): IntervalHistogram {
  const h = monitorEventLoopDelay({ resolution: 20 });
  h.enable();
  return h;
}

export function buildRules(ctx: AppContext, d: RuleDeps): Rule[] {
  const c = ctx.config;
  const rules: Rule[] = [
    {
      id: "api_errors",
      severity: "critical",
      title: { ar: "الخادم يرد بأخطاء", en: "API is failing requests" },
      forSeconds: 0,
      evaluate: (now) => {
        const s = d.window.summary(5, now);
        return {
          firing: s.requests >= 20 && s.errorRatio > c.OPS_ERROR_RATIO,
          value: s.errorRatio,
          summary: {
            ar: `${pct(s.errorRatio)} من ${s.requests} طلبًا في آخر 5 دقائق انتهت بخطأ 5xx (الحد ${pct(c.OPS_ERROR_RATIO)})`,
            en: `${pct(s.errorRatio)} of ${s.requests} requests in the last 5 min ended in 5xx (limit ${pct(c.OPS_ERROR_RATIO)})`,
          },
        };
      },
    },
    {
      id: "api_latency",
      severity: "warning",
      title: { ar: "الخادم بطيء", en: "API is slow" },
      forSeconds: 0,
      evaluate: (now) => {
        const s = d.window.summary(5, now);
        const p95 = s.p95Ms ?? 0;
        return {
          firing: s.requests >= 20 && p95 > c.OPS_P95_MS,
          value: p95,
          summary: {
            ar: `p95 لزمن الاستجابة ${Math.round(p95)} ms في آخر 5 دقائق (الحد ${c.OPS_P95_MS} ms، ${s.requests} طلبًا)`,
            en: `p95 response time ${Math.round(p95)} ms over the last 5 min (limit ${c.OPS_P95_MS} ms, ${s.requests} requests)`,
          },
        };
      },
    },
    {
      id: "feed_down",
      severity: "critical",
      title: { ar: "انقطاع بيانات السوق", en: "Market data feed down" },
      forSeconds: c.OPS_FEED_DOWN_MINUTES * 60,
      evaluate: () => {
        // demo data never goes down; a closed market is not an outage
        const down = ctx.providers.feeds().filter((f) => f.provider !== "demo" && DOWN.has(f.state));
        const list = down.map((f) => `${f.symbol} (${f.provider} ${f.state}${f.message ? `: ${f.message}` : ""})`).join(", ");
        return {
          firing: down.length > 0,
          value: down.length,
          summary: down.length
            ? { ar: `${down.length} أداة بلا بيانات: ${list}`, en: `${down.length} instrument(s) without data: ${list}` }
            : { ar: "كل المصادر تعمل أو السوق مغلق", en: "all sources flowing or market closed" },
        };
      },
    },
    {
      id: "provider_budget",
      severity: "warning",
      title: { ar: "ميزانية مزود البيانات تنفد", en: "Data provider budget nearly spent" },
      forSeconds: 300,
      evaluate: () => {
        const hot = ctx.providers
          .statuses()
          .filter((p) => p.budget && p.budget.limit > 0 && (p.budget.used / p.budget.limit >= 0.9 || p.budget.waiting > 0));
        const list = hot
          .map((p) => `${p.id} ${p.budget!.used}/${p.budget!.limit}${p.budget!.waiting ? `, ${p.budget!.waiting} waiting` : ""}`)
          .join("; ");
        return {
          firing: hot.length > 0,
          summary: hot.length
            ? { ar: `طلبات تنتظر أو استهلاك ≥ 90%: ${list}`, en: `requests waiting or ≥ 90% used: ${list}` }
            : { ar: "الميزانيات ضمن الحد", en: "budgets within limits" },
        };
      },
    },
    {
      id: "alert_watcher",
      severity: "critical",
      title: { ar: "مراقب التنبيهات متوقف", en: "Alert watcher stalled" },
      forSeconds: 0,
      evaluate: (now) => {
        if (!c.ALERT_WATCH_ENABLED) return { firing: false, summary: { ar: "معطّل في الإعداد", en: "disabled by configuration" } };
        const limit = (3 * c.ALERT_POLL_SECONDS + 60) * 1000;
        const last = ctx.alerts.stats.lastPollAt;
        const age = last ? now - last : process.uptime() * 1000;
        const firing = age > limit;
        return {
          firing,
          value: age / 1000,
          summary: {
            ar: `آخر فحص للتنبيهات قبل ${Math.round(age / 1000)} ث (يُتوقع كل ${c.ALERT_POLL_SECONDS} ث)${firing ? ". تنبيهات المستخدمين لا تُطلق" : ""}`,
            en: `last alert poll ${Math.round(age / 1000)} s ago (expected every ${c.ALERT_POLL_SECONDS} s)${firing ? "; user alerts are not firing" : ""}`,
          },
        };
      },
    },
    {
      id: "event_loop",
      severity: "warning",
      title: { ar: "حلقة الأحداث مزدحمة", en: "Event loop lagging" },
      forSeconds: 120,
      evaluate: () => {
        const p99 = d.loop.percentile(99) / 1e6;
        d.loop.reset();
        const firing = p99 > c.OPS_EVENT_LOOP_P99_MS;
        return {
          firing,
          value: p99,
          summary: {
            ar: `تأخر p99 لحلقة الأحداث ${Math.round(p99)} ms (الحد ${c.OPS_EVENT_LOOP_P99_MS} ms)${firing ? ": الطلبات والـWebSocket تتأخر" : ""}`,
            en: `event loop p99 delay ${Math.round(p99)} ms (limit ${c.OPS_EVENT_LOOP_P99_MS} ms)${firing ? ": requests and WebSockets are delayed" : ""}`,
          },
        };
      },
    },
    {
      id: "memory",
      severity: "warning",
      title: { ar: "الذاكرة قاربت الحد", en: "Memory near the limit" },
      forSeconds: 300,
      evaluate: () => {
        const ratio = process.memoryUsage().heapUsed / getHeapStatistics().heap_size_limit;
        return {
          firing: ratio > c.OPS_HEAP_RATIO,
          value: ratio,
          summary: {
            ar: `الـheap عند ${pct(ratio)} من حده (الحد ${pct(c.OPS_HEAP_RATIO)})`,
            en: `heap at ${pct(ratio)} of its limit (limit ${pct(c.OPS_HEAP_RATIO)})`,
          },
        };
      },
    },
    {
      id: "background_jobs",
      severity: "warning",
      title: { ar: "مهمة خلفية تفشل", en: "Background job failing" },
      forSeconds: 0,
      evaluate: () => {
        const bad: string[] = [];
        const lastOutcome = ctx.outcomes.status().runs[0];
        if (lastOutcome?.error) bad.push(`outcomes: ${lastOutcome.error}`);
        const lastBackfill = ctx.backfill.status().runs[0];
        if (c.BACKFILL_ENABLED && lastBackfill?.status === "failed")
          bad.push(`backfill ${lastBackfill.symbol}: ${lastBackfill.error ?? "failed"}`);
        return {
          firing: bad.length > 0,
          summary: bad.length
            ? { ar: `آخر تشغيل فشل — ${bad.join("; ")}`, en: `last run failed — ${bad.join("; ")}` }
            : { ar: "تعمل", en: "healthy" },
        };
      },
    },
  ];
  if (c.NODE_ENV === "production") {
    rules.push(
      {
        id: "data_routing",
        severity: "warning",
        title: { ar: "بيانات تجريبية في الإنتاج", en: "Demo data in production" },
        forSeconds: 0,
        evaluate: () => ({
          firing: ctx.providers.warnings.length > 0,
          summary: ctx.providers.warnings.length
            ? { ar: `فئات تُخدم من بيانات تجريبية: ${ctx.providers.warnings.join(" · ")}`, en: ctx.providers.warnings.join(" · ") }
            : { ar: "كل الفئات موجهة لمزودين مرخصين", en: "every asset class routed to a licensed provider" },
        }),
      },
      {
        id: "backups",
        severity: "critical",
        title: { ar: "النسخ الاحتياطي يحتاج انتباهًا", en: "Backups need attention" },
        forSeconds: 0,
        evaluate: async (now) => {
          if (!c.DATABASE_URL) return { firing: false, summary: { ar: "لا قاعدة بيانات", en: "no database" } };
          const problems = statusProblems(await readStatus(resolve(c.BACKUP_DIR)), {
            maxAgeHours: c.BACKUP_MAX_AGE_HOURS,
            drillMaxAgeDays: c.BACKUP_DRILL_MAX_AGE_DAYS,
            now: new Date(now),
          });
          return {
            firing: problems.length > 0,
            summary: problems.length
              ? { ar: `راجع النسخ (docs/13): ${problems.join(" · ")}`, en: problems.join(" · ") }
              : { ar: "سليم", en: "healthy" },
          };
        },
      },
    );
  }
  return rules;
}

// ── delivery ────────────────────────────────────────────────

const LABEL: Record<Transition["kind"], Text> = {
  firing: { ar: "تنبيه تشغيلي", en: "ALERT" },
  repeat: { ar: "ما زال قائمًا", en: "STILL FIRING" },
  resolved: { ar: "عاد طبيعيًا", en: "RESOLVED" },
};

/** Inbox/push/email for every admin, and the webhook when configured. */
export function opsNotifier(ctx: AppContext, fetchImpl: typeof fetch = fetch): Notify {
  return async (t) => {
    const sev = t.severity === "critical" ? { ar: "حرج", en: "critical" } : { ar: "تحذير", en: "warning" };
    const title = {
      ar: `${LABEL[t.kind].ar} (${sev.ar}): ${t.title.ar}`,
      en: `${LABEL[t.kind].en} (${sev.en}): ${t.title.en}`,
    };
    const admins = (await ctx.repos.users.list()).filter((u) => roleAtLeast(u.role, "admin"));
    await Promise.allSettled(admins.map((u) => ctx.notifications.notify(u.id, { kind: "ops", title, body: t.summary, url: "/admin#ops" })));
    const hook = ctx.config.OPS_ALERT_WEBHOOK_URL;
    if (hook) {
      const text = `[TradingWorld] ${title.en} — ${t.summary.en}`;
      const res = await fetchImpl(hook, {
        method: "POST",
        headers: { "content-type": "application/json" },
        // `text` for Slack/Teams/Mattermost, `content` for Discord; the rest for anything that parses JSON
        body: JSON.stringify({
          text,
          content: text,
          alert: { id: t.id, severity: t.severity, kind: t.kind, at: new Date(t.at).toISOString(), title: t.title, summary: t.summary },
        }),
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) throw new Error(`webhook ${res.status}`);
    }
  };
}
