import type { Bias } from "@tradingworld/analysis-engine";

/**
 * Bias Compass: one needle per higher timeframe. Needles pointing the same way mean alignment; a mixed row means
 * conflict, which is itself the information. Needle length falls with the timeframe (the highest is longest).
 */
export function BiasCompass({ frames, size = 56, className = "" }: { frames: { timeframe: string; bias: Bias }[]; size?: number; className?: string }) {
  const gap = 8, w = frames.length * size + (frames.length - 1) * gap, h = size + 16;
  const R = size / 2 - 3;
  return (
    <svg viewBox={`0 0 ${Math.max(w, 1)} ${h}`} width="100%" height={h} className={className} role="img" aria-label={frames.map((f) => `${f.timeframe} ${f.bias}`).join(", ")}>
      {frames.map((f, i) => {
        const cx = i * (size + gap) + size / 2, cy = size / 2, len = R * (1 - i * 0.14) - 2;
        const col = f.bias === "bullish" ? "var(--up)" : f.bias === "bearish" ? "var(--down)" : "var(--ink-3)";
        const y2 = f.bias === "bullish" ? cy - len : f.bias === "bearish" ? cy + len : cy;
        const head = f.bias === "bullish" ? `M${cx - 3.5} ${y2 + 5} L${cx} ${y2} L${cx + 3.5} ${y2 + 5}` : f.bias === "bearish" ? `M${cx - 3.5} ${y2 - 5} L${cx} ${y2} L${cx + 3.5} ${y2 - 5}` : "";
        return (
          <g key={f.timeframe}>
            <circle cx={cx} cy={cy} r={R} fill="none" stroke="var(--rule)" />
            <line x1={cx - R} y1={cy} x2={cx + R} y2={cy} stroke="var(--hair)" />
            {f.bias === "neutral"
              ? <line x1={cx - len * 0.6} y1={cy} x2={cx + len * 0.6} y2={cy} stroke={col} strokeWidth="2" strokeLinecap="round" />
              : <><line x1={cx} y1={cy} x2={cx} y2={y2} stroke={col} strokeWidth="2" strokeLinecap="round" /><path d={head} fill="none" stroke={col} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></>}
            <circle cx={cx} cy={cy} r="1.8" fill="var(--ink)" />
            <text x={cx} y={size + 12} textAnchor="middle" fontFamily="var(--font-mono)" fontSize="9.5" fill="var(--ink-2)">{f.timeframe}</text>
          </g>
        );
      })}
    </svg>
  );
}
