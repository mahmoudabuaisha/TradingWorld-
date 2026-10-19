"use client";
import type { AnalysisResult, Zone } from "@tradingworld/analysis-engine";
import { describeRegime, biasLabel } from "@tradingworld/analysis-engine";
import { useApp } from "@/store/useApp";
import { t } from "@/i18n/dictionary";

const Q = { HIGH: "🟢", MEDIUM: "🟡", LOW: "⚪" } as const;

export function SidePanel({ analysis, precision, selected, onSelect, provider }: { analysis?: AnalysisResult; precision: number; selected?: string; onSelect: (z: Zone) => void; provider?: { id: string; live: boolean; message?: string } }) {
  const { locale, showLowQuality, toggleLowQuality } = useApp();
  if (!analysis) return <div className="card p-4 text-sm text-ink-muted">{t(locale, "common", "loading")}</div>;
  const r = analysis.base.regime;
  const lastSweep = analysis.base.sweeps.filter((s) => s.reclaimed).slice(-1)[0];
  const rows: [string, string][] = [
    [t(locale, "chart", "currentPrice"), analysis.lastPrice.toFixed(precision)],
    [t(locale, "chart", "marketRegime"), describeRegime(r)[locale]],
    [t(locale, "chart", "htfBias"), biasLabel(analysis.htfBias)[locale]],
    [t(locale, "chart", "structure"), biasLabel(analysis.base.bias)[locale] + (analysis.base.structure.events.slice(-1)[0] ? ` · ${analysis.base.structure.events.slice(-1)[0]!.kind}` : "")],
    [t(locale, "chart", "liquidity"), lastSweep ? (locale === "ar" ? `سحب ${lastSweep.side === "sell-side" ? "سيولة البيع" : "سيولة الشراء"} @ ${lastSweep.level.toFixed(precision)}` : `${lastSweep.side} sweep @ ${lastSweep.level.toFixed(precision)}`) : "—"],
    [t(locale, "chart", "volatility"), r.volatility],
    [t(locale, "chart", "session"), `${analysis.session.current}${analysis.session.overlap ? " (LDN/NY)" : ""}`],
  ];
  return (
    <div className="flex h-full flex-col gap-3 overflow-y-auto">
      <div className="card p-3">
        <div className="mb-2 flex items-center justify-between">
          <span className="font-mono text-lg font-bold text-gold-light">{analysis.symbol} · {analysis.timeframe}</span>
          <span className={`chip ${provider?.live ? "text-up" : "text-warn"}`} title={provider?.message}>{provider?.id ?? "?"} · {provider?.live ? "LIVE" : "STALE"}</span>
        </div>
        <dl className="space-y-1 text-xs">
          {rows.map(([k, v]) => <div key={k} className="flex justify-between gap-2"><dt className="text-ink-muted">{k}</dt><dd className="text-end text-ink">{v}</dd></div>)}
        </dl>
      </div>

      <div className="card p-3">
        <div className="mb-2 text-xs font-bold tracking-wider text-gold">{t(locale, "chart", "htfBias")} · MTF</div>
        <div className="flex flex-wrap gap-1.5">
          {analysis.htf.map((h) => <span key={h.timeframe} className={`chip ${h.bias === "bullish" ? "text-up" : h.bias === "bearish" ? "text-down" : ""}`}>{h.timeframe} {biasLabel(h.bias)[locale]}</span>)}
        </div>
      </div>

      <div className="card p-3">
        <div className="mb-2 text-xs font-bold tracking-wider text-gold">{t(locale, "chart", "keyLevels")}</div>
        <ul className="space-y-1 text-xs">
          {analysis.keyLevels.slice(0, 6).map((k) => <li key={k.id} className="flex justify-between"><span className="text-ink-muted">{k.label}</span><span className="font-mono">{k.price.toFixed(precision)}</span></li>)}
        </ul>
      </div>

      <div className="card p-3">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs font-bold tracking-wider text-gold">{t(locale, "chart", "aiZones")}</span>
          <span className="text-[10px] text-ink-faint">v{analysis.engineVersion} · {analysis.scoringVersion}</span>
        </div>
        <ul className="space-y-1.5">
          {analysis.zones.map((z) => (
            <li key={z.id}>
              <button onClick={() => onSelect(z)} className={`w-full rounded-lg border px-2.5 py-2 text-start text-xs transition ${selected === z.id ? "border-gold bg-[#252117]" : "border-line hover:bg-bg-hover"}`}>
                <div className="flex items-center justify-between"><span>{Q[z.quality]} <b>{z.score}</b>/100</span><span className="chip">{z.status}</span></div>
                <div className="mt-1 text-ink">{locale === "ar" ? z.nameAr : z.name}</div>
                <div className="mt-0.5 font-mono text-[10px] text-ink-muted">{z.bottom.toFixed(precision)} – {z.top.toFixed(precision)}</div>
              </button>
            </li>
          ))}
          {analysis.zones.length === 0 && <li className="text-xs text-ink-muted">{locale === "ar" ? "لا توجد مناطق تتجاوز حد الجودة حاليًا." : "No zone meets the quality threshold right now."}</li>}
        </ul>
        <label className="mt-2 flex items-center gap-2 text-[11px] text-ink-muted"><input type="checkbox" checked={showLowQuality} onChange={toggleLowQuality} className="accent-gold" />{t(locale, "chart", "showLow")} ({analysis.hiddenLowQuality} {t(locale, "chart", "hidden")})</label>
      </div>
    </div>
  );
}
