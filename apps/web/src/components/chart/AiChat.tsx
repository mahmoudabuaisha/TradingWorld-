"use client";
import { useState } from "react";
import { api } from "@/lib/api";
import { useApp } from "@/store/useApp";
import { t } from "@/i18n/dictionary";

const SUGGEST = {
  ar: ["لماذا وضعت هذه المنطقة؟", "ما الذي يبطلها؟", "ماذا يحدث على الفريمات الأعلى؟", "أين السيولة المهمة؟", "لماذا هذه المنطقة أقوى من غيرها؟"],
  en: ["Why this zone?", "What invalidates it?", "What happens on higher timeframes?", "Where is the key liquidity?", "Why is this zone stronger than the others?"],
};

/** Grounded assistant: answers only from the engine's structured output. */
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
    <div className="flex h-full min-h-0 flex-col border-s border-t border-hair">
      <div className="flex items-center justify-between border-b border-hair px-3 py-2"><span className="eyebrow">ASSISTANT · GROUNDED</span><span className="mono text-2xs text-ink-3">no predictions</span></div>
      <div className="flex-1 space-y-2 overflow-y-auto px-3 py-2 text-sm">
        {msgs.length === 0 && <div className="flex flex-wrap gap-1.5">{SUGGEST[locale].map((s) => <button key={s} className="rounded border border-hair px-2 py-1 text-xs text-ink-2 hover:border-rule hover:text-ink" onClick={() => ask(s)}>{s}</button>)}</div>}
        {msgs.map((m, i) => <div key={i} className={`whitespace-pre-wrap rounded px-3 py-2 ${m.role === "user" ? "bg-ink text-field" : "bg-raised"}`}>{m.text}{m.provider && <div className="mono mt-1 text-2xs opacity-60">{m.provider}</div>}</div>)}
        {busy && <div className="mono text-xs text-ink-3">…</div>}
      </div>
      <form onSubmit={(e) => { e.preventDefault(); ask(q); }} className="flex gap-2 border-t border-hair p-2">
        <input id="ai-question" className="input py-1.5" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t(locale, "chart", "askAi")} />
        <button className="btn py-1.5" disabled={busy}>↵</button>
      </form>
    </div>
  );
}
