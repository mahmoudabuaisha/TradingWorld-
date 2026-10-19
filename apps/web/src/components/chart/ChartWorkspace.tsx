"use client";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { AnalysisResult, Candle, Zone } from "@tradingworld/analysis-engine";
import { DEFAULT_INSTRUMENTS, TIMEFRAMES, findInstrument, type Timeframe, type ProviderStatus, type FeedStatus } from "@tradingworld/shared";
import { api } from "@/lib/api";
import { subscribeMarket } from "@/lib/ws";
import { useApp } from "@/store/useApp";
import { t } from "@/i18n/dictionary";
import { TradingChart, type ChartTrade } from "./TradingChart";
import { SidePanel } from "./SidePanel";
import { ZoneDetails } from "./ZoneDetails";
import { AiChat } from "./AiChat";
import { TitleBlock } from "./TitleBlock";
import { SessionDial } from "../marks/SessionDial";
import { Icon } from "../Icon";

function pipPrice(p: number | undefined, precision: number) {
  if (p === undefined) return null;
  const s = p.toFixed(precision);
  if (precision < 2) return <>{Number(s).toLocaleString("en-US")}</>;
  const [i, f] = s.split(".");
  return <>{Number(i).toLocaleString("en-US")}.{f!.slice(0, -2)}<span className="pip">{f!.slice(-2)}</span></>;
}

