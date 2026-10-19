"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api, type Trade } from "@/lib/api";
import { useApp } from "@/store/useApp";
import { DEFAULT_INSTRUMENTS } from "@tradingworld/shared";

export function JournalView() {
  const { locale, token } = useApp();
  const [data, setData] = useState<{ trades: Trade[]; stats: { total: number; closed: number; winRate: number; avgR: number } }>();
  const [f, setF] = useState({ symbol: "XAUUSD", direction: "long", entry: "", stopLoss: "", takeProfit: "", exitPrice: "", size: "1", setup: "", strategy: "", notes: "" });
  const [err, setErr] = useState<string>();
  const L = (ar: string, en: string) => (locale === "ar" ? ar : en);
  const load = useCallback(async () => { if (token) setData(await api.journal(token)); }, [token]);
  useEffect(() => { void load(); }, [load]);
  if (!token) return <div className="sheet p-6 text-center text-ink-2">{L("سجّل الدخول لاستخدام سجل التداول.", "Sign in to use the trading journal.")} <Link href="/login" className="text-ink underline">{L("تسجيل الدخول", "Sign in")}</Link></div>;
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setErr(undefined);
    try {
      await api.addTrade(token, { symbol: f.symbol, direction: f.direction, entry: +f.entry, stopLoss: +f.stopLoss, takeProfit: f.takeProfit ? +f.takeProfit : undefined, exitPrice: f.exitPrice ? +f.exitPrice : undefined, size: +f.size, setup: f.setup || undefined, strategy: f.strategy || undefined, notes: f.notes || undefined, openedAt: Math.floor(Date.now() / 1000) });
      setF({ ...f, entry: "", stopLoss: "", takeProfit: "", exitPrice: "", notes: "" }); await load();
    } catch (x) { setErr((x as Error).message); }
  };
  const S = data?.stats;
  return (
    <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
      <form onSubmit={submit} className="sheet space-y-2 p-4">
        <span className="eyebrow">ATLAS 05 · 27</span><h2 className="font-semibold">{L("تسجيل صفقة", "Log a trade")}</h2>
        <div className="grid grid-cols-2 gap-2">
          <select className="input font-mono" value={f.symbol} onChange={(e) => setF({ ...f, symbol: e.target.value })}>{DEFAULT_INSTRUMENTS.map((i) => <option key={i.symbol}>{i.symbol}</option>)}</select>
          <select className="input" value={f.direction} onChange={(e) => setF({ ...f, direction: e.target.value })}><option value="long">Long</option><option value="short">Short</option></select>
          {(["entry", "stopLoss", "takeProfit", "exitPrice", "size"] as const).map((k) => <input key={k} required={k === "entry" || k === "stopLoss" || k === "size"} type="number" step="any" className="input font-mono" placeholder={k} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} />)}
          <input className="input" placeholder="Setup" value={f.setup} onChange={(e) => setF({ ...f, setup: e.target.value })} />
        </div>
        <input className="input" placeholder={L("الاستراتيجية", "Strategy")} value={f.strategy} onChange={(e) => setF({ ...f, strategy: e.target.value })} />
        <textarea className="input" rows={3} placeholder={L("سبب الدخول / ملاحظات / المشاعر", "Reason / notes / emotions")} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} />
        {err && <div className="text-xs text-down">{err}</div>}
        <button className="btn w-full justify-center">{L("حفظ", "Save")}</button>
      </form>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[[L("الصفقات", "Trades"), S?.total ?? 0], [L("المغلقة", "Closed"), S?.closed ?? 0], ["Win rate", S ? `${Math.round(S.winRate * 100)}%` : "—"], ["Avg R", S?.avgR ?? "—"]].map(([k, v]) => <div key={String(k)} className="sheet p-3"><div className="text-[11px] text-ink-2">{k}</div><div className="font-mono text-xl">{v}</div></div>)}
        </div>
        <div className="sheet overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="text-ink-2"><tr>{["Symbol", "Dir", "Entry", "SL", "TP", "Exit", "R", "Setup", ""].map((h) => <th key={h} className="px-3 py-2 text-start">{h}</th>)}</tr></thead>
            <tbody>
              {data?.trades.map((tr) => (
                <tr key={tr.id} className="border-t border-hair">
                  <td className="px-3 py-2 font-mono">{tr.symbol}</td><td className={tr.direction === "long" ? "text-up" : "text-down"}>{tr.direction}</td>
                  <td className="font-mono">{tr.entry}</td><td className="font-mono">{tr.stopLoss}</td><td className="font-mono">{tr.takeProfit ?? "—"}</td><td className="font-mono">{tr.exitPrice ?? "—"}</td>
                  <td className={`font-mono ${(tr.rMultiple ?? 0) > 0 ? "text-up" : (tr.rMultiple ?? 0) < 0 ? "text-down" : ""}`}>{tr.rMultiple ?? "open"}</td><td>{tr.setup ?? ""}</td>
                  <td><button className="text-ink-3 hover:text-down" onClick={async () => { await api.deleteTrade(token, tr.id); await load(); }}>✕</button></td>
                </tr>
              ))}
              {data && data.trades.length === 0 && <tr><td colSpan={9} className="px-3 py-6 text-center text-ink-2">{L("لا توجد صفقات بعد.", "No trades yet.")}</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
