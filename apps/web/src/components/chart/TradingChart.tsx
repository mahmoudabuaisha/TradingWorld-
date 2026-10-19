"use client";
import { useEffect, useRef } from "react";
import type { IChartApi, ISeriesApi, UTCTimestamp, IPriceLine, LineStyle } from "lightweight-charts";
import type { AnalysisResult, Candle, Zone } from "@tradingworld/analysis-engine";
import { useTokens, type Tokens } from "@/hooks/useTokens";

interface Props {
  candles: Candle[];
  analysis?: AnalysisResult;
  liveCandle?: Candle;
  precision: number;
  selectedZoneId?: string;
  onSelectZone?: (z: Zone) => void;
  showStructure?: boolean;
  showLevels?: boolean;
}

/**
 * lightweight-charts (Apache-2.0) + a Kharita overlay: zones are hatched elevation bands whose hatch
 * direction encodes demand (45°) or supply (135°), with contour lines and a mono label along the top edge.
 */
export function TradingChart({ candles, analysis, liveCandle, precision, selectedZoneId, onSelectZone, showStructure = true, showLevels = true }: Props) {
  const tokens = useTokens();
  const containerRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<IChartApi | undefined>(undefined);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | undefined>(undefined);
  const priceLinesRef = useRef<IPriceLine[]>([]);
  const zonesRef = useRef<Zone[]>([]);
  const selectedRef = useRef<string | undefined>(selectedZoneId);
  const tokensRef = useRef<Tokens | undefined>(tokens);
  const patternsRef = useRef<{ up?: CanvasPattern; down?: CanvasPattern; key?: string }>({});
  selectedRef.current = selectedZoneId;
  tokensRef.current = tokens;

  useEffect(() => {
    if (!tokens || chartRef.current) return;
    let disposed = false;
    (async () => {
      const lc = await import("lightweight-charts");
      if (disposed || !containerRef.current || chartRef.current) return;
      const chart = lc.createChart(containerRef.current, {
        layout: { background: { color: tokens.field }, textColor: tokens.ink2, fontFamily: "IBM Plex Mono, ui-monospace, monospace", fontSize: 11 },
        grid: { vertLines: { color: tokens.hair }, horzLines: { color: tokens.hair } },
        crosshair: { mode: lc.CrosshairMode.Normal, vertLine: { color: tokens.ink3, labelBackgroundColor: tokens.raised }, horzLine: { color: tokens.ink3, labelBackgroundColor: tokens.raised } },
        rightPriceScale: { borderColor: tokens.rule },
        timeScale: { borderColor: tokens.rule, timeVisible: true, secondsVisible: false, rightOffset: 8 },
        localization: { priceFormatter: (p: number) => p.toFixed(precision) },
        autoSize: true,
      });
      const series = chart.addCandlestickSeries({ upColor: tokens.up, downColor: tokens.field, wickUpColor: tokens.up, wickDownColor: tokens.down, borderUpColor: tokens.up, borderDownColor: tokens.down, borderVisible: true, priceFormat: { type: "price", precision, minMove: 1 / 10 ** precision } });
      chartRef.current = chart;
      seriesRef.current = series;
      chart.timeScale().subscribeVisibleLogicalRangeChange(() => drawZones());
      chart.subscribeClick((p) => {
        if (!p.point || !seriesRef.current) return;
        const price = seriesRef.current.coordinateToPrice(p.point.y);
        if (price === null) return;
        const hit = zonesRef.current.find((z) => price <= z.top && price >= z.bottom);
        if (hit) onSelectZone?.(hit);
      });
      setData();
    })();
    return () => { disposed = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tokens]);

  useEffect(() => () => { chartRef.current?.remove(); chartRef.current = undefined; seriesRef.current = undefined; }, []);

  // re-theme without recreating the chart
  useEffect(() => {
    const chart = chartRef.current, s = seriesRef.current;
    if (!chart || !s || !tokens) return;
    chart.applyOptions({ layout: { background: { color: tokens.field }, textColor: tokens.ink2 }, grid: { vertLines: { color: tokens.hair }, horzLines: { color: tokens.hair } }, rightPriceScale: { borderColor: tokens.rule }, timeScale: { borderColor: tokens.rule } });
    s.applyOptions({ upColor: tokens.up, downColor: tokens.field, wickUpColor: tokens.up, wickDownColor: tokens.down, borderUpColor: tokens.up, borderDownColor: tokens.down });
    patternsRef.current = {};
    applyAnalysis();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tokens]);

  const setData = () => {
    const s = seriesRef.current;
    if (!s) return;
    s.setData(candles.map((c) => ({ time: c.time as UTCTimestamp, open: c.open, high: c.high, low: c.low, close: c.close })));
    drawZones();
  };
  useEffect(() => { setData(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [candles]);

  useEffect(() => {
    if (liveCandle && seriesRef.current) {
      seriesRef.current.update({ time: liveCandle.time as UTCTimestamp, open: liveCandle.open, high: liveCandle.high, low: liveCandle.low, close: liveCandle.close });
      drawZones();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveCandle]);

  function applyAnalysis() {
    const s = seriesRef.current, tk = tokensRef.current;
    if (!s || !tk) return;
    priceLinesRef.current.forEach((l) => s.removePriceLine(l));
    priceLinesRef.current = [];
    if (analysis && showLevels) {
      for (const k of analysis.keyLevels.slice(0, 8)) {
        const isBase = k.timeframe === analysis.timeframe;
        priceLinesRef.current.push(s.createPriceLine({ price: k.price, color: isBase ? tk.ink3 : tk.ink2, lineWidth: 1, lineStyle: (isBase ? 4 : 2) as LineStyle, axisLabelVisible: true, title: k.label }));
      }
    }
    if (analysis && showStructure) {
      s.setMarkers(analysis.base.structure.events.slice(-12).map((e) => ({
        time: e.time as UTCTimestamp,
        position: e.direction === "bullish" ? "belowBar" : "aboveBar",
        color: e.direction === "bullish" ? tk.up : tk.down,
        shape: "circle",
        size: 0.4,
        text: e.kind,
      })));
    } else s.setMarkers([]);
    zonesRef.current = analysis?.zones ?? [];
    drawZones();
  }
  useEffect(() => { applyAnalysis(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [analysis, showLevels, showStructure]);
  useEffect(() => { drawZones(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [selectedZoneId]);

  function hatch(ctx: CanvasRenderingContext2D, dir: "up" | "down"): CanvasPattern | null {
    const tk = tokensRef.current;
    if (!tk) return null;
    const key = `${tk.up}${tk.down}`;
    if (patternsRef.current.key !== key) patternsRef.current = { key };
    const cached = patternsRef.current[dir];
    if (cached) return cached;
    const off = document.createElement("canvas");
    off.width = 7; off.height = 7;
    const c = off.getContext("2d");
    if (!c) return null;
    c.strokeStyle = dir === "up" ? tk.up : tk.down;
    c.globalAlpha = 0.5;
    c.lineWidth = 1;
    c.beginPath();
    if (dir === "up") { c.moveTo(0, 7); c.lineTo(7, 0); c.moveTo(-1, 1); c.lineTo(1, -1); c.moveTo(6, 8); c.lineTo(8, 6); }
    else { c.moveTo(0, 0); c.lineTo(7, 7); c.moveTo(6, -1); c.lineTo(8, 1); c.moveTo(-1, 6); c.lineTo(1, 8); }
    c.stroke();
    const p = ctx.createPattern(off, "repeat");
    if (p) patternsRef.current[dir] = p;
    return p;
  }

  function drawZones() {
    const chart = chartRef.current, series = seriesRef.current, cv = overlayRef.current, host = containerRef.current, tk = tokensRef.current;
    if (!chart || !series || !cv || !host || !tk) return;
    const dpr = window.devicePixelRatio || 1;
    const w = host.clientWidth, h = host.clientHeight;
    cv.width = w * dpr; cv.height = h * dpr; cv.style.width = `${w}px`; cv.style.height = `${h}px`;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const right = w - chart.priceScale("right").width();
    ctx.font = "10.5px IBM Plex Mono, ui-monospace, monospace";
    ctx.textAlign = "left";
    for (const z of zonesRef.current) {
      const x1raw = chart.timeScale().timeToCoordinate(z.createdTime as UTCTimestamp);
      const x1 = x1raw === null ? 0 : Math.max(0, x1raw);
      const yTop = series.priceToCoordinate(z.top), yBot = series.priceToCoordinate(z.bottom);
      if (yTop === null || yBot === null) continue;
      const dir = z.direction === "bullish" ? "up" : "down";
      const col = dir === "up" ? tk.up : tk.down;
      const sel = z.id === selectedRef.current;
      const weak = z.status === "WEAKENED";
      ctx.fillStyle = dir === "up" ? tk.upWash : tk.downWash;
      ctx.fillRect(x1, yTop, right - x1, yBot - yTop);
      const pat = hatch(ctx, dir);
      if (pat) { ctx.save(); ctx.globalAlpha = weak ? 0.45 : sel ? 1 : 0.8; ctx.fillStyle = pat; ctx.fillRect(x1, yTop, right - x1, yBot - yTop); ctx.restore(); }
      ctx.strokeStyle = col; ctx.lineWidth = sel ? 1.8 : 1.1;
      ctx.setLineDash(weak ? [3, 3] : []);
      ctx.beginPath(); ctx.moveTo(x1, yTop + 0.5); ctx.lineTo(right, yTop + 0.5); ctx.moveTo(x1, yBot - 0.5); ctx.lineTo(right, yBot - 0.5); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = col;
      const label = `${z.score} · ${dir === "up" ? "DEMAND" : "SUPPLY"} · ${z.status}${z.tests ? ` · TESTED x${z.tests}` : ""}`;
      const tw = ctx.measureText(label).width;
      const tall = yBot - yTop >= 18;
      const lx = x1 + 6 + tw + 6 > right ? Math.max(6, right - tw - 6) : x1 + 6;
      const ly = tall ? yTop + 12 : Math.max(yTop - 5, 12);
      if (tall) { ctx.save(); ctx.fillStyle = tk.field; ctx.globalAlpha = 0.75; ctx.fillRect(lx - 3, ly - 10, tw + 6, 13); ctx.restore(); ctx.fillStyle = col; }
      ctx.fillText(label, lx, ly);
    }
  }

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="h-full w-full" />
      <canvas ref={overlayRef} className="pointer-events-none absolute inset-0 z-[3]" />
    </div>
  );
}
