"use client";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useApp, applyTheme, applyPalette } from "@/store/useApp";
import { DISCLAIMER } from "@tradingworld/shared";
import { Rail } from "./Rail";
import { SheetBar } from "./SheetBar";
import { MobileBar } from "./MobileBar";
import { CommandBar } from "../CommandBar";

/**
 * Kharita shell: a map sheet. The rail of atlases on the start side, the sheet bar across the top,
 * the field in the middle, the disclaimer as the sheet's footer rule.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const { locale, theme, palette } = useApp();
  const pathname = usePathname();
  const [cmdOpen, setCmdOpen] = useState(false);

  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = locale === "ar" ? "rtl" : "ltr";
  }, [locale]);
  useEffect(() => { applyTheme(theme); }, [theme]);
  useEffect(() => { applyPalette(palette); }, [palette]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setCmdOpen((o) => !o); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  useEffect(() => { setCmdOpen(false); }, [pathname]);

  return (
    <div className="flex min-h-screen">
      <a href="#main" className="skip">{locale === "ar" ? "تخطي إلى المحتوى" : "Skip to content"}</a>
      <Rail />
      <div className="flex min-w-0 flex-1 flex-col">
        <SheetBar onSearch={() => setCmdOpen(true)} />
        <main id="main" className="flex-1 px-4 py-4 md:px-6 md:py-5">{children}</main>
        <footer className="hidden border-t border-hair px-6 py-2.5 text-[11px] text-ink-3 md:flex md:items-center md:justify-between md:gap-4">
          <span>{DISCLAIMER[locale]}</span>
          <span className="eyebrow shrink-0">Analysis, not advice</span>
        </footer>
        <MobileBar />
      </div>
      {cmdOpen && <CommandBar onClose={() => setCmdOpen(false)} />}
    </div>
  );
}
