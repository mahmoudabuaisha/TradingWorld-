"use client";
import { useEffect, useRef } from "react";
import type { IChartApi, ISeriesApi, UTCTimestamp, IPriceLine } from "lightweight-charts";
import type { AnalysisResult, Candle, Zone } from "@tradingworld/analysis-engine";

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

const ZONE_COLORS = { HIGH: "rgba(55,199,160,", MEDIUM: "rgba(213,177,93,", LOW: "rgba(169,169,176," } as const;

/**
 * lightweight-charts (Apache-2.0) wrapper + an overlay canvas for AI zones.
 * The chart is the interface; the engine behind it is the product.
 */
export function TradingChart({ candles, analysis, liveCandle, precision, selectedZoneId, onSelectZone, showStructure = true, showLevels = true }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<IChartApi | undefined>(undefined);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | undefined>(undefined);
  const priceLinesRef = useRef<IPriceLine[]>([]);
  const zonesRef = useRef<Zone[]>([]);
  const selectedRef = useRef<string | undefined>(selectedZoneId);
  selectedRef.current = selectedZoneId;

  // create chart once
  useEffect(() => {
    let disposed = false;
    (async () => {
      const lc = await import("lightweight-charts");
      if (disposed || !containerRef.current) return;
      const chart = lc.createChart(containerRef.current, {
        layout: { background: { color: "#0b0c0f" }, textColor: "#a9a9b0", fontFamily: "Inter, Tahoma, sans-serif" },
        grid: { vertLines: { color: "#15171c" }, horzLines: { color: "#15171c" } },
        crosshair: { mode: lc.CrosshairMode.Normal },
        rightPriceScale: { borderColor: "#2d3038" },
        timeScale: { borderColor: "#2d3038", timeVisible: true, secondsVisible: false, rightOffset: 8 },
        localization: { priceFormatter: (p: number) => p.toFixed(precision) },
        autoSize: true,
      });
      const series = chart.addCandlestickSeries({ upColor: "#37c7a0", downColor: "#f07882", wickUpColor: "#37c7a0", wickDownColor: "#f07882", borderVisible: false, priceFormat: { type: "price", precision, minMove: 1 / 10 ** precision } });
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
    return () => { disposed = true; chartRef.current?.remove(); chartRef.current = undefined; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  // levels + markers when analysis changes
  useEffect(() => {
    const s = seriesRef.current;
    if (!s) return;
    priceLinesRef.current.forEach((l) => s.removePriceLine(l));
    priceLinesRef.current = [];
    if (analysis && showLevels) {
      for (const k of analysis.keyLevels.slice(0, 8)) {
        priceLinesRef.current.push(s.createPriceLine({ price: k.price, color: k.timeframe === analysis.timeframe ? "#8db7ff" : "#d5b15d", lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: k.label }));
      }
    }
    if (analysis && showStructure) {
      s.setMarkers(analysis.base.structure.events.slice(-12).map((e) => ({
        time: e.time as UTCTimestamp,
        position: e.direction === "bullish" ? "belowBar" : "aboveBar",
        color: e.direction === "bullish" ? "#37c7a0" : "#f07882",
        shape: e.direction === "bullish" ? "arrowUp" : "arrowDown",
        text: e.kind,
      })));
    } else s.setMarkers([]);
    zonesRef.current = analysis?.zones ?? [];
    drawZones();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analysis, showLevels, showStructure]);

  useEffect(() => { drawZones(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [selectedZoneId]);

  function drawZones() {
    const chart = chartRef.current, series = seriesRef.current, cv = overlayRef.current, host = containerRef.current;
    if (!chart || !series || !cv || !host) return;
    const dpr = window.devicePixelRatio || 1;
    const w = host.clientWidth, h = host.clientHeight;
    cv.width = w * dpr; cv.height = h * dpr; cv.style.width = `${w}px`; cv.style.height = `${h}px`;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const priceScaleWidth = chart.priceScale("right").width();
    const right = w - priceScaleWidth;
    for (const z of zonesRef.current) {
      const x1raw = chart.timeScale().timeToCoordinate(z.createdTime as UTCTimestamp);
      const x1 = x1raw === null ? 0 : Math.max(0, x1raw);
      const yTop = series.priceToCoordinate(z.top), yBot = series.priceToCoordinate(z.bottom);
      if (yTop === null || yBot === null) continue;
      const base = ZONE_COLORS[z.quality];
      const sel = z.id === selectedRef.current;
      ctx.fillStyle = `${base}${sel ? 0.28 : z.status === "WEAKENED" ? 0.08 : 0.16})`;
      ctx.fillRect(x1, yTop, right - x1, yBot - yTop);
      ctx.strokeStyle = `${base}${sel ? 0.95 : 0.6})`;
      ctx.lineWidth = sel ? 1.5 : 1;
      ctx.strokeRect(x1 + 0.5, yTop + 0.5, right - x1 - 1, yBot - yTop - 1);
      ctx.fillStyle = `${base}0.95)`;
      ctx.font = "11px Inter, Tahoma, sans-serif";
      ctx.textAlign = "left";
      ctx.fillText(`${z.score}/100 · ${z.status}`, x1 + 6, Math.max(yTop + 13, 13));
    }
  }

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="h-full w-full" />
      <canvas ref={overlayRef} className="pointer-events-none absolute inset-0" />
    </div>
  );
}
