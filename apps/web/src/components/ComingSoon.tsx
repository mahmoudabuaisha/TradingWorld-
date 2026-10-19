"use client";
import { PLATFORM_MODULES, atlasOf } from "@tradingworld/shared";
import { useApp } from "@/store/useApp";
import { t } from "@/i18n/dictionary";

export function ComingSoon({ moduleId, route }: { moduleId?: string; route?: string }) {
  const { locale } = useApp();
  const m = PLATFORM_MODULES.find((x) => x.id === moduleId || (route && x.route === route));
  const atlas = m ? atlasOf(m.group) : undefined;
  return (
    <div className="sheet mx-auto mt-6 max-w-2xl p-8">
      <span className="eyebrow">{atlas?.code ?? "SHEET"} · {m ? String(m.order).padStart(2, "0") : "—"} · {m?.phase ?? "P2"}</span>
      <h1 className="mt-2 text-2xl font-semibold">{m ? (locale === "ar" ? m.nameAr : m.nameEn) : route}</h1>
      <p className="mt-2 text-ink-2">{t(locale, "common", "comingSoon")} <span className="chip">{m?.phase ?? "P2"}</span></p>
      <div className="mt-6 h-px w-full bg-hair" />
      <p className="mt-3 text-xs text-ink-3">PROGRESS.md · docs/10-modules-catalog.md</p>
    </div>
  );
}