/** SHEET 02 — the analysis workspace: ribbon, field, legend, assistant, title block. */
export function ChartWorkspace() {
  const { locale, symbol, timeframe, setSymbol, setTimeframe, mode, setMode, showLowQuality, showInvalidated, token } = useApp();
  const [candles, setCandles] = useState<Candle[]>([]);
  const [live, setLive] = useState<Candle>();
  const [analysis, setAnalysis] = useState<AnalysisResult>();
  const [provider, setProvider] = useState<ProviderStatus>();
  const [feed, setFeed] = useState<FeedStatus>();
  const [selected, setSelected] = useState<Zone>();
  const [trades, setTrades] = useState<ChartTrade[]>([]);
  const [anchor, setAnchor] = useState<{ x: number; y: number }>();
  const [toast, setToast] = useState<string>();
  const [error, setError] = useState<string>();
  const hostRef = useRef<HTMLDivElement>(null);
  const calloutRef = useRef<HTMLDivElement>(null);
  const instrument = useMemo(() => findInstrument(symbol) ?? DEFAULT_INSTRUMENTS[0]!, [symbol]);
  const price = live?.close ?? candles[candles.length - 1]?.close;

  const load = useCallback(async () => {
    setError(undefined);
    try {
      const [c, a] = await Promise.all([api.candles(symbol, timeframe, 600), api.analysis(symbol, timeframe, showLowQuality, showInvalidated)]);
      setCandles(c.candles); setLive(undefined); setProvider(c.status); setFeed(c.feed); setAnalysis(a); setSelected(undefined);
    } catch (e) { setError((e as Error).message); }
  }, [symbol, timeframe, showLowQuality, showInvalidated]);
  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    const off = subscribeMarket(symbol, timeframe, (m) => {
      if (m.type === "candle") {
        setLive(m.update.candle);
        if (m.update.closed) setCandles((prev) => (prev.length && prev[prev.length - 1]!.time < m.update.candle.time ? [...prev, m.update.candle] : prev));
      } else if (m.type === "analysis") { if (mode === "ai") setAnalysis(m.result); }
      else if (m.type === "status") { setProvider(m.provider); if (m.feed) setFeed(m.feed); }
      else if (m.type === "alert") { setToast(m.event.message[locale]); setTimeout(() => setToast(undefined), 8000); }
    }, { includeLowQuality: showLowQuality, includeInvalidated: showInvalidated });
    return off;
  }, [symbol, timeframe, mode, locale, showLowQuality, showInvalidated]);

  // open trades on this instrument → dimension lines on the chart
  useEffect(() => {
    if (!token) { setTrades([]); return; }
    api.journal(token).then((j) => setTrades(j.trades.filter((x) => x.exitPrice === undefined && x.symbol === symbol).map((x) => ({ id: x.id, entry: x.entry, stopLoss: x.stopLoss, takeProfit: x.takeProfit, direction: x.direction })))).catch(() => setTrades([]));
  }, [token, symbol]);

  // keep the selected zone in sync with fresh analysis results
  useEffect(() => {
    if (!selected || !analysis) return;
    const fresh = analysis.zones.find((z) => z.id === selected.id);
    if (fresh && fresh !== selected) setSelected(fresh);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analysis]);

  // measure the callout so the overlay can draw the leader line
  useLayoutEffect(() => {
    const host = hostRef.current, box = calloutRef.current;
    if (!host || !box || !selected) { setAnchor(undefined); return; }
    const measure = () => {
      const h = host.getBoundingClientRect(), b = box.getBoundingClientRect();
      setAnchor({ x: b.left + b.width / 2 - h.left, y: b.top - h.top });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(host); ro.observe(box);
    return () => ro.disconnect();
  }, [selected]);

  return (
    <div className="-mx-4 -my-4 flex h-[calc(100vh-var(--bar-h))] flex-col md:-mx-6 md:-my-5">
      {/* ribbon */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-hair px-4 py-2 md:px-6">
        <select id="symbol" className="input w-auto py-1 font-mono text-base font-semibold" value={symbol} onChange={(e) => setSymbol(e.target.value)} style={{ direction: "ltr" }}>
          {DEFAULT_INSTRUMENTS.map((i) => <option key={i.symbol} value={i.symbol}>{i.symbol}</option>)}
        </select>
        <span className="mono text-xl">{pipPrice(price, instrument.pricePrecision)}</span>
        <div className="flex flex-wrap gap-0.5" style={{ direction: "ltr" }}>
          {TIMEFRAMES.map((tf) => <button key={tf} onClick={() => setTimeframe(tf as Timeframe)} aria-pressed={tf === timeframe} className={`mono min-h-[32px] rounded px-2 py-1 text-xs ${tf === timeframe ? "bg-ink text-field" : "text-ink-3 hover:bg-raised hover:text-ink"}`}>{tf}</button>)}
        </div>
        <div className="flex overflow-hidden rounded-full border border-hair text-xs">
          <button onClick={() => setMode("manual")} aria-pressed={mode === "manual"} className={`px-3 py-1 ${mode === "manual" ? "bg-ink text-field" : "text-ink-3"}`}>{t(locale, "chart", "manual")}</button>
          <button onClick={() => setMode("ai")} aria-pressed={mode === "ai"} className={`px-3 py-1 ${mode === "ai" ? "bg-ink text-field" : "text-ink-3"}`}>{t(locale, "chart", "ai")}</button>
        </div>
        <span className="flex-1" />
        <span className="hidden text-xs text-ink-3 lg:inline">{locale === "ar" ? instrument.nameAr : instrument.name}</span>
        <span title={t(locale, "chart", "session")} className="hidden sm:inline-flex"><SessionDial size={24} labels={false} /></span>
        <button className="btn-ghost px-2" onClick={() => void load()} aria-label="refresh"><Icon name="refresh" size={15} /></button>
      </div>
      {error && <div className="border-b border-stamp/40 bg-sheet px-4 py-2 text-xs text-stamp md:px-6">{error} · {locale === "ar" ? "تأكد من تشغيل الـ API على" : "make sure the API is running at"} {process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000"}</div>}
      {toast && <div role="status" className="border-b border-hair bg-raised px-4 py-2 text-xs md:px-6"><Icon name="bell" size={13} className="me-1 inline" />{toast}</div>}

      {/* field + legend */}
      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[1fr_300px]">
        <div ref={hostRef} className="relative min-h-[360px]">
          <TradingChart candles={candles} liveCandle={live} analysis={mode === "ai" ? analysis : undefined} precision={instrument.pricePrecision} selectedZoneId={selected?.id} onSelectZone={setSelected} calloutAnchor={anchor} trades={trades} />
          {selected && mode === "ai" && (
            <div ref={calloutRef} className="absolute bottom-3 end-3 z-10 w-[min(440px,calc(100%-1.5rem))]">
              <ZoneDetails zone={selected} precision={instrument.pricePrecision} onClose={() => setSelected(undefined)} />
            </div>
          )}
        </div>
        <div className="grid min-h-0 grid-rows-[minmax(0,1fr)_230px]">
          <SidePanel analysis={mode === "ai" ? analysis : undefined} precision={instrument.pricePrecision} selected={selected?.id} onSelect={setSelected} provider={provider} />
          <AiChat zoneId={selected?.id} />
        </div>
      </div>
      <TitleBlock analysis={mode === "ai" ? analysis : undefined} provider={provider} feed={feed} symbol={symbol} timeframe={timeframe} />
    </div>
  );
}
