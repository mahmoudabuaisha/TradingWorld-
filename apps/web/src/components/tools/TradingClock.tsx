"use client";
import { useEffect, useState } from "react";
import { SESSION_WINDOWS, sessionsAt } from "@tradingworld/shared";
import { useApp } from "@/store/useApp";

const ZONES = [["UTC", "UTC"], ["London", "Europe/London"], ["New York", "America/New_York"], ["Tokyo", "Asia/Tokyo"], ["Riyadh", "Asia/Riyadh"], ["Dubai", "Asia/Dubai"]] as const;

export function TradingClock({ full = false }: { full?: boolean }) {
  const { locale } = useApp();
  const [now, setNow] = useState<Date>();
  useEffect(() => { setNow(new Date()); const id = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(id); }, []);
  if (!now) return <div className="card p-4 text-sm text-ink-muted">…</div>;
  const utcSec = Math.floor(now.getTime() / 1000);
  const active = sessionsAt(utcSec);
  const hour = now.getUTCHours() + now.getUTCMinutes() / 60;
  const next = SESSION_WINDOWS.map((w) => ({ w, inH: ((w.startHourUtc - hour + 24) % 24) })).filter((x) => !active.includes(x.w.name)).sort((a, b) => a.inH - b.inH)[0];
  return (
    <div className="card p-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-[10px] tracking-widest text-gold">{locale === "ar" ? "ساعة التداول" : "TRADING CLOCK"}</div>
          <div className="font-mono text-4xl font-bold">{now.toLocaleTimeString("en-GB", { timeZone: "UTC" })} <span className="text-base text-ink-muted">UTC</span></div>
          <div className="font-mono text-sm text-ink-muted">{locale === "ar" ? "المحلي" : "Local"}: {now.toLocaleTimeString("en-GB")}</div>
        </div>
        <div className="text-end text-sm">
          <div>{locale === "ar" ? "الجلسة الحالية" : "Active"}: {active.map((a) => <span key={a} className={`chip ms-1 ${a === "OFF" ? "" : "text-up"}`}>{a}</span>)}</div>
          {next && <div className="mt-1 text-ink-muted">{locale === "ar" ? "التالية" : "Next"}: {next.w.name} {locale === "ar" ? "بعد" : "in"} {Math.floor(next.inH)}h {Math.round((next.inH % 1) * 60)}m</div>}
        </div>
      </div>
      <div className="mt-4 h-3 w-full overflow-hidden rounded-full bg-bg-panel2 relative">
        {SESSION_WINDOWS.map((w) => <div key={w.name} className={`absolute top-0 h-full ${w.name === "ASIA" ? "bg-info/40" : w.name === "LONDON" ? "bg-gold/40" : "bg-up/40"}`} style={{ left: `${(w.startHourUtc / 24) * 100}%`, width: `${((w.endHourUtc - w.startHourUtc) / 24) * 100}%` }} title={w.label} />)}
        <div className="absolute top-0 h-full w-0.5 bg-ink" style={{ left: `${(hour / 24) * 100}%` }} />
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-ink-faint"><span>00:00</span><span>06:00</span><span>12:00</span><span>18:00</span><span>24:00</span></div>
      {full && (
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {ZONES.map(([name, tz]) => <div key={tz} className="rounded-lg border border-line p-2"><div className="text-[11px] text-ink-muted">{name}</div><div className="font-mono">{now.toLocaleTimeString("en-GB", { timeZone: tz })}</div></div>)}
        </div>
      )}
    </div>
  );
}
