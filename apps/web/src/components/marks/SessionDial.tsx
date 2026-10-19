"use client";
import { useClock } from "@/hooks/useClock";

function arc(cx: number, cy: number, r: number, a0: number, a1: number) {
  const s = ((a0 - 90) * Math.PI) / 180, e = ((a1 - 90) * Math.PI) / 180;
  return `M${cx + r * Math.cos(s)} ${cy + r * Math.sin(s)} A${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${cx + r * Math.cos(e)} ${cy + r * Math.sin(e)}`;
}

/**
 * Session Dial: the trading day as a ring. Asia, London and New York are arcs, the London/NY overlap is the only
 * verdigris arc, the hand is now in UTC. Sizes: 24 (ribbon), 120 (sheets), 180 (the clock page).
 */
export function SessionDial({ size = 120, labels = size >= 120, className = "" }: { size?: number; labels?: boolean; className?: string }) {
  const clock = useClock(30_000);
  const cx = size / 2, cy = size / 2, R = size / 2 - (size >= 120 ? 18 : 2), w = size >= 120 ? Math.round(size / 16) : 3;
  const hour = clock ? clock.now.getUTCHours() + clock.now.getUTCMinutes() / 60 : 0;
  return (
    <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} className={className} role="img" aria-label={clock ? `UTC ${clock.utc.slice(0, 5)}` : "session dial"}>
      <circle cx={cx} cy={cy} r={R} fill="none" stroke="var(--hair)" strokeWidth={w} />
      <path d={arc(cx, cy, R, 0, 8 * 15)} fill="none" stroke="var(--ink-3)" strokeWidth={w} opacity="0.55" />
      <path d={arc(cx, cy, R, 7 * 15, 16 * 15)} fill="none" stroke="var(--ink-2)" strokeWidth={w} opacity="0.6" />
      <path d={arc(cx, cy, R, 12 * 15, 21 * 15)} fill="none" stroke="var(--ink-2)" strokeWidth={w} opacity="0.6" />
      <path d={arc(cx, cy, R, 12 * 15, 16 * 15)} fill="none" stroke="var(--up)" strokeWidth={w} />
      {labels && ["00", "06", "12", "18"].map((t, i) => { const a = ((i * 90 - 90) * Math.PI) / 180; return <text key={t} x={cx + (R + 12) * Math.cos(a)} y={cy + (R + 12) * Math.sin(a) + 3.5} textAnchor="middle" fontFamily="var(--font-mono)" fontSize="9.5" fill="var(--ink-3)">{t}</text>; })}
      {labels && ([["ASIA", 60], ["LDN", 172], ["NY", 248]] as const).map(([t, deg]) => { const a = ((deg - 90) * Math.PI) / 180; const rr = R - w - 10; return <text key={t} x={cx + rr * Math.cos(a)} y={cy + rr * Math.sin(a) + 3} textAnchor="middle" fontFamily="var(--font-mono)" fontSize="8.5" letterSpacing="1" fill="var(--ink-3)">{t}</text>; })}
      {clock && <line x1={cx} y1={cy} x2={cx} y2={cy - R - (size >= 120 ? 4 : 1)} stroke="var(--ink)" strokeWidth={size >= 120 ? 2 : 1.4} strokeLinecap="round" transform={`rotate(${hour * 15} ${cx} ${cy})`} />}
      <circle cx={cx} cy={cy} r={size >= 120 ? 3 : 1.5} fill="var(--ink)" />
      {labels && clock && <text x={cx} y={cy + 24} textAnchor="middle" fontFamily="var(--font-mono)" fontSize="13" fontWeight="600" fill="var(--ink)">{clock.utc.slice(0, 5)}</text>}
    </svg>
  );
}
