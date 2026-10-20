"use client";
import type { AnalysisResult, Zone } from "@tradingworld/analysis-engine";
import { describeRegime, biasLabel } from "@tradingworld/analysis-engine";
import { useApp } from "@/store/useApp";
import { t } from "@/i18n/dictionary";
import { BiasCompass } from "../marks/BiasCompass";

function ZoneItem({
  z,
  precision,
  locale,
  selected,
  onSelect,
}: {
  z: Zone;
  precision: number;
  locale: "ar" | "en";
  selected?: string;
  onSelect: (z: Zone) => void;
}) {
  const dead = z.status === "INVALIDATED";
  return (
    <li>
      <button
        onClick={() => onSelect(z)}
        className={`grid w-full grid-cols-[12px_1fr_auto] items-start gap-2 rounded border px-2 py-1.5 text-start text-xs transition ${selected === z.id ? "border-ink bg-raised" : "border-hair hover:bg-raised"} ${dead ? "opacity-70" : ""}`}
      >
        <span className={`sw mt-0.5 h-8 ${z.direction === "bullish" ? "hatch-up" : "hatch-down"} ${dead ? "opacity-40" : ""}`} />
        <span className="min-w-0">
          <span className={`block leading-snug ${dead ? "line-through decoration-stamp/70" : ""}`}>
            {locale === "ar" ? z.nameAr : z.name}
          </span>
          <span className="mono block text-2xs text-ink-3">
            {z.status}
            {z.tests ? ` · TESTED x${z.tests}` : ""} · {z.bottom.toFixed(precision)} – {z.top.toFixed(precision)}
          </span>
        </span>
        {dead ? <span className="stamp !px-1.5 !py-0 text-[9px]">INV</span> : <span className="mono text-sm font-semibold">{z.score}</span>}
      </button>
    </li>
  );
}

/** The legend column of the map sheet: context rows, the bias compass, the zone index, key levels. */
export function SidePanel({
  analysis,
  precision,
  selected,
  onSelect,
  provider,
}: {
  analysis?: AnalysisResult;
  precision: number;
  selected?: string;
  onSelect: (z: Zone) => void;
  provider?: { id: string; live: boolean; message?: string };
}) {
  const { locale, showLowQuality, toggleLowQuality, showInvalidated, toggleInvalidated } = useApp();
  if (!analysis) return <div className="sheet p-4 text-sm text-ink-3">{t(locale, "common", "loading")}</div>;
  const r = analysis.base.regime;
  const lastSweep = analysis.base.sweeps.filter((s) => s.reclaimed).slice(-1)[0];
  const lastEvent = analysis.base.structure.events.slice(-1)[0];
  const live = analysis.zones.filter((z) => z.status !== "INVALIDATED");
  const dead = analysis.zones.filter((z) => z.status === "INVALIDATED");
  const rows: [string, string][] = [
    [t(locale, "chart", "marketRegime"), describeRegime(r)[locale]],
    [t(locale, "chart", "structure"), biasLabel(analysis.base.bias)[locale] + (lastEvent ? ` · ${lastEvent.kind}` : "")],
    [
      t(locale, "chart", "liquidity"),
      lastSweep
        ? locale === "ar"
          ? `سحب ${lastSweep.side === "sell-side" ? "سيولة البيع" : "سيولة الشراء"} عند ${lastSweep.level.toFixed(precision)}`
          : `${lastSweep.side} sweep at ${lastSweep.level.toFixed(precision)}`
        : "—",
    ],
    [t(locale, "chart", "session"), `${analysis.session.current}${analysis.session.overlap ? " · LDN/NY" : ""}`],
  ];
  return (
    <div className="flex h-full min-h-0 flex-col overflow-y-auto border-s border-hair">
      <div className="border-b border-hair px-3 py-2.5">
        <div className="flex items-center justify-between">
          <span className="eyebrow">CONTEXT</span>
          <span className={`chip ${provider?.live ? "text-up-ink" : "text-down-ink"}`} title={provider?.message}>
            {provider?.id ?? "?"} · {provider?.live ? "LIVE" : "STALE"}
          </span>
        </div>
        <dl className="mt-2 space-y-1 text-xs">
          {rows.map(([k, v]) => (
            <div key={k} className="flex justify-between gap-2 border-b border-dashed border-hair pb-1">
              <dt className="text-ink-3">{k}</dt>
              <dd className="text-end">{v}</dd>
            </div>
          ))}
        </dl>
      </div>
      <div className="border-b border-hair px-3 py-2.5">
        <div className="flex items-center justify-between">
          <span className="eyebrow">BIAS COMPASS</span>
          <span
            className={`chip ${analysis.htfBias === "bullish" ? "text-up-ink" : analysis.htfBias === "bearish" ? "text-down-ink" : ""}`}
          >
            {t(locale, "chart", "dominant")} · {biasLabel(analysis.htfBias)[locale]}
          </span>
        </div>
        <div className="mt-2">
          <BiasCompass frames={analysis.htf.map((h) => ({ timeframe: h.timeframe, bias: h.bias }))} size={50} />
        </div>
      </div>
      <div className="border-b border-hair px-3 py-2.5">
        <div className="flex items-center justify-between">
          <span className="eyebrow">ZONES</span>
          <span className="mono text-2xs text-ink-3">
            v{analysis.engineVersion} · {analysis.scoringVersion}
          </span>
        </div>
        <ul className="mt-2 space-y-1.5">
          {live.map((z) => (
            <ZoneItem key={z.id} z={z} precision={precision} locale={locale} selected={selected} onSelect={onSelect} />
          ))}
          {live.length === 0 && (
            <li className="text-xs text-ink-3">
              {locale === "ar" ? "لم يجد المحرك منطقة تتجاوز حد الجودة." : "The engine found no zone above the quality threshold."}
            </li>
          )}
        </ul>
        {dead.length > 0 && (
          <>
            <div className="mt-3 flex items-center justify-between">
              <span className="eyebrow text-stamp">{t(locale, "chart", "recentlyInvalidated")}</span>
              <span className="mono text-2xs text-ink-3">{dead.length}</span>
            </div>
            <ul className="mt-1.5 space-y-1.5">
              {dead.map((z) => (
                <ZoneItem key={z.id} z={z} precision={precision} locale={locale} selected={selected} onSelect={onSelect} />
              ))}
            </ul>
          </>
        )}
        <div className="mt-2 space-y-1 text-[11px] text-ink-3">
          <label className="flex items-center gap-2">
            <input type="checkbox" id="show-low-quality" checked={showLowQuality} onChange={toggleLowQuality} className="accent-ink" />
            {t(locale, "chart", "showLow")} · {analysis.hiddenLowQuality}
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" id="show-invalidated" checked={showInvalidated} onChange={toggleInvalidated} className="accent-ink" />
            {t(locale, "chart", "showInvalidated")}
          </label>
        </div>
      </div>
      <div className="px-3 py-2.5">
        <span className="eyebrow">KEY LEVELS</span>
        <ul className="mt-2 space-y-1 text-xs">
          {analysis.keyLevels.slice(0, 6).map((k) => (
            <li key={k.id} className="flex justify-between gap-2">
              <span className="truncate text-ink-2">{k.label}</span>
              <span className="mono">{k.price.toFixed(precision)}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
