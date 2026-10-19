"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useApp } from "@/store/useApp";
import { t } from "@/i18n/dictionary";
import { DISCLAIMER } from "@tradingworld/shared";
import { CommandBar } from "./CommandBar";

const NAV: { key: "dashboard" | "chart" | "markets" | "alerts" | "tools" | "journal" | "academy" | "community" | "modules" | "settings"; href: string; icon: string }[] = [
  { key: "dashboard", href: "/", icon: "🏠" },
  { key: "chart", href: "/chart", icon: "📊" },
  { key: "markets", href: "/markets", icon: "📈" },
  { key: "alerts", href: "/alerts", icon: "🔔" },
  { key: "tools", href: "/tools/risk", icon: "🧮" },
  { key: "journal", href: "/journal", icon: "📒" },
  { key: "academy", href: "/academy", icon: "🎓" },
  { key: "community", href: "/community", icon: "💬" },
  { key: "modules", href: "/modules", icon: "🧩" },
  { key: "settings", href: "/settings", icon: "⚙️" },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const { locale, setLocale, user, setAuth } = useApp();
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [cmdOpen, setCmdOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);
  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = locale === "ar" ? "rtl" : "ltr";
  }, [locale]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setCmdOpen((o) => !o); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href.split("/").slice(0, 2).join("/")));

  return (
    <div className="flex min-h-screen">
      <aside className={`sticky top-0 hidden h-screen shrink-0 flex-col border-e border-line bg-[#101115] transition-all md:flex ${collapsed ? "w-16" : "w-64"}`}>
        <div className="flex items-center gap-3 border-b border-line px-4 py-4">
          <div className="grid h-10 w-10 place-items-center rounded-xl border border-gold text-lg font-bold text-gold">TW</div>
          {!collapsed && <div><div className="text-sm font-bold tracking-wider">TRADINGWORLD</div><div className="text-[10px] tracking-widest text-ink-muted">{t(locale, "tagline")}</div></div>}
        </div>
        <nav className="flex-1 space-y-0.5 overflow-y-auto p-2">
          {NAV.map((n) => (
            <Link key={n.key} href={n.href} className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition ${isActive(n.href) ? "bg-[#252117] text-gold-light" : "text-[#c8c8cd] hover:bg-bg-hover"}`} title={t(locale, "nav", n.key)}>
              <span className="text-base">{n.icon}</span>
              {!collapsed && <span>{t(locale, "nav", n.key)}</span>}
            </Link>
          ))}
          {mounted && user?.role === "admin" && (
            <Link href="/admin" className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm ${isActive("/admin") ? "bg-[#252117] text-gold-light" : "text-[#c8c8cd] hover:bg-bg-hover"}`}>
              <span>🛡️</span>{!collapsed && <span>{t(locale, "nav", "admin")}</span>}
            </Link>
          )}
        </nav>
        <button onClick={() => setCollapsed((c) => !c)} className="border-t border-line p-3 text-xs text-ink-muted hover:text-ink">{collapsed ? "»" : "«"}</button>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-line bg-bg/90 px-4 py-2.5 backdrop-blur">
          <button onClick={() => setCmdOpen(true)} className="input flex max-w-md items-center justify-between text-ink-muted"><span>{t(locale, "common", "search")}</span><span className="kbd">⌘K</span></button>
          <div className="flex items-center gap-2">
            <button className="btn-ghost" onClick={() => setLocale(locale === "ar" ? "en" : "ar")}>{locale === "ar" ? "EN" : "عربي"}</button>
            {mounted && user ? (
              <>
                <Link href="/profile" className="chip">{user.displayName}</Link>
                <button className="btn-ghost" onClick={() => setAuth(undefined, undefined)}>{t(locale, "nav", "logout")}</button>
              </>
            ) : (
              <Link href="/login" className="btn">{t(locale, "nav", "login")}</Link>
            )}
          </div>
        </header>
        <main className="flex-1 p-4 md:p-6">{children}</main>
        <footer className="border-t border-line px-4 py-3 text-[11px] text-ink-faint">{DISCLAIMER[locale]}</footer>
        <nav className="sticky bottom-0 flex justify-around border-t border-line bg-[#101115] py-1.5 md:hidden">
          {NAV.slice(0, 5).map((n) => <Link key={n.key} href={n.href} className="text-lg">{n.icon}</Link>)}
        </nav>
      </div>
      {cmdOpen && <CommandBar onClose={() => setCmdOpen(false)} />}
    </div>
  );
}
