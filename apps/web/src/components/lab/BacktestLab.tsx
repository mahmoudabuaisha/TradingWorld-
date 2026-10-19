"use client";
import { useState } from "react";
import { analyze, evaluateLifecycle, type Candle, type Zone } from "@tradingworld/analysis-engine";
import { DEFAULT_INSTRUMENTS, TIMEFRAMES, findInstrument, type Timeframe } from "@tradingworld/shared";
import { api } from "@/lib/api";
import { useApp } from "@/store/useApp";

interface Outcome { zone: Zone; detectedAt: number; outcome: "REACTED" | "INVALIDATED" | "TESTED" | "UNTOUCHED"; mfeAtr: number; maeAtr: number }

/**
 * Basic walk-forward zone backtest, executed in the browser with the SAME engine as production.
 * At every step the engine only sees candles[0..i] (no future data), then each new HIGH/MEDIUM zone is
 * followed for `horizon` bars to record its outcome, MFE and MAE in ATR units.
 */
export function BacktestLab() {
  const { locale } = useApp();
  const [symbol, setSymbol] = useState("XAUUSD");
  const [timeframe, setTimeframe] = useState<Timeframe>("15m");
  const [bars, setBars] = useState(2000);
  const [step, setStep] = useState(20);
  const [horizon, setHorizon] = useState(60);
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<Outcome[]>();
  const L = (ar: string, en: string) => (locale === "ar" ? ar : en);

  const run = async () => {
    setBusy(true);
    try {
      const { candles } = await api.candles(symbol, timeframe, bars);
      const inst = findInstrument(symbol)!;
      const seen = new Set<string>();
      const out: Outcome[] = [];
      for (let i = 400; i < candles.length - horizon; i += step) {
        const window = candles.slice(0, i);
        const r = analyze({ symbol, timeframe, candles: window, pricePrecision: inst.pricePrecision, now: window[i - 1]!.time });
        const atr = r.base.atr;
        for (const z of r.zones) {
          const key = `${z.origin}:${z.createdTime}:${z.direction}`;
          if (seen.has(key) || z.quality === "LOW") continue;
          seen.add(key);
          const future: Candle[] = candles.slice(i, i + horizon);
          const life = evaluateLifecycle({ ...z, createdIndex: -1 }, future, atr);
          let mfe = 0, mae = 0;
          for (const c of future) {
            const fav = z.direction === "bullish" ? c.high - z.top : z.bottom - c.low;
            const adv = z.direction === "bullish" ? z.bottom - c.low : c.high - z.top;
            mfe = Math.max(mfe, fav); mae = Math.max(mae, adv);
            if (life.status === "INVALIDATED" && (z.direction === "bullish" ? c.close < z.bottom : c.close > z.top)) break;
          }
          out.push({ zone: z, detectedAt: window[i - 1]!.time, outcome: life.status === "REACTED" ? "REACTED" : life.status === "INVALIDATED" ? "INVALIDATED" : life.tests > 0 ? "TESTED" : "UNTOUCHED", mfeAtr: mfe / atr, maeAtr: mae / atr });
        }
      }
      setRes(out);
    } finally { setBusy(false); }
  };

  const group = (f: (o: Outcome) => string) => {
    const g: Record<string, Outcome[]> = {};
    for (const o of res ?? []) (g[f(o)] ??= []).push(o);
    return Object.entries(g).map(([k, v]) => ({ k, n: v.length, reacted: v.filter((o) => o.outcome === "REACTED").length / v.length, invalid: v.filter((o) => o.outcome === "INVALIDATED").length / v.length, mfe: v.reduce((s, o) => s + o.mfeAtr, 0) / v.length, mae: v.reduce((s, o) => s + o.maeAtr, 0) / v.length }));
  };
  const Table = ({ title, rows }: { title: string; rows: ReturnType<typeof group> }) => (
    <div className="sheet overflow-x-auto"><div className="border-b border-hair px-3 py-2 eyebrow">{title}</div>
      <table className="w-full text-xs"><thead className="text-ink-2"><tr>{["", "n", "Reacted", "Invalidated", "Avg MFE (ATR)", "Avg MAE (ATR)"].map((h) => <th key={h} className="px-3 py-1.5 text-start font-normal">{h}</th>)}</tr></thead>
        <tbody>{rows.map((r) => <tr key={r.k} className="border-t border-hair"><td className="px-3 py-1.5">{r.k}</td><td className="font-mono">{r.n}</td><td className="font-mono text-up">{Math.round(r.reacted * 100)}%</td><td className="font-mono text-down">{Math.round(r.invalid * 100)}%</td><td className="font-mono">{r.mfe.toFixed(2)}</td><td className="font-mono">{r.mae.toFixed(2)}</td></tr>)}</tbody></table></div>
  );

  return (
    <div className="space-y-4">
      <div><span className="eyebrow">ATLAS 04 · 19</span><h1 className="text-2xl font-semibold">{L("مختبر الاختبار التاريخي: المناطق", "Backtesting Lab: Zones")}</h1><p className="text-sm text-ink-2">{L("يعمل بنفس محرك الإنتاج داخل المتصفح، دون تسريب بيانات مستقبلية: عند كل خطوة يرى المحرك الشموع السابقة فقط. النتائج التاريخية لا تضمن الأداء المستقبلي.", "Runs the production engine in the browser with no look-ahead: at each step the engine only sees past candles. Historical results do not guarantee future performance.")}</p></div>
      <div className="sheet flex flex-wrap items-end gap-3 p-3">
        <div><label className="label">Symbol</label><select className="input font-mono" value={symbol} onChange={(e) => setSymbol(e.target.value)}>{DEFAULT_INSTRUMENTS.map((i) => <option key={i.symbol}>{i.symbol}</option>)}</select></div>
        <div><label className="label">TF</label><select className="input font-mono" value={timeframe} onChange={(e) => setTimeframe(e.target.value as Timeframe)}>{TIMEFRAMES.map((t) => <option key={t}>{t}</option>)}</select></div>
        <div><label className="label">Bars</label><input type="number" className="input w-24 font-mono" value={bars} onChange={(e) => setBars(+e.target.value)} /></div>
        <div><label className="label">Step</label><input type="number" className="input w-20 font-mono" value={step} onChange={(e) => setStep(+e.target.value)} /></div>
        <div><label className="label">Horizon</label><input type="number" className="input w-20 font-mono" value={horizon} onChange={(e) => setHorizon(+e.target.value)} /></div>
        <button className="btn" disabled={busy} onClick={run}>{busy ? "…" : "▶ Run"}</button>
      </div>
      {res && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{[["Zones", res.length], ["Reacted", `${Math.round((res.filter((o) => o.outcome === "REACTED").length / Math.max(1, res.length)) * 100)}%`], ["Invalidated", `${Math.round((res.filter((o) => o.outcome === "INVALIDATED").length / Math.max(1, res.length)) * 100)}%`], ["Untouched", res.filter((o) => o.outcome === "UNTOUCHED").length]].map(([k, v]) => <div key={String(k)} className="sheet p-3"><div className="text-[11px] text-ink-2">{k}</div><div className="font-mono text-xl">{v}</div></div>)}</div>
          <Table title={L("حسب الجودة", "By quality")} rows={group((o) => o.zone.quality)} />
          <Table title={L("حسب الأصل (Origin)", "By origin")} rows={group((o) => o.zone.origin)} />
          <Table title={L("حسب العامل (موجود)", "By factor (present)")} rows={group((o) => o.zone.factors.filter((f) => f.present).map((f) => f.key).sort().slice(0, 3).join("+") || "none")} />
          <Table title={L("حسب الجلسة", "By session")} rows={group((o) => { const h = new Date(o.detectedAt * 1000).getUTCHours(); return h < 7 ? "ASIA" : h < 12 ? "LONDON" : h < 16 ? "OVERLAP" : h < 21 ? "NEW_YORK" : "OFF"; })} />
        </div>
      )}
    </div>
  );
}
