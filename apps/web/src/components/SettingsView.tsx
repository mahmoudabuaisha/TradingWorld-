"use client";
import { DEFAULT_INSTRUMENTS, TIMEFRAMES, type Timeframe } from "@tradingworld/shared";
import { useApp } from "@/store/useApp";
import { useEffect, useState } from "react";
import { NotificationsSettings } from "./NotificationsSettings";

export function SettingsView() {
  const s = useApp();
  const L = (ar: string, en: string) => (s.locale === "ar" ? ar : en);
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div>
        <span className="eyebrow">SHEET 57</span>
        <h1 className="text-2xl font-semibold">{L("الإعدادات", "Settings")}</h1>
      </div>
      <div className="sheet space-y-3 p-4">
        <div>
          <label htmlFor="set-theme" className="label">
            {L("المسح", "Survey")}
          </label>
          <select
            id="set-theme"
            className="input"
            value={s.theme}
            onChange={(e) => s.setTheme(e.target.value as "night" | "day" | "system")}
          >
            <option value="night">{L("ليلي", "Night")}</option>
            <option value="day">{L("نهاري", "Day")}</option>
            <option value="system">{L("حسب النظام", "System")}</option>
          </select>
        </div>
        <div>
          <label htmlFor="set-palette" className="label">
            {L("ألوان الاتجاه", "Directional colours")}
          </label>
          <select
            id="set-palette"
            className="input"
            value={s.palette}
            onChange={(e) => s.setPalette(e.target.value as "kharita" | "classic")}
          >
            <option value="kharita">
              {L("خريطة: زنجار للطلب وكهرمان للعرض (آمن لعمى الألوان)", "Kharita: verdigris demand, amber supply (colourblind-safe)")}
            </option>
            <option value="classic">
              {L("كلاسيكي: أخضر وأحمر (غير آمن لعمى الألوان)", "Classic: green and red (not colourblind-safe)")}
            </option>
          </select>
          <p className="mt-1 text-[11px] text-ink-3">
            {L(
              "في الحالتين يبقى اتجاه التهشير يحدد الطلب والعرض بلا لون.",
              "Either way the hatch direction still encodes demand and supply without colour.",
            )}
          </p>
        </div>
        <div>
          <label htmlFor="set-locale" className="label">
            {L("اللغة", "Language")}
          </label>
          <select id="set-locale" className="input" value={s.locale} onChange={(e) => s.setLocale(e.target.value as "ar" | "en")}>
            <option value="ar">العربية</option>
            <option value="en">English</option>
          </select>
        </div>
        <div>
          <label htmlFor="set-symbol" className="label">
            {L("الأصل الافتراضي", "Default instrument")}
          </label>
          <select id="set-symbol" className="input font-mono" value={s.symbol} onChange={(e) => s.setSymbol(e.target.value)}>
            {DEFAULT_INSTRUMENTS.map((i) => (
              <option key={i.symbol}>{i.symbol}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="set-tf" className="label">
            {L("الفريم الافتراضي", "Default timeframe")}
          </label>
          <select id="set-tf" className="input font-mono" value={s.timeframe} onChange={(e) => s.setTimeframe(e.target.value as Timeframe)}>
            {TIMEFRAMES.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="set-mode" className="label">
            {L("وضع التحليل الافتراضي", "Default analysis mode")}
          </label>
          <select id="set-mode" className="input" value={s.mode} onChange={(e) => s.setMode(e.target.value as "manual" | "ai")}>
            <option value="ai">AI</option>
            <option value="manual">Manual</option>
          </select>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input id="set-low" type="checkbox" className="accent-ink" checked={s.showLowQuality} onChange={s.toggleLowQuality} />
          {L("إظهار المناطق منخفضة الجودة افتراضيًا", "Show low-quality zones by default")}
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input id="set-inv" type="checkbox" className="accent-ink" checked={s.showInvalidated} onChange={s.toggleInvalidated} />
          {L("إظهار المناطق المبطلة حديثًا على الشارت", "Show recently invalidated zones on the chart")}
        </label>
        <div className="mono text-[11px] text-ink-3">API {process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000"}</div>
      </div>
      <div id="notifications">
        <NotificationsSettings />
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
  if (!user) return <div className="sheet p-6 text-center text-ink-2">{L("سجّل الدخول لعرض ملفك.", "Sign in to view your profile.")}</div>;
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="sheet flex items-center gap-4 p-6">
        <div className="grid h-16 w-16 place-items-center border border-ink text-2xl font-semibold">
          {user.displayName.slice(0, 2).toUpperCase()}
        </div>
        <div>
          <div className="text-xl font-bold">{user.displayName}</div>
          <div className="text-sm text-ink-2">{user.email}</div>
          <span className="chip mt-1">{user.role}</span>
        </div>
      </div>
      <div className="sheet p-4">
        <div className="mb-2 eyebrow">{L("قائمة المتابعة", "WATCHLIST")}</div>
        <div className="flex flex-wrap gap-1.5">
          {watchlist.map((w) => (
            <span key={w} className="chip font-mono">
              {w}
            </span>
          ))}
        </div>
      </div>
      <div className="sheet p-4 text-sm text-ink-2">
        {L(
          "الإنجازات، نشاط المجتمع، والاشتراك: مراحل لاحقة (انظر PROGRESS.md).",
          "Achievements, community activity and subscription: later phases (see PROGRESS.md).",
        )}
      </div>
    </div>
  );
}
