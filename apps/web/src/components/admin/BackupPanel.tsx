"use client";
import type { AdminBackups } from "@/lib/api";

const hoursAgo = (iso: string) => (Date.now() - Date.parse(iso)) / 36e5;
const age = (iso: string) => {
  const h = hoursAgo(iso);
  return h < 1 ? `${Math.max(0, Math.round(h * 60))} MIN AGO` : h < 48 ? `${h.toFixed(1)} H AGO` : `${(h / 24).toFixed(1)} D AGO`;
};
const mb = (n: number) => `${(n / 1024 / 1024).toFixed(1)} MB`;

/** OPS-02 — the backup job as the admin sees it: last backup, last restore drill, and anything to act on. */
export function BackupPanel({ data, L }: { data: AdminBackups; L: (ar: string, en: string) => string }) {
  const { status: s, problems, policy: p } = data;
  const ok = problems.length === 0;
  return (
    <section className="sheet p-4 md:col-span-2" aria-labelledby="backups-h">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span id="backups-h" className="eyebrow">
          BACKUPS · {L("النسخ الاحتياطي", "Backups")}
        </span>
        <span className={`chip ${ok ? "text-up-ink" : "text-stamp"}`}>{ok ? "OK" : L("يحتاج انتباهًا", "NEEDS ATTENTION")}</span>
      </div>

      {problems.length > 0 && (
        <ul className="mt-2 space-y-1 border-s-2 border-s-stamp ps-3 text-xs" role="status">
          {problems.map((x) => (
            <li key={x} className="mono text-stamp">
              {x}
            </li>
          ))}
        </ul>
      )}

      {data.database && (
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <div className="space-y-1 text-xs">
            <div className="eyebrow">{L("آخر نسخة", "Last backup")}</div>
            {s?.lastBackup ? (
              <>
                <div className="mono">
                  {age(s.lastBackup.at)} · {mb(s.lastBackup.bytes)} · {(s.lastBackup.durationMs / 1000).toFixed(1)}S
                </div>
                <div className="flex flex-wrap gap-1">
                  <span className={`chip ${s.lastBackup.encrypted ? "text-up-ink" : "text-stamp"}`}>
                    {s.lastBackup.encrypted ? "ENCRYPTED" : "NOT ENCRYPTED"}
                  </span>
                  <span className={`chip ${s.lastBackup.remote ? "text-up-ink" : "text-stamp"}`}>
                    {s.lastBackup.remote ? "OFFSITE" : "LOCAL ONLY"}
                  </span>
                </div>
                <div dir="ltr" className="mono truncate text-2xs text-ink-3" title={s.lastBackup.file}>
                  {s.lastBackup.file}
                </div>
              </>
            ) : (
              <div className="text-ink-3">{L("لا توجد نسخة بعد.", "None yet.")}</div>
            )}
            {s?.lastFailure && (!s.lastBackup || Date.parse(s.lastFailure.at) > Date.parse(s.lastBackup.at)) && (
              <div className="mono text-2xs text-stamp">
                FAILED {age(s.lastFailure.at)}: {s.lastFailure.error}
              </div>
            )}
          </div>

          <div className="space-y-1 text-xs">
            <div className="eyebrow">{L("آخر اختبار استرجاع", "Last restore drill")}</div>
            {s?.lastDrill ? (
              <>
                <div className="mono">
                  <span className={s.lastDrill.ok ? "text-up-ink" : "text-stamp"}>{s.lastDrill.ok ? "PASSED" : "FAILED"}</span> ·{" "}
                  {age(s.lastDrill.startedAt)} · {s.lastDrill.source.toUpperCase()} COPY
                </div>
                <div className="mono text-2xs text-ink-2">
                  {L("زمن الاسترجاع", "Restore time")} <bdi>{(s.lastDrill.restoreMs / 1000).toFixed(1)}S</bdi> ·{" "}
                  {L("عمر النسخة عند الاختبار", "Backup age when drilled")} <bdi>{s.lastDrill.backupAgeHours}H</bdi>
                </div>
                <ul className="flex flex-wrap gap-1">
                  {s.lastDrill.checks.map((c) => (
                    <li key={c.name} title={c.detail} className={`chip ${c.ok ? "text-up-ink" : "text-stamp"}`}>
                      {c.ok ? "✓" : "✗"} {c.name.toUpperCase()}
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <div className="text-ink-3">{L("لم يُجرَ اختبار بعد.", "No drill has run yet.")}</div>
            )}
          </div>
        </div>
      )}

      <p className="mt-3 border-t border-hair pt-2 text-2xs text-ink-3">
        <span className="mono">
          DAILY {p.at} UTC · DRILL {p.drill.toUpperCase()} · KEEP {p.keep.daily}D/{p.keep.weekly}W/{p.keep.monthly}M ·{" "}
          {p.encrypted ? "AGE" : "NO ENCRYPTION"} · {p.offsite ? `OFFSITE ${p.offsite}` : "NO OFFSITE COPY"}
        </span>
        {" · "}
        {L("التشغيل في حاوية backup مستقلة؛ الدليل في docs/13.", "Runs in its own backup container; runbook in docs/13.")}
      </p>
    </section>
  );
}
