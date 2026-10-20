"use client";
import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ATLASES, atlasForRoute, modulesOfAtlas, type AtlasId } from "@tradingworld/shared";
import { useApp } from "@/store/useApp";
import { t } from "@/i18n/dictionary";
import { Icon, type IconName } from "../Icon";

const ICONS: Record<AtlasId, IconName> = { home: "home", analysis: "analysis", markets: "markets", tools: "tools", lab: "lab", journal: "journal", learn: "learn", community: "community" };

/** Phone navigation: four primary atlases plus "more", which opens the full atlas index as a bottom sheet. */
export function MobileBar() {
  const { locale } = useApp();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const active = atlasForRoute(pathname)?.id;
  const primary = ATLASES.filter((a) => ["home", "analysis", "markets", "journal"].includes(a.id));
  return (
    <>
      <nav className="sticky bottom-0 z-20 grid grid-cols-5 border-t border-hair bg-sheet md:hidden" style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}>
        {primary.map((a) => (
          <Link key={a.id} href={a.route} className={`flex flex-col items-center gap-0.5 py-2 text-[10px] ${active === a.id ? "text-ink" : "text-ink-3"}`}>
            <Icon name={ICONS[a.id]} /><span>{locale === "ar" ? a.nameAr : a.nameEn}</span>
          </Link>
        ))}
        <button onClick={() => setOpen(true)} className="flex flex-col items-center gap-0.5 py-2 text-[10px] text-ink-3"><Icon name="menu" /><span>{t(locale, "shell", "more")}</span></button>
      </nav>
      {open && (
        <div role="presentation" className="fixed inset-0 z-40 bg-black/50 md:hidden" onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }} onKeyDown={(e) => { if (e.key === "Escape") setOpen(false); }}>
          <div role="dialog" aria-modal="true" aria-label="ATLASES" className="absolute inset-x-0 bottom-0 max-h-[80vh] overflow-y-auto rounded-t-lg border-t border-hair bg-sheet p-4">
            <div className="mb-3 flex items-center justify-between"><span className="eyebrow">ATLASES</span><button className="btn-ghost px-2" onClick={() => setOpen(false)} aria-label="close"><Icon name="close" size={16} /></button></div>
            {ATLASES.filter((a) => a.id !== "home").map((a) => (
              <div key={a.id} className="mb-4">
                <div className="mb-1 flex items-center gap-2 text-sm font-semibold"><Icon name={ICONS[a.id]} size={16} />{locale === "ar" ? a.nameAr : a.nameEn}<span className="eyebrow">{a.code}</span></div>
                <div className="grid grid-cols-2 gap-1">
                  {modulesOfAtlas(a.id).map((m) => (
                    <Link key={m.id} href={m.route} onClick={() => setOpen(false)} className="flex items-center gap-2 rounded px-2 py-1.5 text-xs hover:bg-raised"><span className="mono text-ink-3">{String(m.order).padStart(2, "0")}</span><span className="truncate">{locale === "ar" ? m.nameAr : m.nameEn}</span></Link>
                  ))}
                </div>
              </div>
            ))}
            <div className="grid grid-cols-2 gap-1 border-t border-hair pt-3">
              <Link href="/settings" onClick={() => setOpen(false)} className="flex items-center gap-2 rounded px-2 py-1.5 text-xs"><Icon name="settings" size={16} />{t(locale, "nav", "settings")}</Link>
              <Link href="/admin" onClick={() => setOpen(false)} className="flex items-center gap-2 rounded px-2 py-1.5 text-xs"><Icon name="admin" size={16} />{t(locale, "shell", "admin")}</Link>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
