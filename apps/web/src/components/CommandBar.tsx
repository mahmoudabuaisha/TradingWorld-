"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { PLATFORM_MODULES, DEFAULT_INSTRUMENTS } from "@tradingworld/shared";
import { useApp } from "@/store/useApp";

/** Global search (⌘K): modules + instruments. */
export function CommandBar({ onClose }: { onClose: () => void }) {
  const [q, setQ] = useState("");
  const router = useRouter();
  const { locale, setSymbol } = useApp();
  const results = useMemo(() => {
    const s = q.trim().toLowerCase();
    const mods = PLATFORM_MODULES.filter((m) => !s || m.nameAr.includes(s) || m.nameEn.toLowerCase().includes(s) || m.id.includes(s)).slice(0, 8);
    const inst = DEFAULT_INSTRUMENTS.filter((i) => s && (i.symbol.toLowerCase().includes(s) || i.name.toLowerCase().includes(s) || i.nameAr.includes(s))).slice(0, 5);
    return { mods, inst };
  }, [q]);
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 p-4 pt-24" onClick={onClose}>
      <div className="card w-full max-w-xl shadow-glow" onClick={(e) => e.stopPropagation()}>
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={locale === "ar" ? "ابحث عن وحدة أو أصل…" : "Search a module or instrument…"} className="w-full border-b border-line bg-transparent px-4 py-3 outline-none" />
        <div className="max-h-80 overflow-y-auto p-2">
          {results.inst.map((i) => (
            <button key={i.symbol} onClick={() => { setSymbol(i.symbol); router.push("/chart"); onClose(); }} className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm hover:bg-bg-hover">
              <span className="font-mono text-gold-light">{i.symbol}</span><span className="text-ink-muted">{locale === "ar" ? i.nameAr : i.name}</span>
            </button>
          ))}
          {results.mods.map((m) => (
            <button key={m.id} onClick={() => { router.push(m.route); onClose(); }} className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm hover:bg-bg-hover">
              <span>{m.icon} {locale === "ar" ? m.nameAr : m.nameEn}</span><span className="chip">{m.phase} · {m.status}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
