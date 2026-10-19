"use client";
import { useEffect, useRef } from "react";
import type { IChartApi, ISeriesApi, UTCTimestamp, IPriceLine, LineStyle } from "lightweight-charts";
import type { AnalysisResult, Candle, Zone } from "@tradingworld/analysis-engine";
import { useTokens, type Tokens } from "@/hooks/useTokens";

export interface ChartTrade { id: string; entry: number; stopLoss: number; takeProfit?: number; direction: "long" | "short" }

interface Props {
  candles: Candle[];
  analysis?: AnalysisResult;
  liveCandle?: Candle;
  precision: number;
  selectedZoneId?: string;
  onSelectZone?: (z: Zone) => void;
  showStructure?: boolean;
  showLevels?: boolean;
  /** container-relative pixel point (top-centre of the survey callout) the leader line starts from */
  calloutAnchor?: { x: number; y: number };
  /** open trades on this instrument, drawn as dimension lines */
  trades?: ChartTrade[];
}

const MONO = "IBM Plex Mono, ui-monospace, monospace";

/**
 * lightweight-charts (Apache-2.0) + the Kharita survey overlay:
 * zones as hatched elevation bands (hatch direction = demand/supply) with contour lines and mono labels,
 * a stamp on recently invalidated zones, a leader line from the survey callout to the selected zone,
 * a distance dimension from price to the selected zone, and open trades as dimension lines.
 */
