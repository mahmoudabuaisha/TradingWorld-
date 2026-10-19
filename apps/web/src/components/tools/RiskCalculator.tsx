"use client";
import { useMemo, useState } from "react";
import { calculateRisk, DEFAULT_INSTRUMENTS, findInstrument } from "@tradingworld/shared";
import { useApp } from "@/store/useApp";
import { Dimension } from "../marks/Dimension";

const WARN = {
  RISK_ABOVE_LIMIT: { ar: "المخاطرة تتجاوز الحد الذي حددته.", en: "Risk exceeds your configured limit." },
  STOP_ON_WRONG_SIDE: { ar: "وقف الخسارة في الجهة الخاطئة من الدخول.", en: "Stop loss is on the wrong side of entry." },
  TARGET_ON_WRONG_SIDE: { ar: "الهدف في الجهة الخاطئة من الدخول.", en: "Target is on the wrong side of entry." },
  RR_BELOW_ONE: { ar: "نسبة العائد إلى المخاطرة أقل من 1:1.", en: "Reward-to-risk is below 1:1." },
} as const;

export function RiskCalculator({ mode = "risk" }: { mode?: "risk" | "position" }) {
  const { locale } = useApp();
  const [symbol, setSymbol] = useState("XAUUSD");
  const [f, setF] = useState({ balance: 10000, riskPercent: 1, entry: 2650, stopLoss: 2645, takeProfit: 2665, pipValuePerLot: 10, maxRiskPercent: 2, direction: "long" as "long" | "short" });
  const inst = findInstrument(symbol) ?? DEFAULT_INSTRUMENTS[0]!;
  const r = useMemo(() => calculateRisk({ ...f, pipSize: inst.pipSize, takeProfit: f.takeProfit || undefined }), [f, inst]);
  const L = (ar: string, en: string) => (locale === "ar" ? ar : en);
  const field = (k: keyof typeof f, label: string, step = "any") => (
    <div><label className="label">{label}</label><input type="number" step={step} className="input font-mono" value={f[k] as number} onChange={(e) => setF({ ...f, [k]: Number(e.target.value) })} /></div>
  );
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="sheet space-y-3 p-4">
        <span className="eyebrow">ATLAS 03 · {mode === "risk" ? "16" : "17"}</span><h2 className="font-semibold">{mode === "risk" ? L("حاسبة المخاطرة", "Risk Calculator") : L("حاسبة حجم الصفقة", "Position Calculator")}</h2>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="label">{L("الأصل", "Instrument")}</label><select className="input font-mono" value={symbol} onChange={(e) => setSymbol(e.target.value)}>{DEFAULT_INSTRUMENTS.map((i) => <option key={i.symbol}>{i.symbol}</option>)}</select></div>
          <div><label className="label">{L("الاتجاه", "Direction")}</label><select className="input" value={f.direction} onChange={(e) => setF({ ...f, direction: e.target.value as "long" | "short" })}><option value="long">Long</option><option value="short">Short</option></select></div>
          {field("balance", L("الرصيد", "Balance"))}
          {field("riskPercent", L("المخاطرة %", "Risk %"), "0.1")}
          {field("entry", "Entry")}
          {field("stopLoss", "Stop Loss")}
          {field("takeProfit", "Take Profit")}
          {field("pipValuePerLot", L("قيمة النقطة / لوت", "Pip value / lot"))}
          {field("maxRiskPercent", L("الحد الأقصى للمخاطرة %", "Max risk %"), "0.1")}
        </div>
        <p className="text-[11px] text-ink-3">{L(`حجم النقطة للأداة: ${inst.pipSize} · حجم العقد: ${inst.contractSize}. تحقق من مواصفات وسيطك.`, `Pip size: ${inst.pipSize} · contract size: ${inst.contractSize}. Verify with your broker's specs.`)}</p>
      </div>
      <div className="sheet p-4">
        <span className="eyebrow">{L("النتائج", "Results")} · DIMENSION</span>
        <div className="my-2 rounded border border-hair bg-field p-2"><Dimension entry={f.entry} stop={f.stopLoss} target={f.takeProfit || undefined} direction={f.direction} precision={inst.pricePrecision} /></div>
        <dl className="grid grid-cols-2 gap-2 text-sm">
          {([
            ["Risk $", r.riskAmount], ["Risk %", f.riskPercent + "%"], ["Stop distance", `${r.stopDistance} (${r.stopDistancePips} pips)`], ["Position size (lots)", r.positionSizeLots],
            ["Potential loss", r.potentialLoss], ["Potential profit", r.potentialProfit ?? "—"], ["R multiple", r.rMultiple ?? "—"], ["R:R", r.riskReward ?? "—"],
          ] as [string, string | number][]).map(([k, v]) => <div key={k} className="rounded border border-hair p-2"><dt className="text-[11px] text-ink-2">{k}</dt><dd className="font-mono text-base text-ink">{v}</dd></div>)}
        </dl>
        {r.warnings.length > 0 && <ul className="mt-3 space-y-1 text-xs text-down-ink">{r.warnings.map((w) => <li key={w}>⚠ {WARN[w as keyof typeof WARN]?.[locale] ?? w}</li>)}</ul>}
      </div>
    </div>
  );
}
