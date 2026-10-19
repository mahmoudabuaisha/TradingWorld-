"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { DEFAULT_INSTRUMENTS } from "@tradingworld/shared";
import { api, type OverviewRow } from "@/lib/api";
import { useApp } from "@/store/useApp";

export function MarketsView() {
  const { locale, setSymbol, watchlist, setWatchlist } = useApp();
  const [rows, setRows] = useState<OverviewRow[]>([]);
  useEffect(() => { api.overview(DEFAULT_INSTRUMENTS.map((i) => i.symbol)).then((r) => setRows(r.rows)).catch(() => {}); }, []);
  const L = (ar: string, en: string) => (locale === "ar" ? ar : en);
  return (
    <div className="space-y-3">
      <h1 className="text-xl font-bold text-gold-light">📈 {L("نظرة عامة على الأسواق", "Market Overview")}</h1>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {DEFAULT_INSTRUMENTS.map((i) => {
          const r = rows.find((x) => x.symbol === i.symbol);
          const inWl = watchlist.includes(i.symbol);
          return (
            <div key={i.symbol} className="card p-4">
              <div className="flex items-start justify-between">
                <div><Link href="/chart" onClick={() => setSymbol(i.symbol)} className="font-mono text-lg font-bold text-gold-light">{i.symbol}</Link><div className="text-xs text-ink-muted">{locale === "ar" ? i.nameAr : i.name} · {i.assetClass}</div></div>
                <button className={`chip hover:text-ink ${inWl ? "text-gold-light" : ""}`} onClick={() => setWatchlist(inWl ? watchlist.filter((s) => s !== i.symbol) : [...watchlist, i.symbol])}>{inWl ? "★" : "☆"}</button>
              </div>
              <div className="mt-3 font-mono text-2xl">{r?.price?.toFixed(i.pricePrecision) ?? "…"}</div>
              <div className="mt-2 flex flex-wrap gap-1.5 text-[11px]"><span className="chip">{r?.regime ?? "…"}</span><span className="chip">{r?.volatility ?? ""}</span><span className={`chip ${r?.htfBias === "bullish" ? "text-up" : r?.htfBias === "bearish" ? "text-down" : ""}`}>HTF {r?.htfBias ?? ""}</span><span className="chip">AI Zones: {r?.zones ?? 0}</span></div>
              {r?.topZone && <div className="mt-2 text-xs text-ink-muted">{r.topZone.score}/100 · {locale === "ar" ? r.topZone.nameAr : r.topZone.name}</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
