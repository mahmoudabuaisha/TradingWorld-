"use client";
import { useEffect, useState } from "react";
import { SESSION_WINDOWS, sessionsAt, type SessionName } from "@tradingworld/shared";

export interface ClockState {
  now: Date;
  utc: string;         // HH:MM:SS
  local: string;
  sessions: SessionName[];
  overlap: boolean;
  next?: { name: SessionName; minutes: number };
  dateKey: string;     // YYYY-MM-DD (UTC)
}

function pad(n: number) { return String(n).padStart(2, "0"); }

export function computeClock(now: Date): ClockState {
  const sec = Math.floor(now.getTime() / 1000);
  const sessions = sessionsAt(sec);
  const hour = now.getUTCHours() + now.getUTCMinutes() / 60;
  const upcoming = SESSION_WINDOWS
    .filter((w) => !sessions.includes(w.name))
    .map((w) => ({ name: w.name, minutes: Math.round((((w.startHourUtc - hour) % 24 + 24) % 24) * 60) }))
    .sort((a, b) => a.minutes - b.minutes)[0];
  return {
    now,
    utc: `${pad(now.getUTCHours())}:${pad(now.getUTCMinutes())}:${pad(now.getUTCSeconds())}`,
    local: `${pad(now.getHours())}:${pad(now.getMinutes())}`,
    sessions,
    overlap: sessions.includes("LONDON") && sessions.includes("NEW_YORK"),
    next: upcoming,
    dateKey: now.toISOString().slice(0, 10),
  };
}

/** Live UTC clock + session state. Returns undefined until mounted (avoids hydration mismatch). */
export function useClock(intervalMs = 1000): ClockState | undefined {
  const [state, setState] = useState<ClockState>();
  useEffect(() => {
    const tick = () => setState(computeClock(new Date()));
    tick();
    const id = setInterval(tick, intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return state;
}

export function sessionLabel(name: SessionName): string {
  return name === "NEW_YORK" ? "NEW YORK" : name;
}

export function fmtMinutes(min: number): string {
  return `${pad(Math.floor(min / 60))}:${pad(min % 60)}`;
}
