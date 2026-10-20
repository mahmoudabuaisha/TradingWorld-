"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { DEFAULT_INSTRUMENTS, type AssetClass } from "@tradingworld/shared";
import { api, type OverviewRow } from "@/lib/api";
import { useApp } from "@/store/useApp";
import { Terrain } from "./marks/Terrain";

const CLASSES: { id: AssetClass; ar: string; en: string; code: string }[] = [
  { id: "metal", ar: "المعادن", en: "Metals", code: "METALS" },
  { id: "forex", ar: "العملات", en: "Forex", code: "FX" },
  { id: "crypto", ar: "العملات الرقمية", en: "Crypto", code: "CRYPTO" },
  { id: "index", ar: "المؤشرات", en: "Indices", code: "INDICES" },
  { id: "commodity", ar: "السلع", en: "Commodities", code: "COMMODITIES" },
  { id: "stock", ar: "الأسهم", en: "Stocks", code: "STOCKS" },
];

function fmtPrice(p: number | undefined, precision: number) {
  if (p === undefined) return { main: "…", pip: "" };
  const s = p.toFixed(precision);
  if (precision < 2) return { main: Number(s).toLocaleString("en-US"), pip: "" };
  const [i, f] = s.split(".");
  return { main: `${Number(i).toLocaleString("en-US")}.${f!.slice(0, -2)}`, pip: f!.slice(-2) };
}

/** SHEET 10 — the market survey: every instrument as a terrain row, grouped by asset class. */
export function MarketsView() {
  const { locale, setSymbol, watchlist, setWatchlist } = useApp();
  const [rows, setRows] = useState<OverviewRow[]>([]);
  const [at, setAt] = useState<number>();
  const [err, setErr] = useState<string>();
  const L = (ar: string, en: string) => (locale === "ar" ? ar : en);
  useEffect(() => {
    const load = () =>
      api
        .overview(DEFAULT_INSTRUMENTS.map((i) => i.symbol))
        .then((r) => {
          setRows(r.rows);
          setAt(r.generatedAt);
          setErr(undefined);
        })
        .catch((e) => setErr((e as Error).message));
    void load();
    const id = setInterval(() => void load(), 30_000);
    return () => clearInterval(id);
  }, []);
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <span className="eyebrow">
            ATLAS 02 · 10 · MARKET SURVEY{at ? ` · ${new Date(at * 1000).toISOString().slice(11, 19)} UTC` : ""}
          </span>
          <h1 className="text-2xl font-semibold">{L("نظرة عامة على الأسواق", "Market Overview")}</h1>
          <p className="max-w-[68ch] text-sm text-ink-2">
            {L(
              "كل أصل شريط تضاريس من آخر 48 شمعة على 15m، مع حالة السوق والانحياز الغالب وأقوى منطقة. التهشير يحدد الاتجاه حتى بلا لون.",
              "Every instrument is a terrain strip of its last 48 candles on 15m, with regime, dominant bias and strongest zone. The hatch direction encodes bias even without colour.",
            )}
          </p>
        </div>
        {err && <span className="text-xs text-stamp">{err}</span>}
      </div>
      {CLASSES.filter((c) => DEFAULT_INSTRUMENTS.some((i) => i.assetClass === c.id)).map((c) => (
        <section key={c.id} className="sheet overflow-hidden">
          <div className="flex items-baseline gap-3 border-b border-hair px-4 py-2">
            <span className="eyebrow">{c.code}</span>
            <h2 className="text-sm font-semibold">{locale === "ar" ? c.ar : c.en}</h2>
            <span className="mono ms-auto text-2xs text-ink-3">
              SOURCE ·{" "}
              {[
                ...new Set(
                  rows
                    .filter((r) => DEFAULT_INSTRUMENTS.some((i) => i.symbol === r.symbol && i.assetClass === c.id))
                    .map((r) => r.feed?.provider)
                    .filter(Boolean),
                ),
              ]
                .map((p) => String(p).toUpperCase())
                .join(" / ") || "…"}
            </span>
          </div>
          <div className="hidden grid-cols-[120px_1fr_150px_150px_90px_72px_72px] gap-3 border-b border-hair px-4 py-1.5 text-2xs md:grid">
            {[
              L("الأصل", "Instrument"),
              L("التضاريس", "Terrain"),
              L("السعر", "Price"),
              L("الحالة", "Regime"),
              L("الانحياز", "Bias"),
              L("مناطق", "Zones"),
              "",
            ].map((h, i) => (
              <span key={i} className="eyebrow">
                {h}
              </span>
            ))}
          </div>
          <div className="divide-y divide-hair">
            {DEFAULT_INSTRUMENTS.filter((i) => i.assetClass === c.id).map((i) => {
              const r = rows.find((x) => x.symbol === i.symbol);
              const p = fmtPrice(r?.price, i.pricePrecision);
              const inWl = watchlist.includes(i.symbol);
              const bias = r?.htfBias;
              return (
                <div
                  key={i.symbol}
                  className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1 px-4 py-2 hover:bg-raised md:grid-cols-[120px_1fr_150px_150px_90px_72px_72px]"
                >
                  <Link href="/chart" onClick={() => setSymbol(i.symbol)} className="min-w-0">
                    <div className="mono text-sm font-semibold">{i.symbol}</div>
                    <div className="truncate text-[11px] text-ink-3">{locale === "ar" ? i.nameAr : i.name}</div>
                  </Link>
                  <div className="col-span-2 md:col-span-1">
                    <Terrain values={r?.spark ?? []} height={34} />
                  </div>
                  <div className="mono text-sm">
                    {p.main}
                    <span className="pip">{p.pip}</span>
                    {r?.changePct !== undefined && (
                      <span className={`ms-2 text-xs ${r.changePct >= 0 ? "text-up-ink" : "text-down-ink"}`}>
                        {r.changePct >= 0 ? "+" : ""}
                        {r.changePct.toFixed(2)}%
                      </span>
                    )}
                    {(() => {
                      const st = r?.feed?.state ?? (r?.error ? "OFFLINE" : undefined);
                      return st && st !== "LIVE" ? (
                        <span
                          className={`chip ms-2 text-2xs ${st === "CLOSED" ? "text-ink-3" : st === "DELAYED" ? "" : "text-down-ink"}`}
                          title={r?.error}
                        >
                          {st}
                        </span>
                      ) : null;
                    })()}
                  </div>
                  <div className="flex flex-wrap gap-1">
                    <span className="chip">{r?.regime?.replace("_", " ") ?? "…"}</span>
                    <span className="chip">{r?.volatility ?? ""}</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs">
                    <span className={`sw ${bias === "bearish" ? "hatch-down" : bias === "bullish" ? "hatch-up" : "bg-raised"}`} />
                    <span className={bias === "bullish" ? "text-up-ink" : bias === "bearish" ? "text-down-ink" : "text-ink-3"}>
                      {bias === "bullish" ? "▲" : bias === "bearish" ? "▼" : "≈"} {bias ?? ""}
                    </span>
                  </div>
                  <div className="mono text-xs">
                    {r?.zones ?? "—"}
                    {r?.topZone ? <span className="text-ink-3"> · {r.topZone.score}</span> : null}
                  </div>
                  <button
                    type="button"
                    onClick={() => setWatchlist(inWl ? watchlist.filter((s) => s !== i.symbol) : [...watchlist, i.symbol])}
                    aria-pressed={inWl}
                    className={`chip justify-self-end hover:text-ink ${inWl ? "border-ink text-ink" : ""}`}
                  >
                    {inWl ? L("متابَع", "watched") : L("تابع", "watch")}
                  </button>
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
