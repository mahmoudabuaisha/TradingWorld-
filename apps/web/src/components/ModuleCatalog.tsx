"use client";
import Link from "next/link";
import { PLATFORM_MODULES, MODULE_GROUP_LABELS, modulesByGroup, type ModuleStatus } from "@tradingworld/shared";
import { useApp } from "@/store/useApp";

const STATUS: Record<ModuleStatus, { ar: string; en: string; cls: string }> = {
  planned: { ar: "مخطط", en: "Planned", cls: "text-ink-faint" },
  scaffold: { ar: "هيكل أولي", en: "Scaffold", cls: "text-info" },
  in_progress: { ar: "قيد التنفيذ", en: "In progress", cls: "text-warn" },
  done: { ar: "منجز", en: "Done", cls: "text-up" },
  approved: { ar: "معتمد", en: "Approved", cls: "text-gold-light" },
};

export function ModuleCatalog() {
  const { locale } = useApp();
  const groups = modulesByGroup();
  return (
    <div className="space-y-5">
      <div><h1 className="text-xl font-bold text-gold-light">🧩 {locale === "ar" ? "وحدات المنصة (60)" : "Platform modules (60)"}</h1><p className="text-sm text-ink-muted">{locale === "ar" ? "كل وحدة مسجلة في registry واحد يغذي التنقل والصلاحيات وملف التقدم." : "Every module lives in one registry that drives navigation, permissions and the progress tracker."} · {PLATFORM_MODULES.length}</p></div>
      {Object.entries(groups).map(([g, mods]) => (
        <section key={g}>
          <h2 className="mb-2 text-xs font-bold tracking-wider text-gold">{MODULE_GROUP_LABELS[g as keyof typeof MODULE_GROUP_LABELS][locale]}</h2>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {mods.map((m) => (
              <Link key={m.id} href={m.route} className="card flex items-center gap-3 p-3 transition hover:border-gold-dim">
                <span className="text-2xl">{m.icon}</span>
                <div className="min-w-0 flex-1"><div className="truncate text-sm">{m.order}. {locale === "ar" ? m.nameAr : m.nameEn}</div><div className="text-[11px] text-ink-faint">{locale === "ar" ? m.nameEn : m.nameAr}</div></div>
                <div className="text-end text-[10px]"><div className={STATUS[m.status].cls}>{STATUS[m.status][locale]}</div><div className="text-ink-faint">{m.phase}</div></div>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
