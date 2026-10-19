"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api, type Trade } from "@/lib/api";
import { useApp } from "@/store/useApp";
import { DEFAULT_INSTRUMENTS, findInstrument } from "@tradingworld/shared";
import { Icon } from "../Icon";
import { Dimension } from "../marks/Dimension";

/** Trade timestamps are Unix seconds (see docs/06-api.md); tolerate milliseconds from older clients. */
function stampOf(t: number): string {
  const ms = t > 1e12 ? t : t * 1000;
  return new Date(ms).toISOString().slice(0, 16).replace("T", " ") + "Z";
}

/** SHEET 27 — the trading journal: every trade with its plan, its reason and its R. */
export function JournalView() {
  const { locale, token } = useApp();
  const [data, setData] = useState<{ trades: Trade[]; stats: { total: number; closed: number; winRate: number; avgR: number } }>();
  const [f, setF] = useState({ symbol: "XAUUSD", direction: "long", entry: "", stopLoss: "", takeProfit: "", exitPrice: "", size: "1", setup: "", strategy: "", notes: "" });
  const [err, setErr] = useState<string>();
  const [open, setOpen] = useState<string>();
  const L = (ar: string, en: string) => (locale === "ar" ? ar : en);
  const load = useCallback(async () => { if (token) setData(await api.journal(token)); }, [token]);
  useEffect(() => { void load(); }, [load]);
  if (!token) return <div className="sheet mx-auto mt-6 max-w-lg p-6 text-center text-ink-2">{L("سجّل الدخول لاستخدام سجل التداول.", "Sign in to use the trading journal.")} <Link href="/login" className="underline">{L("تسجيل الدخول", "Sign in")}</Link></div>;
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setErr(undefined);
    try {
      await api.addTrade(token, { symbol: f.symbol, direction: f.direction, entry: +f.entry, stopLoss: +f.stopLoss, takeProfit: f.takeProfit ? +f.takeProfit : undefined, exitPrice: f.exitPrice ? +f.exitPrice : undefined, size: +f.size, setup: f.setup || undefined, strategy: f.strategy || undefined, notes: f.notes || undefined, openedAt: Math.floor(Date.now() / 1000) });
      setF({ ...f, entry: "", stopLoss: "", takeProfit: "", exitPrice: "", notes: "" }); await load();
    } catch (x) { setErr((x as Error).message); }
  };
  const S = data?.stats;
  const field = (k: keyof typeof f, label: string, required = false) => (
    <div><label htmlFor={`trade-${k}`} className="label">{label}</label><input id={`trade-${k}`} required={required} type="number" step="any" className="input font-mono" value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} /></div>
  );
  return (
    <div className="space-y-5">
      <div><span className="eyebrow">ATLAS 05 · 27 · TRADING JOURNAL</span><h1 className="text-2xl font-semibold">{L("سجل التداول", "Trading Journal")}</h1></div>
      <div className="tblock sheet">
        <div><b>TRADES</b><span>{S?.total ?? 0}</span></div>
        <div><b>CLOSED</b><span>{S?.closed ?? 0}</span></div>
        <div><b>WIN RATE</b><span>{S && S.closed ? `${Math.round(S.winRate * 100)}%` : "—"}</span></div>
        <div><b>AVG R</b><span className={S && S.avgR > 0 ? "text-up-ink" : S && S.avgR < 0 ? "text-down-ink" : ""}>{S && S.closed ? S.avgR.toFixed(2) : "—"}</span></div>
        <div><b>OPEN</b><span>{data ? data.trades.filter((t) => t.exitPrice === undefined).length : 0}</span></div>
      </div>
      <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
        <form onSubmit={submit} className="sheet space-y-3 p-4">
          <span className="eyebrow">LOG A TRADE</span>
          <div className="grid grid-cols-2 gap-3">
            <div><label htmlFor="trade-symbol" className="label">{L("الأصل", "Instrument")}</label><select id="trade-symbol" className="input font-mono" value={f.symbol} onChange={(e) => setF({ ...f, symbol: e.target.value })}>{DEFAULT_INSTRUMENTS.map((i) => <option key={i.symbol}>{i.symbol}</option>)}</select></div>
            <div><label htmlFor="trade-direction" className="label">{L("الاتجاه", "Direction")}</label><select id="trade-direction" className="input" value={f.direction} onChange={(e) => setF({ ...f, direction: e.target.value })}><option value="long">Long</option><option value="short">Short</option></select></div>
            {field("entry", "Entry", true)}{field("stopLoss", "Stop loss", true)}{field("takeProfit", "Take profit")}{field("exitPrice", L("سعر الخروج", "Exit price"))}{field("size", L("الحجم", "Size"), true)}
            <div><label htmlFor="trade-setup" className="label">Setup</label><input id="trade-setup" className="input" value={f.setup} onChange={(e) => setF({ ...f, setup: e.target.value })} /></div>
          </div>
          {f.entry && f.stopLoss && <div className="rounded border border-hair bg-field p-2"><Dimension entry={+f.entry} stop={+f.stopLoss} target={f.takeProfit ? +f.takeProfit : undefined} direction={f.direction as "long" | "short"} precision={findInstrument(f.symbol)?.pricePrecision ?? 2} height={80} /></div>}
          <div><label htmlFor="trade-strategy" className="label">{L("الاستراتيجية", "Strategy")}</label><input id="trade-strategy" className="input" value={f.strategy} onChange={(e) => setF({ ...f, strategy: e.target.value })} /></div>
          <div><label htmlFor="trade-notes" className="label">{L("سبب الدخول، الملاحظات، المشاعر", "Reason, notes, emotions")}</label><textarea id="trade-notes" className="input" rows={3} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></div>
          {err && <div className="text-xs text-stamp">{err}</div>}
          <button className="btn w-full justify-center"><Icon name="journal" size={15} />{L("حفظ الصفقة", "Save trade")}</button>
        </form>
        <section className="sheet overflow-hidden">
          <div className="flex items-center justify-between border-b border-hair px-4 py-2"><span className="eyebrow">TRADES · {data?.trades.length ?? 0}</span><span className="mono text-2xs text-ink-3">R = (EXIT − ENTRY) / (ENTRY − SL)</span></div>
          <div className="hidden grid-cols-[90px_60px_1fr_1fr_1fr_1fr_70px_1fr_36px] gap-2 border-b border-hair px-4 py-1.5 md:grid">{["Symbol", "Dir", "Entry", "SL", "TP", "Exit", "R", "Setup", ""].map((h) => <span key={h} className="eyebrow">{h}</span>)}</div>
          <ul className="divide-y divide-hair">
            {data?.trades.map((tr) => {
              const isOpen = tr.exitPrice === undefined;
              return (
                <li key={tr.id}>
                  <div className="grid grid-cols-[1fr_auto] items-center gap-2 px-4 py-2 text-xs md:grid-cols-[90px_60px_1fr_1fr_1fr_1fr_70px_1fr_36px]">
                    <button className="mono text-start text-sm font-semibold" onClick={() => setOpen(open === tr.id ? undefined : tr.id)}>{tr.symbol}</button>
                    <span className={`chip ${tr.direction === "long" ? "text-up-ink" : "text-down-ink"}`}>{tr.direction}</span>
                    <span className="mono">{tr.entry}</span><span className="mono text-down-ink">{tr.stopLoss}</span><span className="mono text-up-ink">{tr.takeProfit ?? "—"}</span><span className="mono">{tr.exitPrice ?? "—"}</span>
                    <span className="flex items-center gap-1.5">{isOpen ? <span className="chip">OPEN</span> : <><span className={`sw h-3 ${(tr.rMultiple ?? 0) >= 0 ? "hatch-up" : "hatch-down"}`} /><span className={`mono font-semibold ${(tr.rMultiple ?? 0) > 0 ? "text-up-ink" : (tr.rMultiple ?? 0) < 0 ? "text-down-ink" : ""}`}>{(tr.rMultiple ?? 0) > 0 ? "+" : ""}{tr.rMultiple}R</span></>}</span>
                    <span className="truncate text-ink-2">{tr.setup ?? ""}</span>
                    <button className="btn-ghost justify-self-end px-1.5 py-1" aria-label={L("حذف الصفقة", "Delete trade")} onClick={async () => { await api.deleteTrade(token, tr.id); await load(); }}><Icon name="close" size={14} /></button>
                  </div>
                  {open === tr.id && (
                    <div className="border-t border-dashed border-hair bg-field px-4 py-3 text-xs">
                      <Dimension entry={tr.entry} stop={tr.stopLoss} target={tr.takeProfit} current={tr.exitPrice} direction={tr.direction} precision={findInstrument(tr.symbol)?.pricePrecision ?? 2} height={84} />
                      <div className="mono mt-1 text-2xs text-ink-3">OPENED {stampOf(tr.openedAt)}{tr.strategy ? ` · ${tr.strategy}` : ""}</div>
                      {tr.notes && <p className="mt-1 text-ink-2">{tr.notes}</p>}
                    </div>
                  )}
                </li>
              );
            })}
            {data && data.trades.length === 0 && <li className="px-4 py-8 text-center text-sm text-ink-3">{L("لا صفقات بعد. سجّل الأولى من النموذج.", "No trades yet. Log the first one from the form.")}</li>}
          </ul>
        </section>
      </div>
    </div>
  );
}
