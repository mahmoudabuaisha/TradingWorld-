"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { DEFAULT_INSTRUMENTS } from "@tradingworld/shared";
import { api, type Alert } from "@/lib/api";
import { useApp } from "@/store/useApp";

export function AlertsView() {
  const { locale, token } = useApp();
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [f, setF] = useState({ symbol: "XAUUSD", kind: "price_above", price: "", note: "" });
  const L = (ar: string, en: string) => (locale === "ar" ? ar : en);
  const load = useCallback(async () => { if (token) setAlerts((await api.alerts(token)).alerts); }, [token]);
  useEffect(() => { void load(); }, [load]);
  if (!token) return <div className="sheet p-6 text-center text-ink-2">{L("سجّل الدخول لإدارة التنبيهات.", "Sign in to manage alerts.")} <Link href="/login" className="text-ink underline">{L("تسجيل الدخول", "Sign in")}</Link></div>;
  return (
    <div className="grid gap-4 lg:grid-cols-[340px_1fr]">
      <form className="sheet space-y-2 p-4" onSubmit={async (e) => { e.preventDefault(); await api.createAlert(token, { symbol: f.symbol, kind: f.kind, price: +f.price, note: f.note || undefined }); setF({ ...f, price: "", note: "" }); await load(); }}>
        <span className="eyebrow">ATLAS 02 · 11</span><h2 className="font-semibold">{L("تنبيه جديد", "New alert")}</h2>
        <select className="input font-mono" value={f.symbol} onChange={(e) => setF({ ...f, symbol: e.target.value })}>{DEFAULT_INSTRUMENTS.map((i) => <option key={i.symbol}>{i.symbol}</option>)}</select>
        <select className="input" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}><option value="price_above">{L("السعر يتجاوز", "Price above")}</option><option value="price_below">{L("السعر يكسر", "Price below")}</option></select>
        <input required type="number" step="any" className="input font-mono" placeholder={L("السعر", "Price")} value={f.price} onChange={(e) => setF({ ...f, price: e.target.value })} />
        <input className="input" placeholder={L("ملاحظة", "Note")} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} />
        <button className="btn w-full justify-center">{L("إضافة", "Add")}</button>
        <p className="text-[11px] text-ink-3">{L("تنبيهات دخول المناطق تُنشأ من نافذة تفاصيل المنطقة على الشارت.", "Zone-entry alerts are created from the zone details card on the chart.")}</p>
      </form>
      <div className="sheet overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-[11px] text-ink-2"><tr>{["Symbol", L("النوع", "Kind"), L("السعر/المنطقة", "Price/Zone"), L("الحالة", "Status"), ""].map((h) => <th key={h} className="px-3 py-2 text-start font-normal">{h}</th>)}</tr></thead>
          <tbody>{alerts.map((a) => <tr key={a.id} className="border-t border-hair"><td className="px-3 py-2 font-mono">{a.symbol}</td><td>{a.kind}</td><td className="font-mono text-xs">{a.price ?? a.zoneId}</td><td><span className={`chip ${a.active ? "text-up" : "text-ink-3"}`}>{a.active ? "active" : `triggered ${a.triggeredAt ? new Date(a.triggeredAt).toLocaleTimeString() : ""}`}</span></td><td><button className="text-ink-3 hover:text-down" onClick={async () => { await api.deleteAlert(token, a.id); await load(); }}>✕</button></td></tr>)}
            {alerts.length === 0 && <tr><td colSpan={5} className="px-3 py-6 text-center text-ink-2">{L("لا توجد تنبيهات.", "No alerts yet.")}</td></tr>}</tbody>
        </table>
      </div>
    </div>
  );
}
