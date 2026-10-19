"use client";
import { useEffect, useState } from "react";
import { api, type AdminOverview } from "@/lib/api";
import { useApp } from "@/store/useApp";

export function AdminView() {
  const { token, user, locale } = useApp();
  const [o, setO] = useState<AdminOverview>();
  const [factors, setFactors] = useState<Awaited<ReturnType<typeof api.adminFactors>>>();
  const [err, setErr] = useState<string>();
  useEffect(() => { if (token) { api.adminOverview(token).then(setO).catch((e) => setErr(e.message)); api.adminFactors(token).then(setFactors).catch(() => {}); } }, [token]);
  const L = (ar: string, en: string) => (locale === "ar" ? ar : en);
  if (!token || user?.role !== "admin") return <div className="card p-6 text-center text-ink-muted">{L("هذه الصفحة للمشرفين فقط.", "Admins only.")}</div>;
  if (err) return <div className="card p-6 text-down">{err}</div>;
  if (!o) return <div className="card p-6 text-ink-muted">…</div>;
  const counts = o.modules.reduce<Record<string, number>>((a, m) => ((a[m.status] = (a[m.status] ?? 0) + 1), a), {});
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-gold-light">🛡️ {L("لوحة الإدارة", "Admin Panel")}</h1>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[[L("المستخدمون", "Users"), o.users], [L("المناطق المسجلة", "Zones logged"), o.zonesLogged], ["Engine", `${o.engine.version} · ${o.engine.scoring}`], ["AI", o.ai], ["Uptime", `${Math.round(o.uptime / 60)} min`], ["RSS", `${Math.round(o.memory / 1e6)} MB`]].map(([k, v]) => <div key={String(k)} className="card p-3"><div className="text-[11px] text-ink-muted">{k}</div><div className="font-mono text-lg">{v}</div></div>)}
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="card p-3"><div className="mb-2 text-xs font-bold tracking-wider text-gold">Data feeds</div>{o.providers.map((p) => <div key={p.id} className="flex justify-between text-sm"><span>{p.id}</span><span className={p.live ? "text-up" : "text-warn"}>{p.live ? "LIVE" : "OFFLINE"} {p.message ? `· ${p.message}` : ""}</span></div>)}</div>
        <div className="card p-3"><div className="mb-2 text-xs font-bold tracking-wider text-gold">Modules</div><div className="flex flex-wrap gap-1.5">{Object.entries(counts).map(([s, n]) => <span key={s} className="chip">{s}: {n}</span>)}</div></div>
        <div className="card p-3"><div className="mb-2 text-xs font-bold tracking-wider text-gold">Scoring weights ({o.engine.scoring})</div><ul className="grid grid-cols-2 gap-1 text-xs">{Object.entries(o.engine.weights).map(([k, v]) => <li key={k} className="flex justify-between"><span className="text-ink-muted">{k}</span><span className="font-mono">{v}</span></li>)}</ul></div>
        <div className="card p-3"><div className="mb-2 text-xs font-bold tracking-wider text-gold">AI Research · factor frequency (sample {factors?.sample ?? 0})</div>
          <ul className="space-y-1 text-xs">{factors && Object.entries(factors.factors).map(([k, s]) => <li key={k} className="flex items-center gap-2"><span className="w-40 text-ink-muted">{k}</span><div className="h-2 flex-1 rounded bg-bg-panel2"><div className="h-2 rounded bg-gold" style={{ width: `${s.total ? (s.present / s.total) * 100 : 0}%` }} /></div><span className="w-24 text-end font-mono">{s.total ? Math.round((s.present / s.total) * 100) : 0}% · {Math.round(s.avgScoreWhenPresent)}</span></li>)}</ul>
          {factors && <div className="mt-2 flex flex-wrap gap-1.5">{Object.entries(factors.byStatus).map(([s, n]) => <span key={s} className="chip">{s}: {n}</span>)}</div>}
        </div>
      </div>
    </div>
  );
}
