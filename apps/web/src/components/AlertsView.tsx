"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { DEFAULT_INSTRUMENTS } from "@tradingworld/shared";
import { api, type Alert } from "@/lib/api";
import { useApp } from "@/store/useApp";
import { Icon } from "./Icon";
import { NotificationInbox } from "./NotificationInbox";

/** SHEET 11 — alerts: a condition the trader set, never a buy or sell call. */
export function AlertsView() {
  const { locale, token } = useApp();
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [f, setF] = useState({ symbol: "XAUUSD", kind: "price_above", price: "", note: "" });
  const [err, setErr] = useState<string>();
  const L = (ar: string, en: string) => (locale === "ar" ? ar : en);
  const [tick, setTick] = useState(0);
  const load = useCallback(async () => {
    if (token) {
      setAlerts((await api.alerts(token)).alerts);
      setTick((t) => t + 1);
    }
  }, [token]);
  useEffect(() => {
    void load();
  }, [load]);
  // the server-side watcher fires alerts while this page is open too: refresh every 30 s
  useEffect(() => {
    const id = setInterval(() => void load().catch(() => undefined), 30_000);
    return () => clearInterval(id);
  }, [load]);
  if (!token)
    return (
      <div className="sheet mx-auto mt-6 max-w-lg p-6 text-center text-ink-2">
        {L("سجّل الدخول لإدارة التنبيهات.", "Sign in to manage alerts.")}{" "}
        <Link href="/login" className="underline">
          {L("تسجيل الدخول", "Sign in")}
        </Link>
      </div>
    );
  const kindLabel = (k: string) =>
    k === "price_above"
      ? L("السعر يتجاوز", "Price above")
      : k === "price_below"
        ? L("السعر يكسر", "Price below")
        : L("دخول منطقة", "Zone entry");
  const kindGlyph = (k: string) => (k === "price_above" ? "▲" : k === "price_below" ? "▼" : "⌖");
  return (
    <div className="space-y-5">
      <div>
        <span className="eyebrow">ATLAS 02 · 11 · SMART ALERTS</span>
        <h1 className="text-2xl font-semibold">{L("التنبيهات الذكية", "Smart Alerts")}</h1>
        <p className="max-w-[68ch] text-sm text-ink-2">
          {L(
            "التنبيه يقول إن شرطًا حددته قد تحقق، ولا يقول اشترِ أو بِع. تنبيهات دخول المناطق تُنشأ من التعليق المساحي على الشارت. الفحص يجري على الخادم فيُطلق التنبيه حتى لو كانت الصفحة مغلقة.",
            "An alert says a condition you set was met. It never says buy or sell. Zone-entry alerts are created from the survey callout on the chart. They are checked on the server, so they fire even when this page is closed.",
          )}
        </p>
      </div>
      <div className="grid gap-4 lg:grid-cols-[340px_1fr]">
        <form
          className="sheet space-y-3 p-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setErr(undefined);
            try {
              await api.createAlert(token, { symbol: f.symbol, kind: f.kind, price: +f.price, note: f.note || undefined });
              setF({ ...f, price: "", note: "" });
              await load();
            } catch (x) {
              setErr((x as Error).message);
            }
          }}
        >
          <span className="eyebrow">NEW ALERT</span>
          <div>
            <label htmlFor="alert-symbol" className="label">
              {L("الأصل", "Instrument")}
            </label>
            <select id="alert-symbol" className="input font-mono" value={f.symbol} onChange={(e) => setF({ ...f, symbol: e.target.value })}>
              {DEFAULT_INSTRUMENTS.map((i) => (
                <option key={i.symbol}>{i.symbol}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="alert-kind" className="label">
              {L("الشرط", "Condition")}
            </label>
            <select id="alert-kind" className="input" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}>
              <option value="price_above">{L("السعر يتجاوز", "Price above")}</option>
              <option value="price_below">{L("السعر يكسر", "Price below")}</option>
            </select>
          </div>
          <div>
            <label htmlFor="alert-price" className="label">
              {L("السعر", "Price")}
            </label>
            <input
              id="alert-price"
              required
              type="number"
              step="any"
              className="input font-mono"
              value={f.price}
              onChange={(e) => setF({ ...f, price: e.target.value })}
            />
          </div>
          <div>
            <label htmlFor="alert-note" className="label">
              {L("ملاحظة", "Note")}
            </label>
            <input id="alert-note" className="input" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} />
          </div>
          {err && <div className="text-xs text-stamp">{err}</div>}
          <button className="btn w-full justify-center">
            <Icon name="bell" size={15} />
            {L("إضافة التنبيه", "Add alert")}
          </button>
        </form>
        <section className="sheet overflow-hidden">
          <div className="flex items-center justify-between border-b border-hair px-4 py-2">
            <span className="eyebrow">ALERTS · {alerts.length}</span>
            <span className="mono text-2xs text-ink-3">{alerts.filter((a) => a.active).length} ACTIVE</span>
          </div>
          <ul className="divide-y divide-hair">
            {alerts.map((a) => (
              <li key={a.id} className="grid grid-cols-[1fr_auto] items-center gap-2 px-4 py-2.5 md:grid-cols-[100px_1fr_140px_150px_40px]">
                <span className="mono text-sm font-semibold">{a.symbol}</span>
                <span className="text-sm">
                  <span
                    className={`mono me-2 ${a.kind === "price_above" ? "text-up-ink" : a.kind === "price_below" ? "text-down-ink" : "text-ink-2"}`}
                  >
                    {kindGlyph(a.kind)}
                  </span>
                  {kindLabel(a.kind)}
                  {a.note ? <span className="text-ink-3"> · {a.note}</span> : null}
                </span>
                <span className="mono text-sm">{a.price ?? a.zoneId}</span>
                {a.active ? (
                  <span className="chip text-up-ink">ACTIVE</span>
                ) : (
                  <span className="chip text-stamp">
                    TRIGGERED{a.triggeredAt ? ` · ${new Date(a.triggeredAt).toISOString().slice(11, 16)}Z` : ""}
                  </span>
                )}
                <button
                  className="btn-ghost justify-self-end px-1.5 py-1"
                  aria-label={L("حذف التنبيه", "Delete alert")}
                  onClick={async () => {
                    await api.deleteAlert(token, a.id);
                    await load();
                  }}
                >
                  <Icon name="close" size={14} />
                </button>
              </li>
            ))}
            {alerts.length === 0 && (
              <li className="px-4 py-8 text-center text-sm text-ink-3">
                {L(
                  "لا توجد تنبيهات بعد. أضف شرطًا من النموذج أو من منطقة على الشارت.",
                  "No alerts yet. Add a condition from the form or from a zone on the chart.",
                )}
              </li>
            )}
          </ul>
        </section>
      </div>
      <NotificationInbox refreshKey={tick} />
    </div>
  );
}
