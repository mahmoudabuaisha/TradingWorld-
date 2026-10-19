"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { AnalysisResult, Candle, Zone } from "@tradingworld/analysis-engine";
import { DEFAULT_INSTRUMENTS, TIMEFRAMES, findInstrument, type Timeframe } from "@tradingworld/shared";
import { api } from "@/lib/api";
import { subscribeMarket } from "@/lib/ws";
import { useApp } from "@/store/useApp";
import { t } from "@/i18n/dictionary";
import { TradingChart } from "./TradingChart";
import { SidePanel } from "./SidePanel";
import { ZoneDetails } from "./ZoneDetails";
import { AiChat } from "./AiChat";

export function ChartWorkspace() {
  const { locale, symbol, timeframe, setSymbol, setTimeframe, mode, setMode, showLowQuality } = useApp();
  const [candles, setCandles] = useState<Candle[]>([]);
  const [live, setLive] = useState<Candle>();
  const [analysis, setAnalysis] = useState<AnalysisResult>();
  const [provider, setProvider] = useState<{ id: string; live: boolean; message?: string }>();
  const [selected, setSelected] = useState<Zone>();
  const [toast, setToast] = useState<string>();
  const [error, setError] = useState<string>();
  const instrument = useMemo(() => findInstrument(symbol) ?? DEFAULT_INSTRUMENTS[0]!, [symbol]);

  const load = useCallback(async () => {
    setError(undefined);
    try {
      const [c, a] = await Promise.all([api.candles(symbol, timeframe, 600), api.analysis(symbol, timeframe, showLowQuality)]);
      setCandles(c.candles); setProvider({ id: c.provider, ...c.status }); setAnalysis(a); setSelected(undefined);
    } catch (e) { setError((e as Error).message); }
  }, [symbol, timeframe, showLowQuality]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    const off = subscribeMarket(symbol, timeframe, (m) => {
      if (m.type === "candle") {
        setLive(m.update.candle);
        if (m.update.closed) setCandles((prev) => (prev.length && prev[prev.length - 1]!.time < m.update.candle.time ? [...prev, m.update.candle] : prev));
      } else if (m.type === "analysis") {
        if (mode === "ai") setAnalysis(m.result);
      } else if (m.type === "status") setProvider(m.provider);
      else if (m.type === "alert") { setToast(m.event.message[locale]); setTimeout(() => setToast(undefined), 8000); }
    });
    return off;
  }, [symbol, timeframe, mode, locale]);

  return (
    <div className="flex h-[calc(100vh-7.5rem)] flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <select className="input w-auto font-mono" value={symbol} onChange={(e) => setSymbol(e.target.value)}>
          {DEFAULT_INSTRUMENTS.map((i) => <option key={i.symbol} value={i.symbol}>{i.symbol} · {locale === "ar" ? i.nameAr : i.name}</option>)}
        </select>
        <div className="flex flex-wrap gap-1">
          {TIMEFRAMES.map((tf) => <button key={tf} onClick={() => setTimeframe(tf as Timeframe)} className={`rounded-md px-2 py-1 font-mono text-xs ${tf === timeframe ? "bg-[#252117] text-gold-light" : "text-ink-muted hover:bg-bg-hover"}`}>{tf}</button>)}
        </div>
        <div className="ms-auto flex items-center gap-1 rounded-lg border border-line p-0.5 text-xs">
          <button onClick={() => setMode("manual")} className={`rounded-md px-2 py-1 ${mode === "manual" ? "bg-[#252117] text-gold-light" : "text-ink-muted"}`}>{t(locale, "chart", "manual")}</button>
          <button onClick={() => setMode("ai")} className={`rounded-md px-2 py-1 ${mode === "ai" ? "bg-[#252117] text-gold-light" : "text-ink-muted"}`}>{t(locale, "chart", "ai")}</button>
        </div>
        <button className="btn-ghost" onClick={() => void load()}>⟳</button>
      </div>
      {error && <div className="rounded-lg border border-down/40 bg-down/10 px-3 py-2 text-xs text-down">{error} — {locale === "ar" ? "تأكد من تشغيل الـ API على" : "make sure the API is running at"} {process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000"}</div>}
      {toast && <div className="rounded-lg border border-gold/50 bg-[#252117] px-3 py-2 text-xs text-gold-light">🔔 {toast}</div>}

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 lg:grid-cols-[1fr_320px]">
        <div className="card relative min-h-[380px] overflow-hidden">
          <TradingChart candles={candles} liveCandle={live} analysis={mode === "ai" ? analysis : undefined} precision={instrument.pricePrecision} selectedZoneId={selected?.id} onSelectZone={setSelected} />
          {selected && mode === "ai" && <div className="absolute bottom-3 start-3 z-10 w-[min(520px,calc(100%-1.5rem))]"><ZoneDetails zone={selected} precision={instrument.pricePrecision} onClose={() => setSelected(undefined)} /></div>}
        </div>
        <div className="grid min-h-0 grid-rows-[1fr_280px] gap-3">
          <SidePanel analysis={mode === "ai" ? analysis : undefined} precision={instrument.pricePrecision} selected={selected?.id} onSelect={setSelected} provider={provider} />
          <AiChat zoneId={selected?.id} />
        </div>
      </div>
    </div>
  );
}
