"use client";
import type { Zone } from "@tradingworld/analysis-engine";
import { useApp } from "@/store/useApp";
import { t, type Dict } from "@/i18n/dictionary";
import { api } from "@/lib/api";
import { useState } from "react";

export function ZoneDetails({ zone, precision, onClose }: { zone: Zone; precision: number; onClose: () => void }) {
  const { locale, token, symbol } = useApp();
  const [alertState, setAlertState] = useState<"idle" | "ok" | "err">("idle");
  const L = (k: keyof Dict["chart"]) => t(locale, "chart", k);
  return (
    <div className="card flex max-h-[70vh] flex-col overflow-hidden shadow-glow">
      <div className="flex items-start justify-between border-b border-line p-3">
        <div>
          <div className="text-[10px] tracking-widest text-gold">AI ANALYSIS · {zone.timeframe} · {zone.origin}</div>
          <div className="font-bold text-ink">{locale === "ar" ? zone.nameAr : zone.name}</div>
          <div className="font-mono text-xs text-ink-muted">{zone.bottom.toFixed(precision)} – {zone.top.toFixed(precision)} · {L("strength")} <b className="text-gold-light">{zone.score}/100</b> · {L("status")} <span className="chip">{zone.status}</span></div>
        </div>
        <button onClick={onClose} className="btn-ghost">✕</button>
      </div>
      <div className="space-y-3 overflow-y-auto p-3 text-sm">
        <p className="text-ink-muted">{zone.explanation.summary[locale]}</p>
        <div>
          <div className="mb-1 text-xs font-bold text-gold">{L("why")}</div>
          <ol className="list-decimal space-y-1 ps-5">{zone.explanation.reasons.map((r, i) => <li key={i}>{r[locale]}</li>)}</ol>
        </div>
        <div>
          <div className="mb-1 text-xs font-bold text-gold">Confluence</div>
          <ul className="grid grid-cols-1 gap-1 text-xs sm:grid-cols-2">
            {zone.factors.map((f) => <li key={f.key} className={`flex justify-between rounded border px-2 py-1 ${f.present ? "border-up/40 text-ink" : "border-line text-ink-faint line-through"}`}><span>{f.label[locale]}</span><span className="font-mono">+{f.present ? f.contribution : 0}/{f.weight}</span></li>)}
          </ul>
        </div>
        {zone.explanation.weaknesses.length > 0 && <div><div className="mb-1 text-xs font-bold text-warn">{L("weakens")}</div><ul className="list-disc space-y-1 ps-5 text-ink-muted">{zone.explanation.weaknesses.map((w, i) => <li key={i}>{w[locale]}</li>)}</ul></div>}
        <div><div className="mb-1 text-xs font-bold text-down">{L("invalidation")}</div><p>{zone.explanation.invalidation[locale]}</p></div>
        <div className="text-[11px] text-ink-faint">HTF: {zone.htfContext.join(" · ")} · tests: {zone.tests}</div>
        <div className="flex gap-2">
          <button disabled={!token || alertState === "ok"} className="btn" onClick={async () => { try { await api.createAlert(token!, { symbol, kind: "zone_enter", zoneId: zone.id, note: zone.name }); setAlertState("ok"); } catch { setAlertState("err"); } }}>
            🔔 {L("setAlert")} {alertState === "ok" ? "✓" : alertState === "err" ? "!" : ""}
          </button>
          {!token && <span className="self-center text-[11px] text-ink-faint">{locale === "ar" ? "سجّل الدخول لإنشاء تنبيه" : "Sign in to create alerts"}</span>}
        </div>
      </div>
    </div>
  );
}
