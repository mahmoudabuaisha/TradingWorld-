"use client";
import { PLATFORM_MODULES } from "@tradingworld/shared";
import { useApp } from "@/store/useApp";
import { t } from "@/i18n/dictionary";

export function ComingSoon({ moduleId, route }: { moduleId?: string; route?: string }) {
  const { locale } = useApp();
  const m = PLATFORM_MODULES.find((x) => x.id === moduleId || (route && x.route === route));
  return (
    <div className="card mx-auto max-w-2xl p-8 text-center">
      <div className="text-5xl">{m?.icon ?? "🧩"}</div>
      <h1 className="mt-3 text-2xl font-bold text-gold-light">{m ? (locale === "ar" ? m.nameAr : m.nameEn) : route}</h1>
      <p className="mt-2 text-ink-muted">{t(locale, "common", "comingSoon")} <span className="chip">{m?.phase ?? "P2"}</span></p>
      <p className="mt-4 text-xs text-ink-faint">PROGRESS.md · docs/10-modules-catalog.md</p>
    </div>
  );
}
