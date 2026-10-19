"use client";
import { useEffect, useState } from "react";
import { api, type AdminOverview } from "@/lib/api";
import { useApp } from "@/store/useApp";

/** SHEET 58 — the admin panel: system health, feeds, engine, module status and the research sheet. */
export function AdminView() {
  const { token, user, locale } = useApp();
  const [o, setO] = useState<AdminOverview>();
  const [factors, setFactors] = useState<Awaited<ReturnType<typeof api.adminFactors>>>();
  const [err, setErr] = useState<string>();
  useEffect(() => { if (token) { api.adminOverview(token).then(setO).catch((e) => setErr(e.message)); api.adminFactors(token).then(setFactors).catch(() => {}); } }, [token]);
  const L = (ar: string, en: string) => (locale === "ar" ? ar : en);
  if (!token || user?.role !== "admin") return <div className="sheet mx-auto mt-6 max-w-lg p-6 text-center text-ink-2">{L("هذه الورقة للمشرفين فقط.", "Admins only.")}</div>;
  if (err) return <div className="sheet mx-auto mt-6 max-w-lg p-6 text-stamp">{err}</div>;
  if (!o) return <div className="sheet p-6 text-ink-3">…</div>;
  const counts = o.modules.reduce<Record<string, number>>((a, m) => ((a[m.status] = (a[m.status] ?? 0) + 1), a), {});
  const weights = Object.entries(o.engine.weights).sort((a, b) => b[1] - a[1]);
  return (
    <div className="space-y-5">
      <div><span className="eyebrow">ADMIN · 58 · SYSTEM SHEET</span><h1 className="text-2xl font-semibold">{L("لوحة الإدارة", "Admin Panel")}</h1></div>
      <div className="tblock sheet">
        <div><b>USERS</b><span>{o.users}</span></div>
        <div><b>ZONES LOGGED</b><span>{o.zonesLogged}</span></div>
        <div><b>ENGINE</b><span>{o.engine.version} · {o.engine.scoring}</span></div>
        <div><b>AI</b><span>{o.ai.toUpperCase()}</span></div>
        <div><b>ANALYSIS CACHE</b><span>{(o as AdminOverview & { analysisCache?: { cached: number } }).analysisCache?.cached ?? "—"}</span></div>
        <div><b>UPTIME</b><span>{Math.round(o.uptime / 60)} MIN</span></div>
        <div><b>RSS</b><span>{Math.round(o.memory / 1e6)} MB</span></div>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <section className="sheet p-4">
          <span className="eyebrow">DATA FEEDS</span>
          <ul className="mt-2 divide-y divide-hair text-sm">{o.providers.map((p) => <li key={p.id} className="flex items-center justify-between gap-3 py-1.5"><span className="mono">{p.id.toUpperCase()}</span><span className={`chip ${p.live ? "text-up-ink" : "text-stamp"}`}>{p.live ? "LIVE" : "OFFLINE"}</span></li>)}</ul>
          {o.providers.some((p) => p.message) && <p className="mt-2 text-xs text-ink-3">{o.providers.map((p) => p.message).filter(Boolean).join(" · ")}</p>}
        </section>
        <section className="sheet p-4">
          <span className="eyebrow">SHEETS · {o.modules.length}</span>
          <div className="mt-2 flex flex-wrap gap-1.5">{Object.entries(counts).map(([s, n]) => <span key={s} className="chip">{s.replace("_", " ")} · {n}</span>)}</div>
          <p className="mt-2 text-xs text-ink-3">{L("المصدر: سجل الوحدات المشترك. التعديل من PROGRESS.md وسجل الوحدات.", "Source: the shared module registry. Edit from PROGRESS.md and the registry.")}</p>
        </section>
        <section className="sheet p-4">
          <span className="eyebrow">SCORING WEIGHTS · {o.engine.scoring}</span>
          <ul className="mt-2 space-y-1 text-xs">{weights.map(([k, v]) => <li key={k} className="grid grid-cols-[150px_1fr_36px] items-center gap-2"><span className="mono text-ink-2">{k}</span><span className="h-2 bg-raised"><span className="block h-2 hatch-up" style={{ width: `${(v / 18) * 100}%` }} /></span><span className="mono text-end">{v}</span></li>)}</ul>
        </section>
        <section className="sheet p-4">
          <span className="eyebrow">RESEARCH · FACTOR FREQUENCY · SAMPLE {factors?.sample ?? 0}</span>
          <ul className="mt-2 space-y-1 text-xs">{factors && Object.entries(factors.factors).map(([k, s]) => <li key={k} className="grid grid-cols-[150px_1fr_90px] items-center gap-2"><span className="mono text-ink-2">{k}</span><span className="h-2 bg-raised"><span className="block h-2 hatch-up" style={{ width: `${s.total ? (s.present / s.total) * 100 : 0}%` }} /></span><span className="mono text-end">{s.total ? Math.round((s.present / s.total) * 100) : 0}% · {Math.round(s.avgScoreWhenPresent)}</span></li>)}</ul>
          {factors && <div className="mt-2 flex flex-wrap gap-1.5">{Object.entries(factors.byStatus).map(([s, n]) => <span key={s} className="chip">{s} · {n}</span>)}</div>}
          <p className="mt-2 text-xs text-ink-3">{L("نسبة حضور كل عامل في المناطق المسجلة ومتوسط الدرجة عند حضوره. الخطوة الأولى في ورقة الأبحاث.", "How often each factor is present in logged zones and the mean score when present. First step of the research sheet.")}</p>
        </section>
      </div>
    </div>
  );
}
