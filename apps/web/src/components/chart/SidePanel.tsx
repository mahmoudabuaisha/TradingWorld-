"use client";
import type { AnalysisResult, Zone } from "@tradingworld/analysis-engine";
import { describeRegime, biasLabel } from "@tradingworld/analysis-engine";
import { useApp } from "@/store/useApp";
import { t } from "@/i18n/dictionary";

/** The legend column of the map sheet: context rows, HTF bias, key levels, the zone index. */
export function SidePanel({ analysis, precision, selected, onSelect, provider }: { analysis?: AnalysisResult; precision: number; selected?: string; onSelect: (z: Zone) => void; provider?: { id: string; live: boolean; message?: string } }) {
  const { locale, showLowQuality, toggleLowQuality } = useApp();
  if (!analysis) return <div className="sheet p-4 text-sm text-ink-3">{t(locale, "common", "loading")}</div>;
  const r = analysis.base.regime;
  const lastSweep = analysis.base.sweeps.filter((s) => s.reclaimed).slice(-1)[0];
  const lastEvent = analysis.base.structure.events.slice(-1)[0];
  const rows: [string, string][] = [
    [t(locale, "chart", "marketRegime"), describeRegime(r)[locale]],
    [t(locale, "chart", "htfBias"), biasLabel(analysis.htfBias)[locale]],
    [t(locale, "chart", "structure"), biasLabel(analysis.base.bias)[locale] + (lastEvent ? ` · ${lastEvent.kind}` : "")],
    [t(locale, "chart", "liquidity"), lastSweep ? (locale === "ar" ? `سحب ${lastSweep.side === "sell-side" ? "سيولة البيع" : "سيولة الشراء"} عند ${lastSweep.level.toFixed(precision)}` : `${lastSweep.side} sweep at ${lastSweep.level.toFixed(precision)}`) : "—"],
    [t(locale, "chart", "session"), `${analysis.session.current}${analysis.session.overlap ? " · LDN/NY" : ""}`],
  ];
  return (
    <div className="flex h-full min-h-0 flex-col overflow-y-auto border-s border-hair">
      <div className="border-b border-hair px-3 py-2.5">
        <div className="flex items-center justify-between"><span className="eyebrow">CONTEXT</span><span className={`chip ${provider?.live ? "text-up" : "text-down"}`} title={provider?.message}>{provider?.id ?? "?"} · {provider?.live ? "LIVE" : "STALE"}</span></div>
        <dl className="mt-2 space-y-1 text-xs">
          {rows.map(([k, v]) => <div key={k} className="flex justify-between gap-2 border-b border-dashed border-hair pb-1"><dt className="text-ink-3">{k}</dt><dd className="text-end">{v}</dd></div>)}
        </dl>
      </div>
      <div className="border-b border-hair px-3 py-2.5">
        <div className="flex items-center justify-between"><span className="eyebrow">ZONES</span><span className="mono text-2xs text-ink-3">v{analysis.engineVersion} · {analysis.scoringVersion}</span></div>
        <ul className="mt-2 space-y-1.5">
          {analysis.zones.map((z) => (
            <li key={z.id}>
              <button onClick={() => onSelect(z)} className={`grid w-full grid-cols-[12px_1fr_auto] items-start gap-2 rounded border px-2 py-1.5 text-start text-xs transition ${selected === z.id ? "border-ink bg-raised" : "border-hair hover:bg-raised"}`}>
                <span className={`sw mt-0.5 h-8 ${z.direction === "bullish" ? "hatch-up" : "hatch-down"}`} />
                <span className="min-w-0"><span className="block leading-snug">{locale === "ar" ? z.nameAr : z.name}</span><span className="mono block text-2xs text-ink-3">{z.status}{z.tests ? ` · TESTED x${z.tests}` : ""} · {z.bottom.toFixed(precision)} – {z.top.toFixed(precision)}</span></span>
                <span className="mono text-sm font-semibold">{z.score}</span>
              </button>
            </li>
          ))}
          {analysis.zones.length === 0 && <li className="text-xs text-ink-3">{locale === "ar" ? "لم يجد المحرك منطقة تتجاوز حد الجودة." : "The engine found no zone above the quality threshold."}</li>}
        </ul>
        <label className="mt-2 flex items-center gap-2 text-[11px] text-ink-3"><input type="checkbox" id="show-low-quality" checked={showLowQuality} onChange={toggleLowQuality} className="accent-ink" />{t(locale, "chart", "showLow")} · {analysis.hiddenLowQuality}</label>
      </div>
      <div className="border-b border-hair px-3 py-2.5">
        <span className="eyebrow">HTF BIAS</span>
        <div className="mt-2 flex flex-wrap gap-1">
          {analysis.htf.map((h) => <span key={h.timeframe} className={`chip ${h.bias === "bullish" ? "text-up" : h.bias === "bearish" ? "text-down" : ""}`}>{h.timeframe} {h.bias === "bullish" ? "▲" : h.bias === "bearish" ? "▼" : "≈"}</span>)}
        </div>
      </div>
      <div className="border-b border-hair px-3 py-2.5">
        <span className="eyebrow">KEY LEVELS</span>
        <ul className="mt-2 space-y-1 text-xs">
          {analysis.keyLevels.slice(0, 6).map((k) => <li key={k.id} className="flex justify-between gap-2"><span className="truncate text-ink-2">{k.label}</span><span className="mono">{k.price.toFixed(precision)}</span></li>)}
        </ul>
      </div>
    </div>
  );
}
