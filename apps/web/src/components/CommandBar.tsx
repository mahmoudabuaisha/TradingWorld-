"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { PLATFORM_MODULES, DEFAULT_INSTRUMENTS, atlasOf } from "@tradingworld/shared";
import { useApp } from "@/store/useApp";
import { t } from "@/i18n/dictionary";
import { Icon } from "./Icon";

/** Global search (⌘K): sheets and instruments, printed as an index. */
export function CommandBar({ onClose }: { onClose: () => void }) {
  const [q, setQ] = useState("");
  const router = useRouter();
  const { locale, setSymbol } = useApp();
  const results = useMemo(() => {
    const s = q.trim().toLowerCase();
    const mods = PLATFORM_MODULES.filter((m) => !s || m.nameAr.includes(s) || m.nameEn.toLowerCase().includes(s) || m.id.includes(s)).slice(0, 9);
    const inst = DEFAULT_INSTRUMENTS.filter((i) => s && (i.symbol.toLowerCase().includes(s) || i.name.toLowerCase().includes(s) || i.nameAr.includes(s))).slice(0, 5);
    return { mods, inst };
  }, [q]);
  return (
    <div role="presentation" className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 p-4 pt-20" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }} onKeyDown={(e) => { if (e.key === "Escape") onClose(); }}>
      <div role="dialog" aria-modal="true" aria-label={t(locale, "shell", "search")} className="sheet w-full max-w-xl shadow-sheet">
        <div className="flex items-center gap-2 border-b border-hair px-4"><Icon name="search" size={16} className="text-ink-3" />
          {/* a dialog opened by the user moves focus into itself (WAI-ARIA dialog pattern) */}
          {/* eslint-disable-next-line jsx-a11y/no-autofocus */}
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={t(locale, "shell", "search")} className="w-full bg-transparent py-3 text-sm outline-none" />
          <span className="kbd">ESC</span></div>
        <div className="max-h-80 overflow-y-auto p-2">
          {results.inst.map((i) => (
            <button key={i.symbol} onClick={() => { setSymbol(i.symbol); router.push("/chart"); onClose(); }} className="grid w-full grid-cols-[88px_1fr_auto] items-center gap-3 rounded px-3 py-2 text-start text-sm hover:bg-raised">
              <span className="mono font-semibold">{i.symbol}</span><span className="truncate text-ink-2">{locale === "ar" ? i.nameAr : i.name}</span><span className="chip">{i.assetClass}</span>
            </button>
          ))}
          {results.mods.map((m) => (
            <button key={m.id} onClick={() => { router.push(m.route); onClose(); }} className="grid w-full grid-cols-[88px_1fr_auto] items-center gap-3 rounded px-3 py-2 text-start text-sm hover:bg-raised">
              <span className="mono text-xs text-ink-3">{atlasOf(m.group)?.code ?? "SHEET"} · {String(m.order).padStart(2, "0")}</span><span className="truncate">{locale === "ar" ? m.nameAr : m.nameEn}</span><span className="chip">{m.phase}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
