"use client";
import { useState } from "react";
import type { Zone } from "@tradingworld/analysis-engine";
import { useApp } from "@/store/useApp";
import { t, type Dict } from "@/i18n/dictionary";
import { api } from "@/lib/api";
import { Icon } from "../Icon";

/** Survey callout: the zone's reasons, confluence, weaknesses and invalidation. Leader line to the zone arrives in Phase C. */
export function ZoneDetails({ zone, precision, onClose }: { zone: Zone; precision: number; onClose: () => void }) {
  const { locale, token, symbol } = useApp();
  const [alertState, setAlertState] = useState<"idle" | "ok" | "err">("idle");
  const L = (k: keyof Dict["chart"]) => t(locale, "chart", k);
  const dir = zone.direction === "bullish" ? "DEMAND" : "SUPPLY";
  return (
    <div className="sheet flex max-h-[62vh] flex-col overflow-hidden shadow-sheet">
      <div className="flex items-start justify-between gap-3 border-b border-hair px-4 py-3">
        <div className="min-w-0">
          <span className="eyebrow">{dir} · {zone.timeframe} · {zone.origin}</span>
          <div className="font-semibold leading-snug">{locale === "ar" ? zone.nameAr : zone.name}</div>
          <div className="mono text-xs text-ink-3">{zone.score} / 100 · {zone.status}{zone.tests ? ` · TESTED x${zone.tests}` : ""} · {zone.bottom.toFixed(precision)} – {zone.top.toFixed(precision)}</div>
        </div>
        <button onClick={onClose} className="btn-ghost px-2" aria-label="close"><Icon name="close" size={16} /></button>
      </div>
      <div className="space-y-3 overflow-y-auto px-4 py-3 text-sm">
        <p className="text-ink-2">{zone.explanation.summary[locale]}</p>
        <div>
          <span className="eyebrow">{L("why")}</span>
          <ol className="mt-1 list-decimal space-y-1 ps-5">{zone.explanation.reasons.map((r, i) => <li key={i}>{r[locale]}</li>)}</ol>
        </div>
        <div>
          <span className="eyebrow">CONFLUENCE · {zone.score} / 100</span>
          <ul className="mt-1 grid grid-cols-1 gap-1 text-xs sm:grid-cols-2">
            {zone.factors.map((f) => (
              <li key={f.key} className={`flex items-center justify-between gap-2 rounded border px-2 py-1 ${f.present ? (zone.direction === "bullish" ? "border-up/50 bg-up-wash" : "border-down/50 bg-down-wash") : "border-dashed border-hair text-ink-3"}`}>
                <span className="truncate">{f.label[locale]}</span><span className="mono">{f.present ? `+${f.contribution}` : `· ${f.weight}`}</span>
              </li>
            ))}
          </ul>
        </div>
        {zone.explanation.weaknesses.length > 0 && <div><span className="eyebrow">{L("weakens")}</span><ul className="mt-1 list-disc space-y-1 ps-5 text-ink-2">{zone.explanation.weaknesses.map((w, i) => <li key={i}>{w[locale]}</li>)}</ul></div>}
        <div><span className="eyebrow text-stamp">{L("invalidation")}</span><p className="text-stamp">{zone.explanation.invalidation[locale]}</p></div>
        <div className="mono text-2xs text-ink-3">HTF {zone.htfContext.join(" · ")}</div>
        <div className="flex flex-wrap items-center gap-2">
          <button disabled={!token || alertState === "ok"} className="btn" onClick={async () => { try { await api.createAlert(token!, { symbol, kind: "zone_enter", zoneId: zone.id, note: zone.name }); setAlertState("ok"); } catch { setAlertState("err"); } }}>
            <Icon name="bell" size={15} />{L("setAlert")} {alertState === "ok" ? "✓" : alertState === "err" ? "!" : ""}
          </button>
          {!token && <span className="text-[11px] text-ink-3">{locale === "ar" ? "سجّل الدخول لإنشاء تنبيه" : "Sign in to create alerts"}</span>}
        </div>
      </div>
    </div>
  );
}
