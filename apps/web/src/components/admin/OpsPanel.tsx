"use client";
import { useState } from "react";
import { api, type AdminOps } from "@/lib/api";

const mb = (n: number) => `${Math.round(n / 1024 / 1024)} MB`;
const ago = (ms: number) => {
  const s = Math.max(0, (Date.now() - ms) / 1000);
  return s < 90 ? `${Math.round(s)}S AGO` : s < 5400 ? `${Math.round(s / 60)} MIN AGO` : `${(s / 3600).toFixed(1)} H AGO`;
};
const uptime = (s: number) =>
  s < 3600 ? `${Math.round(s / 60)} MIN` : s < 172800 ? `${(s / 3600).toFixed(1)} H` : `${(s / 86400).toFixed(1)} D`;

/** OPS-01 — system health: the watchdog's rules, live signals, and where telemetry goes. */
export function OpsPanel({
  data,
  token,
  locale,
  L,
  onChange,
}: {
  data: AdminOps;
  token: string;
  locale: "ar" | "en";
  L: (ar: string, en: string) => string;
  onChange: (d: AdminOps) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string>();
  const { signals: s, telemetry: t, watchdog: w } = data;
  const firing = data.alerts.filter((a) => a.state === "firing");
  const pending = data.alerts.filter((a) => a.state === "pending");
  const tx = (x: { ar: string; en: string }) => (locale === "ar" ? x.ar : x.en);

  const act = async (fn: () => Promise<unknown>, done?: string) => {
    setBusy(true);
    setMsg(undefined);
    try {
      await fn();
      onChange(await api.adminOps(token));
      if (done) setMsg(done);
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const tile = (label: string, value: string, bad = false) => (
    <div className="border-e border-hair px-3 py-1 last:border-e-0">
      <div className="eyebrow">{label}</div>
      <div className={`mono text-sm ${bad ? "text-stamp" : ""}`}>{value}</div>
    </div>
  );

  return (
    <section id="ops" className="sheet p-4 md:col-span-2" aria-labelledby="ops-h">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span id="ops-h" className="eyebrow">
          SYSTEM HEALTH · {L("صحة النظام", "System health")}
        </span>
        <span className={`chip ${firing.length ? "text-stamp" : "text-up-ink"}`}>
          {firing.length ? `${firing.length} FIRING` : "ALL CLEAR"}
          {pending.length ? ` · ${pending.length} PENDING` : ""}
        </span>
      </div>

      <div className="mt-2 flex flex-wrap border-y border-hair py-1">
        {tile("REQ/MIN", s.requests.perMinute.toFixed(1))}
        {tile("5XX · 5M", `${(s.requests.errorRatio * 100).toFixed(1)}%`, s.requests.errorRatio > 0.05)}
        {tile("P95", s.requests.p95Ms !== undefined ? `${Math.round(s.requests.p95Ms)} MS` : "—")}
        {tile("LOOP", `${Math.round(s.eventLoopUtilization * 100)}%`)}
        {tile("HEAP", `${mb(s.heap.used)} · ${Math.round(s.heap.ratio * 100)}%`, s.heap.ratio > 0.85)}
        {tile("WS", String(s.ws))}
        {tile("FEEDS DOWN", `${s.feeds.down.length}/${s.feeds.total}`, s.feeds.down.length > 0)}
        {tile("UPTIME", uptime(s.uptime))}
      </div>

      <ul className="mt-3 grid gap-1 sm:grid-cols-2">
        {data.alerts.map((a) => (
          <li key={a.id} className="grid grid-cols-[auto_1fr] items-start gap-2 border-t border-hair py-1.5 text-xs">
            <span
              className={`chip ${a.state === "firing" ? "text-stamp" : a.state === "pending" ? "text-ink" : "text-up-ink"}`}
              title={a.severity.toUpperCase()}
            >
              {a.state === "ok" ? "OK" : a.state.toUpperCase()}
            </span>
            <span>
              <span className="font-semibold">{tx(a.title)}</span>{" "}
              <bdi className="mono text-2xs text-ink-3">{a.severity === "critical" ? "CRIT" : "WARN"}</bdi>
              {a.summary && a.state !== "ok" && <span className="block text-ink-2">{tx(a.summary)}</span>}
              {a.error && <span className="mono block text-2xs text-stamp">RULE ERROR: {a.error}</span>}
            </span>
          </li>
        ))}
      </ul>

      {data.history.length > 0 && (
        <ul className="mt-3 space-y-0.5 border-t border-hair pt-2 text-2xs">
          {data.history.slice(0, 6).map((h, i) => (
            <li key={i} className="mono flex flex-wrap gap-2 text-ink-2">
              <span className={h.kind === "resolved" ? "text-up-ink" : "text-stamp"}>{h.kind.toUpperCase()}</span>
              <span>{tx(h.title)}</span>
              <span className="text-ink-3">{ago(h.at)}</span>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-hair pt-3">
        <button type="button" className="btn-ghost" disabled={busy} onClick={() => act(() => api.evaluateOps(token))}>
          {L("فحص الآن", "Evaluate now")}
        </button>
        <button
          type="button"
          className="btn-ghost"
          disabled={busy}
          onClick={() =>
            act(
              () => api.testOpsAlert(token),
              L(
                "أُرسل تنبيه تجريبي: صندوقك" + (w.webhook ? " والـwebhook" : ""),
                "Test alert sent: your inbox" + (w.webhook ? " and the webhook" : ""),
              ),
            )
          }
        >
          {L("إرسال تنبيه تجريبي", "Send a test alert")}
        </button>
        {t.dashboardUrl && (
          <a className="btn-ghost" href={t.dashboardUrl} target="_blank" rel="noopener noreferrer">
            {L("لوحات المراقبة ↗", "Dashboards ↗")}
          </a>
        )}
        {msg && (
          <span role="status" className="mono text-2xs text-ink-2">
            {msg}
          </span>
        )}
      </div>
      <p className="mono mt-2 text-2xs text-ink-3">
        WATCHDOG {w.enabled ? "ON" : "OFF"} · REPEAT {w.repeatHours}H · WEBHOOK {w.webhook ? "ON" : "OFF"} · TRACES{" "}
        {t.tracing ? `ON${t.otlp ? " · OTLP" : ""} · ${Math.round(t.sampleRatio * 100)}%` : "OFF"} · /METRICS {t.metrics.toUpperCase()}
      </p>
    </section>
  );
}
