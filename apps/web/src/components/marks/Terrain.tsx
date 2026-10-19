/** Terrain strip: a watchlist sparkline drawn as three contour lines over a filled relief, with an end mark. No series colour. */
export function Terrain({ values, width = 160, height = 36, className = "" }: { values: number[]; width?: number; height?: number; className?: string }) {
  if (!values || values.length < 2) return <svg viewBox={`0 0 ${width} ${height}`} className={className} aria-hidden="true" />;
  const min = Math.min(...values), max = Math.max(...values), span = max - min || 1;
  const pts = values.map((v, i) => [(i / (values.length - 1)) * width, height - 4 - ((v - min) / span) * (height - 10)] as const);
  const path = (off: number) => pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)} ${(p[1] + off).toFixed(1)}`).join(" ");
  const last = pts[pts.length - 1]!;
  return (
    <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height} preserveAspectRatio="none" className={className} aria-hidden="true">
      <path d={`${path(0)} L${width} ${height} L0 ${height} Z`} fill="var(--raised)" />
      <path d={path(6)} fill="none" stroke="var(--hair)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
      <path d={path(3)} fill="none" stroke="var(--rule)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
      <path d={path(0)} fill="none" stroke="var(--ink-2)" strokeWidth="1.4" vectorEffect="non-scaling-stroke" />
      <circle cx={last[0]} cy={last[1]} r="2.6" fill="var(--ink)" />
    </svg>
  );
}
