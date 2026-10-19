"use client";
import { useEffect, useState } from "react";
import { SESSION_WINDOWS, sessionsAt } from "@tradingworld/shared";
import { useApp } from "@/store/useApp";
import { SessionDial } from "../marks/SessionDial";
import { sessionLabel } from "@/hooks/useClock";

const ZONES = [["UTC", "UTC"], ["London", "Europe/London"], ["New York", "America/New_York"], ["Tokyo", "Asia/Tokyo"], ["Riyadh", "Asia/Riyadh"], ["Dubai", "Asia/Dubai"]] as const;

export function TradingClock({ full = false }: { full?: boolean }) {
  const { locale } = useApp();
  const [now, setNow] = useState<Date>();
  useEffect(() => { setNow(new Date()); const id = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(id); }, []);
  if (!now) return <div className="sheet p-4 text-sm text-ink-2">…</div>;
  const utcSec = Math.floor(now.getTime() / 1000);
  const active = sessionsAt(utcSec);
  const hour = now.getUTCHours() + now.getUTCMinutes() / 60;
  const next = SESSION_WINDOWS.map((w) => ({ w, inH: ((w.startHourUtc - hour + 24) % 24) })).filter((x) => !active.includes(x.w.name)).sort((a, b) => a.inH - b.inH)[0];
  return (
    <div className="sheet p-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <span className="eyebrow">ATLAS 03 · 12 · TRADING CLOCK</span>
          <div className="font-mono text-4xl font-bold">{now.toLocaleTimeString("en-GB", { timeZone: "UTC" })} <span className="text-base text-ink-2">UTC</span></div>
          <div className="font-mono text-sm text-ink-2">{locale === "ar" ? "المحلي" : "Local"}: {now.toLocaleTimeString("en-GB")}</div>
        </div>
        <div className="text-end text-sm">
          <div>{locale === "ar" ? "الجلسة الحالية" : "Active"}: {active.map((a) => <span key={a} className={`chip ms-1 ${a === "OFF" ? "" : "text-up"}`}>{a}</span>)}</div>
          {next && <div className="mt-1 text-ink-2">{locale === "ar" ? "التالية" : "Next"}: {sessionLabel(next.w.name)} {locale === "ar" ? "بعد" : "in"} {Math.floor(next.inH)}h {Math.round((next.inH % 1) * 60)}m</div>}
        </div>
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-center gap-6">
        <SessionDial size={180} />
        <ul className="mono space-y-1 text-xs text-ink-2">
          {SESSION_WINDOWS.map((w) => <li key={w.name} className="flex items-center gap-2"><span className={`inline-block h-2 w-2 rounded-full ${w.name === "ASIA" ? "bg-ink-3" : "bg-ink-2"}`} />{w.name} {String(w.startHourUtc).padStart(2, "0")}:00–{String(w.endHourUtc).padStart(2, "0")}:00 UTC</li>)}
          <li className="flex items-center gap-2"><span className="inline-block h-2 w-2 rounded-full bg-up" />LDN/NY OVERLAP 12:00–16:00 UTC</li>
        </ul>
      </div>
      {full && (
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {ZONES.map(([name, tz]) => <div key={tz} className="rounded border border-hair p-2"><div className="text-[11px] text-ink-2">{name}</div><div className="font-mono">{now.toLocaleTimeString("en-GB", { timeZone: tz })}</div></div>)}
        </div>
      )}
    </div>
  );
}
