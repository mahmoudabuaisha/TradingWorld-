"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ATLASES, atlasForRoute, modulesOfAtlas, type AtlasId, type ModuleStatus } from "@tradingworld/shared";
import { useApp } from "@/store/useApp";
import { t } from "@/i18n/dictionary";
import { Icon, type IconName } from "../Icon";

const ICONS: Record<AtlasId, IconName> = { home: "home", analysis: "analysis", markets: "markets", tools: "tools", lab: "lab", journal: "journal", learn: "learn", community: "community" };

export const STATUS_LABEL: Record<ModuleStatus, { ar: string; en: string }> = {
  planned: { ar: "مخطط", en: "Planned" }, scaffold: { ar: "هيكل", en: "Scaffold" }, in_progress: { ar: "قيد العمل", en: "In progress" }, done: { ar: "منجز", en: "Done" }, approved: { ar: "معتمد", en: "Approved" },
};

/** The rail: eight atlases, each opening an index of its sheets. Active atlas is printed in ink. */
export function Rail() {
  const { locale, user } = useApp();
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState<AtlasId | null>(null);
  const [mounted, setMounted] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const active = atlasForRoute(pathname)?.id ?? (pathname.startsWith("/admin") || pathname.startsWith("/settings") || pathname.startsWith("/profile") ? null : "home");

  useEffect(() => { setMounted(true); }, []);
  useEffect(() => { setOpen(null); }, [pathname]);
  useEffect(() => {
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(null); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(null); };
    document.addEventListener("mousedown", onDoc); document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDoc); document.removeEventListener("keydown", onKey); };
  }, []);

  const openAtlas = open ? ATLASES.find((a) => a.id === open) : undefined;

  return (
    <div ref={ref} className="relative hidden md:block">
      <aside className="sticky top-0 flex h-screen w-[var(--rail-w)] flex-col border-e border-hair bg-sheet">
        <Link href="/" className="grid h-[var(--bar-h)] place-items-center border-b border-hair" title="TradingWorld">
          <span className="grid h-8 w-8 place-items-center border border-ink text-base font-bold leading-none">خ</span>
        </Link>
        <nav className="flex flex-1 flex-col gap-0.5 p-1.5">
          {ATLASES.map((a) => {
            const isActive = active === a.id;
            return (
              <button
                key={a.id}
                type="button"
                onClick={() => (a.id === "home" ? router.push("/") : setOpen((o) => (o === a.id ? null : a.id)))}
                onDoubleClick={() => router.push(a.route)}
                className={`flex flex-col items-center gap-1 rounded py-2 text-[10px] leading-none transition ${isActive ? "bg-ink text-field" : open === a.id ? "bg-raised text-ink" : "text-ink-2 hover:bg-raised hover:text-ink"}`}
                aria-expanded={open === a.id}
                title={locale === "ar" ? a.nameAr : a.nameEn}
              >
                <Icon name={ICONS[a.id]} />
                <span>{locale === "ar" ? a.nameAr : a.nameEn}</span>
              </button>
            );
          })}
        </nav>
        <div className="flex flex-col gap-0.5 border-t border-hair p-1.5">
          {mounted && user?.role === "admin" && (
            <Link href="/admin" className={`flex flex-col items-center gap-1 rounded py-2 text-[10px] leading-none ${pathname.startsWith("/admin") ? "bg-ink text-field" : "text-ink-2 hover:bg-raised hover:text-ink"}`} title={t(locale, "shell", "admin")}><Icon name="admin" /><span>{t(locale, "shell", "admin")}</span></Link>
          )}
          <Link href="/settings" className={`flex flex-col items-center gap-1 rounded py-2 text-[10px] leading-none ${pathname.startsWith("/settings") ? "bg-ink text-field" : "text-ink-2 hover:bg-raised hover:text-ink"}`} title={t(locale, "nav", "settings")}><Icon name="settings" /><span>{t(locale, "nav", "settings")}</span></Link>
        </div>
      </aside>

      {openAtlas && (
        <div className="absolute inset-y-0 start-full z-30 w-80 border-e border-hair bg-sheet shadow-sheet">
          <div className="flex items-start justify-between border-b border-hair px-4 py-3">
            <div>
              <span className="eyebrow">{openAtlas.code}</span>
              <div className="text-base font-semibold">{locale === "ar" ? openAtlas.nameAr : openAtlas.nameEn}</div>
            </div>
            <button className="btn-ghost px-2" onClick={() => setOpen(null)} aria-label="close"><Icon name="close" size={16} /></button>
          </div>
          <ul className="max-h-[calc(100vh-8rem)] overflow-y-auto p-2">
            {modulesOfAtlas(openAtlas.id).map((m) => (
              <li key={m.id}>
                <Link href={m.route} className="grid grid-cols-[32px_1fr_auto] items-center gap-2 rounded px-2 py-2 text-sm hover:bg-raised">
                  <span className="mono text-xs text-ink-3">{String(m.order).padStart(2, "0")}</span>
                  <span className="truncate">{locale === "ar" ? m.nameAr : m.nameEn}</span>
                  <span className={`chip ${m.status === "planned" ? "opacity-60" : ""}`}>{m.status === "planned" ? m.phase : STATUS_LABEL[m.status][locale]}</span>
                </Link>
              </li>
            ))}
          </ul>
          <div className="border-t border-hair px-4 py-2 text-[11px] text-ink-3">{t(locale, "shell", "sheets")} · {modulesOfAtlas(openAtlas.id).length}</div>
        </div>
      )}
    </div>
  );
}
