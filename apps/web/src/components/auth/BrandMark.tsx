import { useId } from "react";

/** The brand shown on the sign-in screen. One place to change it. */
export const BRAND = "TraderWorld";

/** The winged TW monogram, in the gold of the sign-in screen. */
export function BrandMark({ size = 40, className }: { size?: number; className?: string }) {
  const id = useId();
  return (
    <svg width={size} height={(size * 44) / 64} viewBox="0 0 64 44" className={className} aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f8e7a6" />
          <stop offset="0.45" stopColor="#d4af37" />
          <stop offset="1" stopColor="#8e6b1f" />
        </linearGradient>
      </defs>
      <g fill={`url(#${id})`}>
        {/* the wings: the bar of the T, split and swept back */}
        <path d="M1 2h27l-3.4 6.4H12.2L16.4 17h-6.2z" />
        <path d="M63 2H36l3.4 6.4h12.4L47.6 17h6.2z" />
        {/* the W: two strokes meeting at the point */}
        <path d="M18.6 12.6h6.6L32 27.4l6.8-14.8h6.6L33.9 42h-3.8z" />
        <path d="M29.6 12.6h4.8L32 18.2z" />
      </g>
    </svg>
  );
}
