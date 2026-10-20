"use client";
import { useMemo, useState } from "react";
import type { Factor } from "@tradingworld/analysis-engine";

/**
 * Confluence Stack: every present factor is a translucent layer whose thickness is its weight; the score is the
 * height of the pile, read off a dimension line. Absent factors are dashed, empty layers.
 * In what-if mode the trader can lift a layer to see what the score would be without it (a simulation, labelled).
 */
export function ConfluenceStack({
  factors,
  score,
  direction,
  locale,
  scale = 2.2,
  minH = 22,
  offH = 16,
  interactive = true,
}: {
  factors: Factor[];
  score: number;
  direction: "bullish" | "bearish";
  locale: "ar" | "en";
  scale?: number;
  minH?: number;
  offH?: number;
  interactive?: boolean;
}) {
  const [lifted, setLifted] = useState<Set<string>>(new Set());
  const whatIf = useMemo(() => factors.reduce((s, f) => s + (f.present && !lifted.has(f.key) ? f.contribution : 0), 0), [factors, lifted]);
  const modified = lifted.size > 0;
  const tone =
    direction === "bullish"
      ? { border: "border-up", wash: "bg-up-wash", text: "text-up-ink" }
      : { border: "border-down", wash: "bg-down-wash", text: "text-down-ink" };
  const L = (ar: string, en: string) => (locale === "ar" ? ar : en);
  const toggle = (key: string) => {
    if (!interactive) return;
    setLifted((s) => {
      const n = new Set(s);
      if (n.has(key)) n.delete(key);
      else n.add(key);
      return n;
    });
  };
  let idx = 0;
  return (
    <div>
      <div className="grid grid-cols-[1fr_40px] items-end gap-2">
        <div className="flex flex-col-reverse gap-0.5">
          {factors.map((f) => {
            const on = f.present && !lifted.has(f.key);
            const dim = f.present && lifted.has(f.key);
            const h = on ? Math.max(minH, f.weight * scale) : offH;
            const shift = on ? idx++ : 0;
            return (
              <button
                key={f.key}
                type="button"
                onClick={() => toggle(f.key)}
                disabled={!interactive || !f.present}
                aria-pressed={on}
                title={f.evidence?.[locale] ?? f.label[locale]}
                style={{ height: h, transform: on ? `translateX(${-shift * 1.5}px)` : undefined }}
                className={`flex items-center justify-between rounded-sm border px-2 text-[11px] leading-none transition disabled:cursor-default ${on ? `${tone.border} ${tone.wash}` : dim ? "border-dashed border-rule text-ink-3 line-through" : "border-dashed border-hair text-ink-3"}`}
              >
                <span className="truncate">{f.label[locale]}</span>
                <span className="mono">{on ? `+${f.contribution}` : `· ${f.weight}`}</span>
              </button>
            );
          })}
        </div>
        <div className="relative flex h-full min-h-[120px] items-center justify-center">
          <span className="absolute inset-y-0 start-1/2 w-px bg-ink" aria-hidden="true" />
          <span className="absolute top-0 start-1/2 h-px w-2.5 -translate-x-1/2 bg-ink" aria-hidden="true" />
          <span className="absolute bottom-0 start-1/2 h-px w-2.5 -translate-x-1/2 bg-ink" aria-hidden="true" />
          <span className="mono relative bg-sheet px-0.5 py-1 text-xs font-semibold [writing-mode:vertical-rl] rotate-180">
            {modified ? whatIf : score} / 100
          </span>
        </div>
      </div>
      {interactive && (
        <div className="mt-2 flex items-center justify-between text-[11px] text-ink-3">
          <span>
            {modified
              ? L(`ماذا لو: ${whatIf} بدل ${score} الفعلية`, `What if: ${whatIf} instead of the actual ${score}`)
              : L("اضغط على طبقة لترى الدرجة بدونها", "Lift a layer to see the score without it")}
          </span>
          {modified && (
            <button type="button" className="underline hover:text-ink" onClick={() => setLifted(new Set())}>
              {L("إعادة", "Reset")}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
