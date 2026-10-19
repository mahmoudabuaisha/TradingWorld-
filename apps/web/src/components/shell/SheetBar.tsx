"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { PLATFORM_MODULES, atlasForRoute } from "@tradingworld/shared";
import { useApp, type Theme } from "@/store/useApp";
import { useClock, fmtMinutes, sessionLabel } from "@/hooks/useClock";
import { t } from "@/i18n/dictionary";
import { Icon } from "../Icon";

function currentSheet(pathname: string) {
  const clean = pathname.split("#")[0] ?? pathname;
  if (clean === "/") return PLATFORM_MODULES.find((m) => m.id === "dashboard");
  const base = (r: string) => r.split("#")[0] ?? r;
  return PLATFORM_MODULES
    .filter((m) => m.route !== "/" && clean.startsWith(base(m.route)))
    .sort((a, b) => base(b.route).length - base(a.route).length || Number(a.route.includes("#")) - Number(b.route.includes("#")))[0];
}

/** The sheet bar: where you are (atlas · sheet), the search field, the survey clock, night/day, language, the user. */
export function SheetBar({ onSearch }: { onSearch: () => void }) {
  const { locale, setLocale, theme, setTheme, user, setAuth } = useApp();
  const pathname = usePathname();
  const clock = useClock();
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  const atlas = atlasForRoute(pathname);
  const sheet = currentSheet(pathname);
  const nextTheme: Theme = theme === "night" ? "day" : "night";

  return (
    <header className="sticky top-0 z-20 grid h-[var(--bar-h)] grid-cols-[1fr_auto] items-center gap-3 border-b border-hair bg-field/90 px-4 backdrop-blur md:grid-cols-[minmax(0,1fr)_minmax(200px,380px)_auto] md:px-6">
      <div className="min-w-0">
        <span className="eyebrow">{atlas?.code ?? "SHEET"}{sheet ? ` · ${String(sheet.order).padStart(2, "0")}` : ""}</span>
        <div className="truncate text-sm font-semibold leading-tight">{sheet ? (locale === "ar" ? sheet.nameAr : sheet.nameEn) : "TradingWorld"}</div>
      </div>
      <button onClick={onSearch} className="input hidden items-center justify-between py-1.5 text-ink-3 md:flex">
        <span className="flex items-center gap-2"><Icon name="search" size={15} />{t(locale, "shell", "search")}</span>
        <span className="kbd">⌘K</span>
      </button>
      <div className="flex items-center gap-1.5">
        {clock && (
          <div className="hidden items-center gap-2 lg:flex" title={`${t(locale, "shell", "session")}`}>
            <span className="mono text-sm">{clock.utc}<span className="text-ink-3"> UTC</span></span>
            <span className={`chip ${clock.sessions[0] !== "OFF" ? "text-up" : ""}`}>{clock.overlap ? "LDN/NY" : sessionLabel(clock.sessions[0])}</span>
            {clock.next && <span className="mono text-2xs text-ink-3">{sessionLabel(clock.next.name)} {fmtMinutes(clock.next.minutes)}</span>}
          </div>
        )}
        <button className="btn-ghost px-2 md:hidden" onClick={onSearch} aria-label="search"><Icon name="search" size={16} /></button>
        <button className="btn-ghost px-2" onClick={() => setTheme(nextTheme)} title={t(locale, "shell", nextTheme === "day" ? "day" : "night")} aria-label="theme">
          <Icon name={mounted && theme === "day" ? "moon" : "sun"} size={16} />
        </button>
        <button className="btn-ghost px-2 text-xs" onClick={() => setLocale(locale === "ar" ? "en" : "ar")}>{locale === "ar" ? "EN" : "ع"}</button>
        {mounted && user ? (
          <>
            <Link href="/profile" className="btn-ghost hidden px-2 sm:inline-flex" title={t(locale, "shell", "profile")}><Icon name="user" size={16} /><span className="max-w-[9rem] truncate text-xs">{user.displayName}</span></Link>
            <button className="btn-ghost px-2" onClick={() => setAuth(undefined, undefined)} title={t(locale, "shell", "signout")} aria-label="sign out"><Icon name="logout" size={16} /></button>
          </>
        ) : (
          <Link href="/login" className="btn py-1 text-xs">{t(locale, "shell", "signin")}</Link>
        )}
      </div>
    </header>
  );
}
