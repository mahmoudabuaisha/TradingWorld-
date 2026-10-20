"use client";
import type { DrawingKind } from "@tradingworld/shared";
import { Icon, type IconName } from "../Icon";

export type Tool = "select" | DrawingKind;

const TOOLS: { id: Tool; icon: IconName; key: string; ar: string; en: string }[] = [
  { id: "select", icon: "cursor", key: "V", ar: "تحديد وتحريك", en: "Select & move" },
  { id: "trendline", icon: "trendline", key: "T", ar: "خط اتجاه", en: "Trend line" },
  { id: "hline", icon: "hline", key: "H", ar: "خط أفقي", en: "Horizontal line" },
  { id: "rect", icon: "rect", key: "R", ar: "مستطيل", en: "Rectangle" },
  { id: "fib", icon: "fib", key: "F", ar: "فيبوناتشي", en: "Fibonacci retracement" },
];

/** The drafting tools: the human's pencil case, drawn in chalk. Vertical strip at the chart's left edge. */
export function DrawingToolbar({ tool, setTool, selected, onDelete, onClear, count, locale }: { tool: Tool; setTool: (t: Tool) => void; selected: boolean; onDelete: () => void; onClear: () => void; count: number; locale: "ar" | "en" }) {
  const L = (ar: string, en: string) => (locale === "ar" ? ar : en);
  return (
    <div role="toolbar" aria-label={L("أدوات الرسم", "Drawing tools")} aria-orientation="vertical" className="sheet flex flex-col gap-0.5 p-0.5 shadow-sheet">
      {TOOLS.map((t) => (
        <button key={t.id} type="button" onClick={() => setTool(t.id)} aria-pressed={tool === t.id} aria-label={`${L(t.ar, t.en)} (${t.key})`} title={`${L(t.ar, t.en)} · ${t.key}`}
          className={`grid h-8 w-8 place-items-center rounded ${tool === t.id ? "bg-ink text-field" : "text-ink-2 hover:bg-raised hover:text-ink"}`}>
          <Icon name={t.icon} size={16} />
        </button>
      ))}
      <span className="mx-1 my-0.5 border-t border-hair" />
      <button type="button" onClick={onDelete} disabled={!selected} aria-label={L("حذف الرسم المحدد (Delete)", "Delete selected drawing (Delete)")} title={L("حذف المحدد · Delete", "Delete selected · Delete")}
        className="grid h-8 w-8 place-items-center rounded text-ink-2 hover:bg-raised hover:text-ink disabled:opacity-30"><Icon name="trash" size={16} /></button>
      <button type="button" onClick={onClear} disabled={!count} aria-label={L("مسح كل الرسوم على هذا الأصل", "Clear all drawings on this instrument")} title={L("مسح الكل", "Clear all")}
        className="mono grid h-8 w-8 place-items-center rounded text-[9px] text-ink-3 hover:bg-raised hover:text-ink disabled:opacity-30">ALL</button>
    </div>
  );
}
