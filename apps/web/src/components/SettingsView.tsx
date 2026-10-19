"use client";
import { DEFAULT_INSTRUMENTS, TIMEFRAMES, type Timeframe } from "@tradingworld/shared";
import { useApp } from "@/store/useApp";
import { useEffect, useState } from "react";

export function SettingsView() {
  const s = useApp();
  const L = (ar: string, en: string) => (s.locale === "ar" ? ar : en);
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-xl font-bold text-gold-light">⚙️ {L("الإعدادات", "Settings")}</h1>
      <div className="card space-y-3 p-4">
        <div><label className="label">{L("اللغة", "Language")}</label><select className="input" value={s.locale} onChange={(e) => s.setLocale(e.target.value as "ar" | "en")}><option value="ar">العربية</option><option value="en">English</option></select></div>
        <div><label className="label">{L("الأصل الافتراضي", "Default instrument")}</label><select className="input font-mono" value={s.symbol} onChange={(e) => s.setSymbol(e.target.value)}>{DEFAULT_INSTRUMENTS.map((i) => <option key={i.symbol}>{i.symbol}</option>)}</select></div>
        <div><label className="label">{L("الفريم الافتراضي", "Default timeframe")}</label><select className="input font-mono" value={s.timeframe} onChange={(e) => s.setTimeframe(e.target.value as Timeframe)}>{TIMEFRAMES.map((t) => <option key={t}>{t}</option>)}</select></div>
        <div><label className="label">{L("وضع التحليل الافتراضي", "Default analysis mode")}</label><select className="input" value={s.mode} onChange={(e) => s.setMode(e.target.value as "manual" | "ai")}><option value="ai">AI</option><option value="manual">Manual</option></select></div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="accent-gold" checked={s.showLowQuality} onChange={s.toggleLowQuality} />{L("إظهار المناطق منخفضة الجودة افتراضيًا", "Show low-quality zones by default")}</label>
        <div className="text-[11px] text-ink-faint">API: {process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000"} · {L("الثيم: داكن (الفاتح في مرحلة لاحقة)", "Theme: dark (light theme in a later phase)")}</div>
      </div>
    </div>
  );
}

export function ProfileView() {
  const { user, locale, watchlist } = useApp();
  const [m, setM] = useState(false);
  useEffect(() => setM(true), []);
  const L = (ar: string, en: string) => (locale === "ar" ? ar : en);
  if (!m) return null;
  if (!user) return <div className="card p-6 text-center text-ink-muted">{L("سجّل الدخول لعرض ملفك.", "Sign in to view your profile.")}</div>;
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="card flex items-center gap-4 p-6"><div className="grid h-16 w-16 place-items-center rounded-2xl border border-gold text-2xl font-bold text-gold">{user.displayName.slice(0, 2).toUpperCase()}</div><div><div className="text-xl font-bold">{user.displayName}</div><div className="text-sm text-ink-muted">{user.email}</div><span className="chip mt-1">{user.role}</span></div></div>
      <div className="card p-4"><div className="mb-2 text-xs font-bold tracking-wider text-gold">{L("قائمة المتابعة", "WATCHLIST")}</div><div className="flex flex-wrap gap-1.5">{watchlist.map((w) => <span key={w} className="chip font-mono">{w}</span>)}</div></div>
      <div className="card p-4 text-sm text-ink-muted">{L("الإنجازات، نشاط المجتمع، والاشتراك: مراحل لاحقة (انظر PROGRESS.md).", "Achievements, community activity and subscription: later phases (see PROGRESS.md).")}</div>
    </div>
  );
}
