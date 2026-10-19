"use client";
import { useState } from "react";
import type { Zone } from "@tradingworld/analysis-engine";
import { useApp } from "@/store/useApp";
import { t, type Dict } from "@/i18n/dictionary";
import { api } from "@/lib/api";
import { Icon } from "../Icon";
import { ConfluenceStack } from "../marks/ConfluenceStack";

/** Survey callout: pinned to the zone by the overlay's leader line. Reasons, the confluence stack, weaknesses, invalidation. */
export function ZoneDetails({ zone, precision, onClose }: { zone: Zone; precision: number; onClose: () => void }) {
  const { locale, token, symbol } = useApp();
  const [alertState, setAlertState] = useState<"idle" | "ok" | "err">("idle");
  const L = (k: keyof Dict["chart"]) => t(locale, "chart", k);
  const dir = zone.direction === "bullish" ? "DEMAND" : "SUPPLY";
  const dead = zone.status === "INVALIDATED";
  return (
    <div className="sheet flex max-h-[56vh] flex-col overflow-hidden shadow-sheet">
      <div className="flex items-start justify-between gap-3 border-b border-hair px-4 py-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2"><span className="eyebrow">{dir} · {zone.timeframe} · {zone.origin}</span>{dead && <span className="stamp">INVALIDATED</span>}</div>
          <div className={`font-semibold leading-snug ${dead ? "text-ink-2" : ""}`}>{locale === "ar" ? zone.nameAr : zone.name}</div>
          <div className="mono text-xs text-ink-3">{zone.score} / 100 · {zone.status}{zone.tests ? ` · TESTED x${zone.tests}` : ""} · {zone.bottom.toFixed(precision)} – {zone.top.toFixed(precision)}</div>
        </div>
        <button onClick={onClose} className="btn-ghost px-2" aria-label="close"><Icon name="close" size={16} /></button>
      </div>
      <div className="space-y-3 overflow-y-auto px-4 py-3 text-sm">
        {dead && <p className="text-stamp">{locale === "ar" ? "أُبطلت هذه المنطقة بإغلاق شمعة خلف حدها البعيد. تبقى معروضة للتعلم منها ولا تدخل في العدّ." : "This zone was invalidated by a candle close beyond its far edge. It stays visible to learn from and is not counted."}</p>}
        <p className="text-ink-2">{zone.explanation.summary[locale]}</p>
        <div>
          <span className="eyebrow">{L("why")}</span>
          <ol className="mt-1 list-decimal space-y-1 ps-5">{zone.explanation.reasons.map((r, i) => <li key={i}>{r[locale]}</li>)}</ol>
        </div>
        <div>
          <span className="eyebrow">CONFLUENCE STACK</span>
          <div className="mt-2"><ConfluenceStack factors={zone.factors} score={zone.score} direction={zone.direction} locale={locale} scale={1.8} minH={20} offH={14} /></div>
        </div>
        {zone.explanation.weaknesses.length > 0 && <div><span className="eyebrow">{L("weakens")}</span><ul className="mt-1 list-disc space-y-1 ps-5 text-ink-2">{zone.explanation.weaknesses.map((w, i) => <li key={i}>{w[locale]}</li>)}</ul></div>}
        <div><span className="eyebrow text-stamp">{L("invalidation")}</span><p className="text-stamp">{zone.explanation.invalidation[locale]}</p></div>
        <div className="mono text-2xs text-ink-3">HTF {zone.htfContext.join(" · ")}</div>
        {!dead && (
          <div className="flex flex-wrap items-center gap-2">
            <button disabled={!token || alertState === "ok"} className="btn" onClick={async () => { try { await api.createAlert(token!, { symbol, kind: "zone_enter", zoneId: zone.id, note: zone.name }); setAlertState("ok"); } catch { setAlertState("err"); } }}>
              <Icon name="bell" size={15} />{L("setAlert")} {alertState === "ok" ? "✓" : alertState === "err" ? "!" : ""}
            </button>
            {!token && <span className="text-[11px] text-ink-3">{locale === "ar" ? "سجّل الدخول لإنشاء تنبيه" : "Sign in to create alerts"}</span>}
          </div>
        )}
      </div>
    </div>
  );
}
