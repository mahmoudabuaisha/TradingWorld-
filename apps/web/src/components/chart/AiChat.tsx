"use client";
import { useState } from "react";
import { api } from "@/lib/api";
import { useApp } from "@/store/useApp";
import { t } from "@/i18n/dictionary";

const SUGGEST = {
  ar: ["لماذا وضعت هذه المنطقة؟", "ما الذي يبطلها؟", "ماذا يحدث على الفريمات الأعلى؟", "أين السيولة المهمة؟", "لماذا هذه المنطقة أقوى من غيرها؟"],
  en: ["Why this zone?", "What invalidates it?", "What happens on higher timeframes?", "Where is the key liquidity?", "Why is this zone stronger than the others?"],
};

export function AiChat({ zoneId }: { zoneId?: string }) {
  const { locale, symbol, timeframe } = useApp();
  const [msgs, setMsgs] = useState<{ role: "user" | "ai"; text: string; provider?: string }[]>([]);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);

  const ask = async (question: string) => {
    if (!question.trim() || busy) return;
    setMsgs((m) => [...m, { role: "user", text: question }]);
    setQ(""); setBusy(true);
    try {
      const r = await api.chat({ symbol, timeframe, question, locale, zoneId });
      setMsgs((m) => [...m, { role: "ai", text: r.answer, provider: r.provider }]);
    } catch (e) {
      setMsgs((m) => [...m, { role: "ai", text: (e as Error).message }]);
    } finally { setBusy(false); }
  };

  return (
    <div className="card flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-line px-3 py-2 text-xs font-bold tracking-wider text-gold">🤖 {t(locale, "chart", "aiTitle")}<span className="text-[10px] font-normal text-ink-faint">grounded · no predictions</span></div>
      <div className="flex-1 space-y-2 overflow-y-auto p-3 text-sm">
        {msgs.length === 0 && <div className="flex flex-wrap gap-1.5">{SUGGEST[locale].map((s) => <button key={s} className="chip hover:text-ink" onClick={() => ask(s)}>{s}</button>)}</div>}
        {msgs.map((m, i) => <div key={i} className={`whitespace-pre-wrap rounded-lg px-3 py-2 ${m.role === "user" ? "bg-[#252117] text-gold-light" : "bg-bg-panel2 text-ink"}`}>{m.text}{m.provider && <div className="mt-1 text-[10px] text-ink-faint">{m.provider}</div>}</div>)}
        {busy && <div className="text-xs text-ink-muted">…</div>}
      </div>
      <form onSubmit={(e) => { e.preventDefault(); ask(q); }} className="flex gap-2 border-t border-line p-2">
        <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t(locale, "chart", "askAi")} />
        <button className="btn" disabled={busy}>↵</button>
      </form>
    </div>
  );
}
