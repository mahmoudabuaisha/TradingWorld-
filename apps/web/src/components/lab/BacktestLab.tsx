"use client";
import { useState } from "react";
import { analyze, resolveOutcome, OUTCOME_VERSION, type Candle, type Zone } from "@tradingworld/analysis-engine";
import { DEFAULT_INSTRUMENTS, TIMEFRAMES, findInstrument, type Timeframe } from "@tradingworld/shared";
import { api } from "@/lib/api";
import { useApp } from "@/store/useApp";

/** One zone followed for `horizon` bars. `outcome` is what happened first; `invalidated` is whether it was eventually closed through. */
interface Outcome {
  zone: Zone;
  detectedAt: number;
  outcome: "REACTED" | "INVALIDATED" | "TESTED" | "UNTOUCHED";
  invalidated: boolean;
  mfeAtr?: number;
  maeAtr?: number;
}

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
          // the same labelling rules as the live outcome tracker (engine resolveOutcome, OUTCOME_VERSION)
          const r = resolveOutcome(z, future, atr, horizon);
          const touched = r.firstTestIndex !== undefined;
          out.push({
            zone: z,
            detectedAt: window[i - 1]!.time,
            outcome: r.label,
            invalidated: r.invalidatedIndex !== undefined,
            mfeAtr: touched ? r.mfeAtr : undefined,
            maeAtr: touched ? r.maeAtr : undefined,
          });
        }
      }
      setRes(out);
    } finally {
      setBusy(false);
    }
  };

  const group = (f: (o: Outcome) => string) => {
    const g: Record<string, Outcome[]> = {};
    for (const o of res ?? []) (g[f(o)] ??= []).push(o);
    return Object.entries(g).map(([k, v]) => {
      const touched = v.filter((o) => o.mfeAtr !== undefined);
      const avg = (f: (o: Outcome) => number) => (touched.length ? touched.reduce((s, o) => s + f(o), 0) / touched.length : undefined);
      return {
        k,
        n: v.length,
        touched: touched.length,
        reacted: v.filter((o) => o.outcome === "REACTED").length / v.length,
        invalid: v.filter((o) => o.invalidated).length / v.length,
        mfe: avg((o) => o.mfeAtr!),
        mae: avg((o) => o.maeAtr!),
      };
    });
  };
  const Table = ({ title, rows }: { title: string; rows: ReturnType<typeof group> }) => (
    <div className="sheet overflow-x-auto">
      <div className="border-b border-hair px-3 py-2">
        <span className="eyebrow">{title}</span>
      </div>
      <table className="w-full text-xs">
        <thead>
          <tr>
            {["", "n", "Touched", "Reacted", "Invalidated", "Avg MFE (ATR)", "Avg MAE (ATR)"].map((h, i) => (
              <th key={i} className="px-3 py-1.5 text-start font-normal">
                <span className="eyebrow">{h}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.k} className="border-t border-hair">
              <td className="px-3 py-1.5">{r.k}</td>
              <td className="mono">{r.n}</td>
              <td className="mono">{r.touched}</td>
              <td className="mono">
                <span className="sw me-1.5 h-2.5 w-2 hatch-up align-middle" />
                <span className="text-up-ink">{Math.round(r.reacted * 100)}%</span>
              </td>
              <td className="mono">
                <span className="sw me-1.5 h-2.5 w-2 hatch-down align-middle" />
                <span className="text-down-ink">{Math.round(r.invalid * 100)}%</span>
              </td>
              <td className="mono">{r.mfe === undefined ? "—" : r.mfe.toFixed(2)}</td>
              <td className="mono">{r.mae === undefined ? "—" : r.mae.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="space-y-4">
      <div>
        <span className="eyebrow">ATLAS 04 · 19</span>
        <h1 className="text-2xl font-semibold">{L("مختبر الاختبار التاريخي: المناطق", "Backtesting Lab: Zones")}</h1>
        <p className="text-sm text-ink-2">
          {L(
            "يعمل بنفس محرك الإنتاج داخل المتصفح، دون تسريب بيانات مستقبلية: عند كل خطوة يرى المحرك الشموع السابقة فقط. النتائج التاريخية لا تضمن الأداء المستقبلي.",
            "Runs the production engine in the browser with no look-ahead: at each step the engine only sees past candles. Historical results do not guarantee future performance.",
          )}
        </p>
      </div>
      <div className="sheet flex flex-wrap items-end gap-3 p-3">
        <div>
          <label htmlFor="bt-symbol" className="label">
            Symbol
          </label>
          <select id="bt-symbol" className="input font-mono" value={symbol} onChange={(e) => setSymbol(e.target.value)}>
            {DEFAULT_INSTRUMENTS.map((i) => (
              <option key={i.symbol}>{i.symbol}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="bt-tf" className="label">
            TF
          </label>
          <select id="bt-tf" className="input font-mono" value={timeframe} onChange={(e) => setTimeframe(e.target.value as Timeframe)}>
            {TIMEFRAMES.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="bt-bars" className="label">
            Bars
          </label>
          <input id="bt-bars" type="number" className="input w-24 font-mono" value={bars} onChange={(e) => setBars(+e.target.value)} />
        </div>
        <div>
          <label htmlFor="bt-step" className="label">
            Step
          </label>
          <input id="bt-step" type="number" className="input w-20 font-mono" value={step} onChange={(e) => setStep(+e.target.value)} />
        </div>
        <div>
          <label htmlFor="bt-horizon" className="label">
            Horizon
          </label>
          <input
            id="bt-horizon"
            type="number"
            className="input w-20 font-mono"
            value={horizon}
            onChange={(e) => setHorizon(+e.target.value)}
          />
        </div>
        <button className="btn" disabled={busy} onClick={run}>
          {busy ? "…" : "▶ Run"}
        </button>
      </div>
      {res && (
        <div className="space-y-3">
          <div className="tblock sheet">
            <div>
              <b>ZONES</b>
              <span>{res.length}</span>
            </div>
            <div>
              <b>REACTED</b>
              <span className="text-up-ink">
                {Math.round((res.filter((o) => o.outcome === "REACTED").length / Math.max(1, res.length)) * 100)}%
              </span>
            </div>
            <div>
              <b>INVALIDATED</b>
              <span className="text-down-ink">
                {Math.round((res.filter((o) => o.invalidated).length / Math.max(1, res.length)) * 100)}%
              </span>
            </div>
            <div>
              <b>REACTED THEN BROKEN</b>
              <span>{res.filter((o) => o.outcome === "REACTED" && o.invalidated).length}</span>
            </div>
            <div>
              <b>TESTED</b>
              <span>{res.filter((o) => o.outcome === "TESTED").length}</span>
            </div>
            <div>
              <b>UNTOUCHED</b>
              <span>{res.filter((o) => o.outcome === "UNTOUCHED").length}</span>
            </div>
            <div>
              <b>NO LOOK-AHEAD</b>
              <span>
                {symbol} · {timeframe} · STEP {step} · HORIZON {horizon} · {OUTCOME_VERSION}
              </span>
            </div>
          </div>
          <p className="mono text-2xs text-ink-3">
            {L(
              "REACTED = إغلاق ≥ 1 ATR بعيدًا عن المنطقة بعد لمسها، حتى لو كُسرت لاحقًا · INVALIDATED = إغلاق خلف الحد البعيد خلال الأفق · MFE/MAE تُقاس من أول لمسة وبوحدة ATR، للمناطق الملموسة فقط",
              "REACTED = a close ≥ 1 ATR away from the zone after a touch, even if broken later · INVALIDATED = a close through the far edge within the horizon · MFE/MAE measured from the first touch, in ATR, touched zones only",
            )}
          </p>
          <Table title={L("حسب الجودة", "By quality")} rows={group((o) => o.zone.quality)} />
          <Table title={L("حسب الأصل (Origin)", "By origin")} rows={group((o) => o.zone.origin)} />
          <Table
            title={L("حسب العامل (موجود)", "By factor (present)")}
            rows={group(
              (o) =>
                o.zone.factors
                  .filter((f) => f.present)
                  .map((f) => f.key)
                  .sort()
                  .slice(0, 3)
                  .join("+") || "none",
            )}
          />
          <Table
            title={L("حسب الجلسة", "By session")}
            rows={group((o) => {
              const h = new Date(o.detectedAt * 1000).getUTCHours();
              return h < 7 ? "ASIA" : h < 12 ? "LONDON" : h < 16 ? "OVERLAP" : h < 21 ? "NEW_YORK" : "OFF";
            })}
          />
        </div>
      )}
    </div>
  );
}
