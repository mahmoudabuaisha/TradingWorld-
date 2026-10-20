/**
 * Dimension line: stop, entry and target drawn like an engineering dimension.
 * The risk span (1R) is amber-washed, the reward span verdigris-washed; the current price is a chalk marker.
 */
export function Dimension({
  entry,
  stop,
  target,
  current,
  direction,
  precision = 2,
  height = 92,
}: {
  entry: number;
  stop: number;
  target?: number;
  current?: number;
  direction: "long" | "short";
  precision?: number;
  height?: number;
}) {
  const W = 360;
  const risk = Math.abs(entry - stop) || 1;
  const reward = target !== undefined ? Math.abs(target - entry) : risk * 2;
  const total = risk + reward;
  const padL = 44,
    padR = 44,
    span = W - padL - padR;
  const xStop = padL,
    xEntry = padL + (risk / total) * span,
    xTarget = W - padR;
  const fmt = (n: number) => n.toFixed(precision);
  const rNow = current !== undefined ? (direction === "long" ? current - entry : entry - current) / risk : undefined;
  const xNow =
    current !== undefined
      ? (() => {
          const lo = direction === "long" ? stop : (target ?? entry + risk * 2);
          const hi = direction === "long" ? (target ?? entry + risk * 2) : stop;
          const f = (current - lo) / (hi - lo || 1);
          const fx = direction === "long" ? f : 1 - f;
          return Math.max(padL - 10, Math.min(xTarget + 10, xStop + fx * (xTarget - xStop)));
        })()
      : undefined;
  const y = 42;
  return (
    <svg
      viewBox={`0 0 ${W} ${height}`}
      width="100%"
      height={height}
      aria-label={`dimension ${fmt(stop)} ${fmt(entry)} ${target !== undefined ? fmt(target) : ""}`}
    >
      <rect x={xStop} y={y + 10} width={xEntry - xStop} height={16} fill="var(--down-wash)" />
      <rect x={xEntry} y={y + 10} width={xTarget - xEntry} height={16} fill="var(--up-wash)" />
      <g stroke="var(--ink)" fill="none" strokeWidth="1">
        <line x1={xStop} y1={y - 14} x2={xStop} y2={y + 30} />
        <line x1={xEntry} y1={y - 14} x2={xEntry} y2={y + 30} />
        <line x1={xTarget} y1={y - 14} x2={xTarget} y2={y + 30} />
        <line x1={xStop} y1={y} x2={xTarget} y2={y} />
        <path d={`M${xStop + 6} ${y - 4} L${xStop} ${y} L${xStop + 6} ${y + 4}`} />
        <path d={`M${xEntry - 6} ${y - 4} L${xEntry} ${y} L${xEntry - 6} ${y + 4}`} />
        <path d={`M${xEntry + 6} ${y - 4} L${xEntry} ${y} L${xEntry + 6} ${y + 4}`} />
        <path d={`M${xTarget - 6} ${y - 4} L${xTarget} ${y} L${xTarget - 6} ${y + 4}`} />
      </g>
      <g fontFamily="var(--font-mono)" fontSize="10.5" fill="var(--ink)" textAnchor="middle">
        <text x={(xStop + xEntry) / 2} y={y - 6}>
          1.0R · {fmt(risk)}
        </text>
        <text x={(xEntry + xTarget) / 2} y={y - 6}>
          {(reward / risk).toFixed(1)}R · {fmt(reward)}
        </text>
      </g>
      <g fontFamily="var(--font-mono)" fontSize="9.5" fill="var(--ink-3)" textAnchor="middle">
        <text x={xStop} y={y + 42}>
          SL {fmt(stop)}
        </text>
        <text x={xEntry} y={y + 42}>
          ENTRY {fmt(entry)}
        </text>
        <text x={xTarget} y={y + 42}>
          {target !== undefined ? `TP ${fmt(target)}` : "2R"}
        </text>
      </g>
      {xNow !== undefined && rNow !== undefined && (
        <g>
          <path d={`M${xNow - 5} ${y + 4} L${xNow} ${y + 10} L${xNow + 5} ${y + 4} Z`} fill="var(--ink)" />
          <text
            x={xNow}
            y={y - 20}
            fontFamily="var(--font-mono)"
            fontSize="10.5"
            fontWeight="600"
            fill={rNow >= 0 ? "var(--up)" : "var(--down)"}
            textAnchor="middle"
          >
            NOW {rNow >= 0 ? "+" : ""}
            {rNow.toFixed(2)}R
          </text>
        </g>
      )}
    </svg>
  );
}