export function TradingChart({ candles, analysis, liveCandle, precision, selectedZoneId, onSelectZone, showStructure = true, showLevels = true, calloutAnchor, trades }: Props) {
  const tokens = useTokens();
  const containerRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<IChartApi | undefined>(undefined);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | undefined>(undefined);
  const priceLinesRef = useRef<IPriceLine[]>([]);
  const zonesRef = useRef<Zone[]>([]);
  const selectedRef = useRef<string | undefined>(selectedZoneId);
  const tokensRef = useRef<Tokens | undefined>(tokens);
  const anchorRef = useRef(calloutAnchor);
  const tradesRef = useRef(trades);
  const lastRef = useRef<{ price: number; atr: number } | undefined>(undefined);
  const patternsRef = useRef<{ up?: CanvasPattern; down?: CanvasPattern; key?: string }>({});
  selectedRef.current = selectedZoneId;
  tokensRef.current = tokens;
  anchorRef.current = calloutAnchor;
  tradesRef.current = trades;
  const lastClose = liveCandle?.close ?? candles[candles.length - 1]?.close;
  lastRef.current = lastClose !== undefined ? { price: lastClose, atr: analysis?.base.atr ?? 0 } : undefined;

  useEffect(() => {
    if (!tokens || chartRef.current) return;
    let disposed = false;
    (async () => {
      const lc = await import("lightweight-charts");
      if (disposed || !containerRef.current || chartRef.current) return;
      const chart = lc.createChart(containerRef.current, {
        layout: { background: { color: tokens.field }, textColor: tokens.ink2, fontFamily: MONO, fontSize: 11 },
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
      chart.timeScale().subscribeVisibleLogicalRangeChange(() => draw());
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
    draw();
  };
  useEffect(() => { setData(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [candles]);

  useEffect(() => {
    if (liveCandle && seriesRef.current) {
      seriesRef.current.update({ time: liveCandle.time as UTCTimestamp, open: liveCandle.open, high: liveCandle.high, low: liveCandle.low, close: liveCandle.close });
      draw();
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
    draw();
  }
  useEffect(() => { applyAnalysis(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [analysis, showLevels, showStructure]);
  // the price scale stretches to keep the selected zone in view, so the leader line and the distance dimension always land
  useEffect(() => {
    const s = seriesRef.current;
    if (!s) return;
    const zone = zonesRef.current.find((z) => z.id === selectedZoneId);
    s.applyOptions({
      autoscaleInfoProvider: (original: () => { priceRange: { minValue: number; maxValue: number } | null; margins?: { above: number; below: number } } | null) => {
        const res = original();
        if (!res || !res.priceRange || !zone) return res;
        return { ...res, priceRange: { minValue: Math.min(res.priceRange.minValue, zone.bottom), maxValue: Math.max(res.priceRange.maxValue, zone.top) } };
      },
    });
    // toggling autoScale forces the price scale to recompute its range with the new provider
    const ps = chartRef.current?.priceScale("right");
    ps?.applyOptions({ autoScale: false });
    ps?.applyOptions({ autoScale: true });
    draw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedZoneId, analysis]);
  useEffect(() => { draw(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [calloutAnchor, trades]);

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
    c.globalAlpha = 0.5; c.lineWidth = 1;
    c.beginPath();
    if (dir === "up") { c.moveTo(0, 7); c.lineTo(7, 0); c.moveTo(-1, 1); c.lineTo(1, -1); c.moveTo(6, 8); c.lineTo(8, 6); }
    else { c.moveTo(0, 0); c.lineTo(7, 7); c.moveTo(6, -1); c.lineTo(8, 1); c.moveTo(-1, 6); c.lineTo(1, 8); }
    c.stroke();
    const p = ctx.createPattern(off, "repeat");
    if (p) patternsRef.current[dir] = p;
    return p;
  }

  function arrowV(ctx: CanvasRenderingContext2D, x: number, y1: number, y2: number) {
    const top = Math.min(y1, y2), bot = Math.max(y1, y2);
    ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x, bot); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x - 3.5, top + 6); ctx.lineTo(x, top); ctx.lineTo(x + 3.5, top + 6); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x - 3.5, bot - 6); ctx.lineTo(x, bot); ctx.lineTo(x + 3.5, bot - 6); ctx.stroke();
  }

  function labelBox(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, color: string, align: CanvasTextAlign = "left") {
    const tk = tokensRef.current!;
    const tw = ctx.measureText(text).width;
    const bx = align === "left" ? x - 3 : align === "right" ? x - tw - 3 : x - tw / 2 - 3;
    ctx.save(); ctx.fillStyle = tk.field; ctx.globalAlpha = 0.8; ctx.fillRect(bx, y - 10, tw + 6, 13); ctx.restore();
    ctx.fillStyle = color; ctx.textAlign = align; ctx.fillText(text, x, y); ctx.textAlign = "left";
  }

  function draw() {
    const chart = chartRef.current, series = seriesRef.current, cv = overlayRef.current, host = containerRef.current, tk = tokensRef.current;
    if (!chart || !series || !cv || !host || !tk) return;
    const dpr = window.devicePixelRatio || 1;
    const w = host.clientWidth, h = host.clientHeight;
    cv.width = w * dpr; cv.height = h * dpr; cv.style.width = `${w}px`; cv.style.height = `${h}px`;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.direction = "ltr";
    const right = w - chart.priceScale("right").width();
    ctx.font = `10.5px ${MONO}`;
    ctx.textAlign = "left";
    let selectedGeom: { x1: number; yTop: number; yBot: number; zone: Zone } | undefined;

    // ── zones: elevation bands
    for (const z of zonesRef.current) {
      const x1raw = chart.timeScale().timeToCoordinate(z.createdTime as UTCTimestamp);
      const x1 = x1raw === null ? 0 : Math.max(0, x1raw);
      const yTop = series.priceToCoordinate(z.top), yBot = series.priceToCoordinate(z.bottom);
      if (yTop === null || yBot === null) continue;
      const dir = z.direction === "bullish" ? "up" : "down";
      const col = dir === "up" ? tk.up : tk.down;
      const sel = z.id === selectedRef.current;
      const weak = z.status === "WEAKENED";
      const dead = z.status === "INVALIDATED";
      if (sel) selectedGeom = { x1, yTop, yBot, zone: z };
      ctx.save();
      if (dead) ctx.globalAlpha = 0.5;
      ctx.fillStyle = dir === "up" ? tk.upWash : tk.downWash;
      ctx.fillRect(x1, yTop, right - x1, yBot - yTop);
      const pat = hatch(ctx, dir);
      if (pat) { ctx.save(); ctx.globalAlpha = dead ? 0.2 : weak ? 0.45 : sel ? 1 : 0.8; ctx.fillStyle = pat; ctx.fillRect(x1, yTop, right - x1, yBot - yTop); ctx.restore(); }
      ctx.strokeStyle = dead ? tk.ink3 : col; ctx.lineWidth = sel ? 1.8 : 1.1;
      ctx.setLineDash(dead ? [2, 3] : weak ? [3, 3] : []);
      ctx.beginPath(); ctx.moveTo(x1, yTop + 0.5); ctx.lineTo(right, yTop + 0.5); ctx.moveTo(x1, yBot - 0.5); ctx.lineTo(right, yBot - 0.5); ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
      const label = `${z.score} · ${dir === "up" ? "DEMAND" : "SUPPLY"} · ${z.status}${z.tests ? ` · TESTED x${z.tests}` : ""}`;
      const tw = ctx.measureText(label).width;
      const tall = yBot - yTop >= 18;
      const lx = x1 + 6 + tw + 6 > right ? Math.max(6, right - tw - 6) : x1 + 6;
      const ly = tall ? yTop + 12 : Math.max(yTop - 5, 12);
      if (tall) labelBox(ctx, label, lx, ly, dead ? tk.ink3 : col); else { ctx.fillStyle = dead ? tk.ink3 : col; ctx.fillText(label, lx, ly); }
      // the stamp
      if (dead) {
        const bw = right - x1, bh = yBot - yTop;
        const text = "INVALIDATED";
        ctx.save();
        ctx.font = `600 10px ${MONO}`;
        const sw = ctx.measureText(text).width + 16;
        const cx = bw >= sw + 20 ? x1 + bw / 2 : Math.max(x1 + sw / 2 + 4, right - sw / 2 - 4);
        const cy = bh >= 24 ? yTop + bh / 2 : yBot + 12;
        ctx.translate(cx, cy); ctx.rotate(-0.14);
        ctx.strokeStyle = tk.stamp; ctx.lineWidth = 1.5; ctx.strokeRect(-sw / 2, -9, sw, 18);
        ctx.fillStyle = tk.field; ctx.globalAlpha = 0.7; ctx.fillRect(-sw / 2 + 1, -8, sw - 2, 16); ctx.globalAlpha = 1;
        ctx.fillStyle = tk.stamp; ctx.textAlign = "center"; ctx.fillText(text, 0, 4);
        ctx.restore();
        ctx.font = `10.5px ${MONO}`; ctx.textAlign = "left";
      }
    }

    // ── open trades: dimension lines
    for (const tr of tradesRef.current ?? []) {
      const yE = series.priceToCoordinate(tr.entry), yS = series.priceToCoordinate(tr.stopLoss), yT = tr.takeProfit !== undefined ? series.priceToCoordinate(tr.takeProfit) : null;
      if (yE === null || yS === null) continue;
      const line = (y: number, color: string, dash: number[], text: string) => {
        ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = 1; ctx.setLineDash(dash);
        ctx.beginPath(); ctx.moveTo(0, y + 0.5); ctx.lineTo(right, y + 0.5); ctx.stroke(); ctx.restore();
        labelBox(ctx, text, 8, y - 4, color);
      };
      line(yE, tk.ink, [], `ENTRY ${tr.entry.toFixed(precision)} · ${tr.direction.toUpperCase()}`);
      line(yS, tk.down, [5, 4], `SL ${tr.stopLoss.toFixed(precision)}`);
      if (yT !== null && tr.takeProfit !== undefined) line(yT, tk.up, [5, 4], `TP ${tr.takeProfit.toFixed(precision)}`);
      const risk = Math.abs(tr.entry - tr.stopLoss) || 1;
      const dx = 150;
      ctx.strokeStyle = tk.ink; ctx.lineWidth = 1;
      arrowV(ctx, dx, yS, yE);
      labelBox(ctx, `1.0R · ${risk.toFixed(precision)}`, dx + 8, (yS + yE) / 2 + 4, tk.ink);
      if (yT !== null && tr.takeProfit !== undefined) {
        arrowV(ctx, dx, yE, yT);
        labelBox(ctx, `${(Math.abs(tr.takeProfit - tr.entry) / risk).toFixed(1)}R · ${Math.abs(tr.takeProfit - tr.entry).toFixed(precision)}`, dx + 8, (yE + yT) / 2 + 4, tk.ink);
      }
    }

    // ── selected zone: distance dimension + leader line from the callout
    const last = lastRef.current;
    if (selectedGeom && last) {
      const { zone, yTop, yBot, x1 } = selectedGeom;
      const yPrice = series.priceToCoordinate(last.price);
      if (yPrice !== null && (last.price > zone.top || last.price < zone.bottom)) {
        const edge = last.price > zone.top ? zone.top : zone.bottom;
        const yEdge = last.price > zone.top ? yTop : yBot;
        const dist = Math.abs(last.price - edge);
        const x = right - 26;
        ctx.strokeStyle = tk.ink; ctx.lineWidth = 1;
        arrowV(ctx, x, yPrice, yEdge);
        ctx.beginPath(); ctx.moveTo(x - 5, yPrice + 0.5); ctx.lineTo(x + 5, yPrice + 0.5); ctx.stroke();
        const ratio = last.atr > 0 ? dist / last.atr : 0;
        const text = last.atr > 0 ? `${dist.toFixed(precision)} · ${ratio.toFixed(ratio < 1 ? 2 : 1)}×ATR` : dist.toFixed(precision);
        labelBox(ctx, text, x - 8, (yPrice + yEdge) / 2 + 4, tk.ink, "right");
      }
      const a = anchorRef.current;
      if (a) {
        const pinX = Math.min(Math.max(a.x, x1 + 14), right - 14);
        const pinY = a.y > yBot ? yBot : yTop;
        ctx.strokeStyle = tk.ink; ctx.lineWidth = 1; ctx.setLineDash([]);
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(a.x, a.y - 14); ctx.lineTo(pinX, pinY); ctx.stroke();
        ctx.fillStyle = tk.ink; ctx.beginPath(); ctx.arc(pinX, pinY, 3.5, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(a.x, a.y, 2, 0, Math.PI * 2); ctx.fill();
      }
    }
  }

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="h-full w-full" />
      <canvas ref={overlayRef} className="pointer-events-none absolute inset-0 z-[3]" />
    </div>
  );
}
