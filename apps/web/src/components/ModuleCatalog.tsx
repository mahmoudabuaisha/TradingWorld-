"use client";
import Link from "next/link";
import { ATLASES, PLATFORM_MODULES, modulesOfAtlas, type ModuleStatus } from "@tradingworld/shared";
import { useApp } from "@/store/useApp";
import { STATUS_LABEL } from "./shell/Rail";

const STATUS_CLS: Record<ModuleStatus, string> = {
  planned: "text-ink-3",
  scaffold: "text-ink-2",
  in_progress: "text-down-ink",
  done: "text-up-ink",
  approved: "text-ink",
};

/** The index of all sixty sheets, bound into atlases. Numbers are the specification's own numbering. */
export function ModuleCatalog() {
  const { locale } = useApp();
  return (
    <div className="space-y-6">
      <div>
        <span className="eyebrow">INDEX · {PLATFORM_MODULES.length} SHEETS</span>
        <h1 className="text-2xl font-semibold">{locale === "ar" ? "فهرس الأوراق" : "Sheet index"}</h1>
        <p className="max-w-[68ch] text-sm text-ink-2">
          {locale === "ar"
            ? "كل وحدة ورقة مرقمة بترقيم المواصفة، مجلدة في أطلس. السجل الواحد يغذي التنقل والصلاحيات وملف التقدم."
            : "Every module is a numbered sheet, bound into an atlas. One registry drives navigation, permissions and the progress tracker."}
        </p>
      </div>
      {ATLASES.filter((a) => a.id !== "home").map((a) => (
        <section key={a.id}>
          <div className="mb-2 flex items-baseline gap-3 border-b border-hair pb-1">
            <span className="eyebrow">{a.code}</span>
            <h2 className="text-base font-semibold">{locale === "ar" ? a.nameAr : a.nameEn}</h2>
          </div>
          <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {modulesOfAtlas(a.id).map((m) => (
              <Link
                key={m.id}
                href={m.route}
                className="grid grid-cols-[36px_1fr_auto] items-center gap-2 rounded border border-hair bg-sheet px-3 py-2 transition hover:border-rule"
              >
                <span className="mono text-sm text-ink-3">{String(m.order).padStart(2, "0")}</span>
                <div className="min-w-0">
                  <div className="truncate text-sm">{locale === "ar" ? m.nameAr : m.nameEn}</div>
                  <div className="truncate text-[11px] text-ink-3">{locale === "ar" ? m.nameEn : m.nameAr}</div>
                </div>
                <div className="text-end text-[10px]">
                  <div className={STATUS_CLS[m.status]}>{STATUS_LABEL[m.status][locale]}</div>
                  <div className="mono text-ink-3">{m.phase}</div>
                </div>
              </Link>
            ))}
          </div>
        </section>
      ))}
      <section>
        <div className="mb-2 flex items-baseline gap-3 border-b border-hair pb-1">
          <span className="eyebrow">ACCOUNT · ADMIN</span>
          <h2 className="text-base font-semibold">{locale === "ar" ? "الحساب والإدارة" : "Account & admin"}</h2>
        </div>
        <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {PLATFORM_MODULES.filter((m) => ["core", "account", "admin"].includes(m.group)).map((m) => (
            <Link
              key={m.id}
              href={m.route}
              className="grid grid-cols-[36px_1fr_auto] items-center gap-2 rounded border border-hair bg-sheet px-3 py-2 transition hover:border-rule"
            >
              <span className="mono text-sm text-ink-3">{String(m.order).padStart(2, "0")}</span>
              <div className="min-w-0">
                <div className="truncate text-sm">{locale === "ar" ? m.nameAr : m.nameEn}</div>
                <div className="truncate text-[11px] text-ink-3">{locale === "ar" ? m.nameEn : m.nameAr}</div>
              </div>
              <div className="text-end text-[10px]">
                <div className={STATUS_CLS[m.status]}>{STATUS_LABEL[m.status][locale]}</div>
                <div className="mono text-ink-3">{m.phase}</div>
              </div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
