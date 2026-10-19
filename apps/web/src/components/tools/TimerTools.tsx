"use client";
import { useEffect, useRef, useState } from "react";
import { useApp } from "@/store/useApp";

function fmt(ms: number) { const s = Math.max(0, Math.floor(ms / 1000)); return `${String(Math.floor(s / 3600)).padStart(2, "0")}:${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`; }

export function Timer() {
  const { locale } = useApp();
  const PRESETS = [["Study 25m", 25], ["Backtest 45m", 45], ["Session 90m", 90]] as const;
  const [total, setTotal] = useState(25 * 60_000);
  const [left, setLeft] = useState(total);
  const [running, setRunning] = useState(false);
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setLeft((l) => { if (l <= 1000) { setRunning(false); try { new AudioContext().resume(); } catch { /* ignore */ } return 0; } return l - 1000; }), 1000);
    return () => clearInterval(id);
  }, [running]);
  return (
    <div className="sheet p-6 text-center">
      <span className="eyebrow">ATLAS 03 · 52 · TIMER</span>
      <div className="my-3 font-mono text-6xl font-bold">{fmt(left)}</div>
      <div className="flex justify-center gap-2">
        <button className="btn" onClick={() => setRunning((r) => !r)}>{running ? "⏸" : "▶"}</button>
        <button className="btn-ghost" onClick={() => { setRunning(false); setLeft(total); }}>↺</button>
      </div>
      <div className="mt-4 flex flex-wrap justify-center gap-1.5">{PRESETS.map(([n, m]) => <button key={n} className="chip hover:text-ink" onClick={() => { setTotal(m * 60_000); setLeft(m * 60_000); setRunning(false); }}>{n}</button>)}</div>
      <input id="timer-minutes" aria-label="minutes" type="number" className="input mt-3 mx-auto w-32 text-center font-mono" value={Math.round(total / 60_000)} onChange={(e) => { const m = Number(e.target.value) * 60_000; setTotal(m); setLeft(m); }} />
    </div>
  );
}

export function Stopwatch() {
  const { locale } = useApp();
  const [elapsed, setElapsed] = useState(0);
  const [running, setRunning] = useState(false);
  const [laps, setLaps] = useState<number[]>([]);
  const start = useRef(0);
  useEffect(() => {
    if (!running) return;
    start.current = Date.now() - elapsed;
    const id = setInterval(() => setElapsed(Date.now() - start.current), 100);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running]);
  return (
    <div className="sheet p-6 text-center">
      <span className="eyebrow">ATLAS 03 · 53 · STOPWATCH</span>
      <div className="my-3 font-mono text-6xl font-bold">{fmt(elapsed)}<span className="text-2xl text-ink-2">.{String(Math.floor((elapsed % 1000) / 100))}</span></div>
      <div className="flex justify-center gap-2">
        <button className="btn" onClick={() => setRunning((r) => !r)}>{running ? "⏸" : "▶"}</button>
        <button className="btn-ghost" onClick={() => setLaps((l) => [elapsed, ...l])} disabled={!running}>Lap</button>
        <button className="btn-ghost" onClick={() => { setRunning(false); setElapsed(0); setLaps([]); }}>↺</button>
      </div>
      <ol className="mt-4 space-y-1 font-mono text-sm text-ink-2">{laps.map((l, i) => <li key={i}>#{laps.length - i} · {fmt(l)}</li>)}</ol>
    </div>
  );
}

export function Calculator() {
  const { locale } = useApp();
  const [expr, setExpr] = useState("");
  const [out, setOut] = useState<string>("");
  const evalSafe = (s: string) => {
    if (!/^[\d\s+\-*/().%^]+$/.test(s)) return "—";
    try { const v = Function(`"use strict"; return (${s.replace(/\^/g, "**").replace(/(\d+(?:\.\d+)?)%/g, "($1/100)")})`)() as number; return Number.isFinite(v) ? String(Math.round(v * 1e8) / 1e8) : "—"; } catch { return "—"; }
  };
  const quick = [
    [locale === "ar" ? "نسبة التغير" : "% change", "(b-a)/a*100"],
    ["R multiple", "(exit-entry)/(entry-stop)"],
    [locale === "ar" ? "الفرق السعري" : "Price diff", "b-a"],
  ];
  return (
    <div className="sheet p-4">
      <span className="eyebrow">ATLAS 03 · 54 · CALCULATOR</span>
      <input id="calc-expr" aria-label="expression" className="input mt-2 font-mono text-lg" value={expr} onChange={(e) => { setExpr(e.target.value); setOut(evalSafe(e.target.value)); }} placeholder="(2650-2645)*100" />
      <div className="mono mt-2 text-3xl">{out || "0"}</div>
      <div className="mt-3 text-xs text-ink-2">{locale === "ar" ? "اختصارات (استبدل الرموز بالأرقام):" : "Shortcuts (replace symbols with numbers):"}</div>
      <div className="mt-1 flex flex-wrap gap-1.5">{quick.map(([n, e]) => <button key={n} className="chip hover:text-ink" onClick={() => setExpr(e)}>{n}: <span className="font-mono">{e}</span></button>)}</div>
    </div>
  );
}

export function TimezoneConverter() {
  const { locale } = useApp();
  const [time, setTime] = useState("14:30");
  const [from, setFrom] = useState("UTC");
  const zones = ["UTC", "Europe/London", "America/New_York", "Asia/Tokyo", "Asia/Riyadh", "Asia/Dubai", "Asia/Amman", "Africa/Cairo", "Europe/Berlin", "Australia/Sydney"];
  const [h, m] = time.split(":").map(Number);
  const today = new Date();
  // interpret input as wall-clock in `from`: find UTC instant by offset of that zone today
  const offsetMin = (tz: string, d: Date) => { const s = d.toLocaleString("en-US", { timeZone: tz, hour12: false, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }); const [date, t] = s.split(", "); const [mo, da, y] = date!.split("/").map(Number); const [hh, mm, ss] = t!.split(":").map(Number); return (Date.UTC(y!, mo! - 1, da!, hh! % 24, mm!, ss!) - d.getTime()) / 60000; };
  const base = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate(), h || 0, m || 0));
  const instant = new Date(base.getTime() - offsetMin(from, base) * 60000);
  return (
    <div className="sheet p-4">
      <span className="eyebrow">ATLAS 03 · 55 · TIME ZONES</span>
      <div className="mt-2 flex gap-2"><input id="tz-time" aria-label="time" type="time" className="input w-32 font-mono" value={time} onChange={(e) => setTime(e.target.value)} /><select id="tz-from" aria-label="from zone" className="input" value={from} onChange={(e) => setFrom(e.target.value)}>{zones.map((z) => <option key={z}>{z}</option>)}</select></div>
      <ul className="mt-3 grid grid-cols-1 gap-1 text-sm sm:grid-cols-2">{zones.map((z) => <li key={z} className="flex justify-between rounded border border-hair px-2 py-1"><span className="text-ink-2">{z}</span><span className="font-mono">{instant.toLocaleTimeString("en-GB", { timeZone: z, hour: "2-digit", minute: "2-digit" })}</span></li>)}</ul>
      <p className="mt-2 text-[11px] text-ink-3">{locale === "ar" ? "يراعي التوقيت الصيفي وفق بيانات المتصفح لليوم الحالي." : "DST-aware using the browser's tz database for today's date."}</p>
    </div>
  );
}
