"use client";
import { useEffect, useRef } from "react";
import type { IChartApi, ISeriesApi, UTCTimestamp, IPriceLine, LineStyle, Logical } from "lightweight-charts";
import type { AnalysisResult, Candle, Zone } from "@tradingworld/analysis-engine";
import {
  DRAWING_POINTS,
  fibLevels,
  hitTest,
  logicalToTime,
  timeToLogical,
  type Drawing,
  type DrawingKind,
  type DrawingPixels,
  type DrawingPoint,
} from "@tradingworld/shared";
import { useTokens, type Tokens } from "@/hooks/useTokens";
import type { Tool } from "./DrawingToolbar";

export interface ChartTrade {
  id: string;
  entry: number;
  stopLoss: number;
  takeProfit?: number;
  direction: "long" | "short";
}

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
  /** UI-01: the human's drawings (chalk), the active tool and the bar duration used to place points between bars */
  drawings?: Drawing[];
  tool?: Tool;
  stepSeconds?: number;
  selectedDrawingId?: string;
  onSelectDrawing?: (id?: string) => void;
  onCreateDrawing?: (kind: DrawingKind, points: DrawingPoint[]) => void;
  onUpdateDrawing?: (id: string, points: DrawingPoint[]) => void;
  /** a drawing was completed: the workspace returns to the select tool */
  onToolDone?: () => void;
}

interface Pending {
  kind: DrawingKind;
  points: DrawingPoint[];
  hover?: DrawingPoint;
}
interface Drag {
  id: string;
  part: "body" | number;
  startLogical: number;
  startPrice: number;
  orig: DrawingPoint[];
  preview?: DrawingPoint[];
  moved: boolean;
}

const MONO = "IBM Plex Mono, ui-monospace, monospace";

/**
 * lightweight-charts (Apache-2.0) + the Kharita survey overlay:
 * zones as hatched elevation bands (hatch direction = demand/supply) with contour lines and mono labels,
 * a stamp on recently invalidated zones, a leader line from the survey callout to the selected zone,
 * a distance dimension from price to the selected zone, and open trades as dimension lines.
 */
export function TradingChart({
  candles,
  analysis,
  liveCandle,
  precision,
  selectedZoneId,
  onSelectZone,
  showStructure = true,
  showLevels = true,
  calloutAnchor,
  trades,
  drawings = [],
  tool = "select",
  stepSeconds = 300,
  selectedDrawingId,
  onSelectDrawing,
  onCreateDrawing,
  onUpdateDrawing,
  onToolDone,
}: Props) {
  const tokens = useTokens();
  const wrapRef = useRef<HTMLDivElement>(null);
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
  // drawings (UI-01): refs so the native pointer listeners always see current values
  const drawingsRef = useRef(drawings);
  const toolRef = useRef<Tool>(tool);
  const stepRef = useRef(stepSeconds);
  const selDrawingRef = useRef(selectedDrawingId);
  const timesRef = useRef<number[]>([]);
  const pendingRef = useRef<Pending | undefined>(undefined);
  const dragRef = useRef<Drag | undefined>(undefined);
  const suppressClickUntil = useRef(0);
  const cbRef = useRef({ onSelectDrawing, onCreateDrawing, onUpdateDrawing, onToolDone });
  drawingsRef.current = drawings;
  toolRef.current = tool;
  stepRef.current = stepSeconds;
  selDrawingRef.current = selectedDrawingId;
  cbRef.current = { onSelectDrawing, onCreateDrawing, onUpdateDrawing, onToolDone };
  {
    const t = candles.map((c) => c.time);
    if (liveCandle && (!t.length || liveCandle.time > t[t.length - 1]!)) t.push(liveCandle.time);
    timesRef.current = t;
  }
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
        crosshair: {
          mode: lc.CrosshairMode.Normal,
          vertLine: { color: tokens.ink3, labelBackgroundColor: tokens.raised },
          horzLine: { color: tokens.ink3, labelBackgroundColor: tokens.raised },
        },
        rightPriceScale: { borderColor: tokens.rule },
        timeScale: { borderColor: tokens.rule, timeVisible: true, secondsVisible: false, rightOffset: 8 },
        // explicit locale: tick formatting otherwise uses navigator.language, and an invalid tag (e.g. "en-US@posix"
        // from a POSIX environment) throws on every paint and leaves the chart blank; Latin digits also match the mono labels
        localization: { locale: "en-US", priceFormatter: (p: number) => p.toFixed(precision) },
        autoSize: true,
      });
      const series = chart.addCandlestickSeries({
        upColor: tokens.up,
        downColor: tokens.field,
        wickUpColor: tokens.up,
        wickDownColor: tokens.down,
        borderUpColor: tokens.up,
        borderDownColor: tokens.down,
        borderVisible: true,
        priceFormat: { type: "price", precision, minMove: 1 / 10 ** precision },
      });
      chartRef.current = chart;
      seriesRef.current = series;
      chart.timeScale().subscribeVisibleLogicalRangeChange(() => draw());
      chart.subscribeClick((p) => {
        if (performance.now() < suppressClickUntil.current) return; // that click placed or moved a drawing
        if (!p.point || !seriesRef.current) return;
        const price = seriesRef.current.coordinateToPrice(p.point.y);
        if (price === null) return;
        const hit = zonesRef.current.find((z) => price <= z.top && price >= z.bottom);
        if (hit) onSelectZone?.(hit);
      });
      setData();
    })().catch((e: unknown) => console.error("chart init failed", e));
    return () => {
      disposed = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tokens]);

  useEffect(
    () => () => {
      chartRef.current?.remove();
      chartRef.current = undefined;
      seriesRef.current = undefined;
    },
    [],
  );

  useEffect(() => {
    const chart = chartRef.current,
      s = seriesRef.current;
    if (!chart || !s || !tokens) return;
    chart.applyOptions({
      layout: { background: { color: tokens.field }, textColor: tokens.ink2 },
      grid: { vertLines: { color: tokens.hair }, horzLines: { color: tokens.hair } },
      rightPriceScale: { borderColor: tokens.rule },
      timeScale: { borderColor: tokens.rule },
    });
    s.applyOptions({
      upColor: tokens.up,
      downColor: tokens.field,
      wickUpColor: tokens.up,
      wickDownColor: tokens.down,
      borderUpColor: tokens.up,
      borderDownColor: tokens.down,
    });
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
  // setData/applyAnalysis/draw read the latest props through closures; each effect re-runs on the inputs that change the picture
  useEffect(() => {
    setData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candles]);

  useEffect(() => {
    if (liveCandle && seriesRef.current) {
      seriesRef.current.update({
        time: liveCandle.time as UTCTimestamp,
        open: liveCandle.open,
        high: liveCandle.high,
        low: liveCandle.low,
        close: liveCandle.close,
      });
      draw();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveCandle]);

  function applyAnalysis() {
    const s = seriesRef.current,
      tk = tokensRef.current;
    if (!s || !tk) return;
    priceLinesRef.current.forEach((l) => s.removePriceLine(l));
    priceLinesRef.current = [];
    if (analysis && showLevels) {
      for (const k of analysis.keyLevels.slice(0, 8)) {
        const isBase = k.timeframe === analysis.timeframe;
        priceLinesRef.current.push(
          s.createPriceLine({
            price: k.price,
            color: isBase ? tk.ink3 : tk.ink2,
            lineWidth: 1,
            lineStyle: (isBase ? 4 : 2) as LineStyle,
            axisLabelVisible: true,
            title: k.label,
          }),
        );
      }
    }
    if (analysis && showStructure) {
      s.setMarkers(
        analysis.base.structure.events.slice(-12).map((e) => ({
          time: e.time as UTCTimestamp,
          position: e.direction === "bullish" ? "belowBar" : "aboveBar",
          color: e.direction === "bullish" ? tk.upInk : tk.downInk,
          shape: "circle",
          size: 0.4,
          text: e.kind,
        })),
      );
    } else s.setMarkers([]);
    zonesRef.current = analysis?.zones ?? [];
    draw();
  }
  useEffect(() => {
    applyAnalysis();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analysis, showLevels, showStructure]);
  // the price scale stretches to keep the selected zone in view, so the leader line and the distance dimension always land
  useEffect(() => {
    const s = seriesRef.current;
    if (!s) return;
    const zone = zonesRef.current.find((z) => z.id === selectedZoneId);
    s.applyOptions({
      autoscaleInfoProvider: (
        original: () => { priceRange: { minValue: number; maxValue: number } | null; margins?: { above: number; below: number } } | null,
      ) => {
        const res = original();
        if (!res || !res.priceRange || !zone) return res;
        return {
          ...res,
          priceRange: { minValue: Math.min(res.priceRange.minValue, zone.bottom), maxValue: Math.max(res.priceRange.maxValue, zone.top) },
        };
      },
    });
    // toggling autoScale forces the price scale to recompute its range with the new provider
    const ps = chartRef.current?.priceScale("right");
    ps?.applyOptions({ autoScale: false });
    ps?.applyOptions({ autoScale: true });
    draw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedZoneId, analysis]);
  useEffect(() => {
    draw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calloutAnchor, trades, drawings, selectedDrawingId]);

  // a drawing tool takes the pointer: the chart must not pan or zoom under it; switching tools drops a half-placed drawing
  useEffect(() => {
    pendingRef.current = undefined;
    const drawing = tool !== "select";
    chartRef.current?.applyOptions({ handleScroll: !drawing, handleScale: !drawing });
    if (wrapRef.current) wrapRef.current.style.cursor = drawing ? "crosshair" : "";
    draw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tool]);

  // ── drawings: geometry (time ↔ fractional bar index, so points sit correctly on any timeframe and in the future area)
  function toX(time: number): number | null {
    const chart = chartRef.current;
    if (!chart || !timesRef.current.length) return null;
    // lightweight-charts maps only whole bar indices (a fractional index comes back as 0), so interpolate between the
    // two neighbouring bars — a drawing made on 5m then sits at the right spot inside a 15m or 1h bar
    const l = timeToLogical(timesRef.current, time, stepRef.current);
    const i = Math.floor(l),
      f = l - i;
    const ts = chart.timeScale();
    const x0 = ts.logicalToCoordinate(i as Logical);
    if (x0 === null) return null;
    if (f === 0) return x0;
    const x1 = ts.logicalToCoordinate((i + 1) as Logical);
    return x1 === null ? null : x0 + (x1 - x0) * f;
  }
  function toY(price: number): number | null {
    return seriesRef.current?.priceToCoordinate(price) ?? null;
  }
  function fromXY(x: number, y: number): DrawingPoint | undefined {
    const chart = chartRef.current,
      series = seriesRef.current;
    if (!chart || !series || !timesRef.current.length) return undefined;
    const l = chart.timeScale().coordinateToLogical(x);
    const price = series.coordinateToPrice(y);
    if (l === null || price === null || price <= 0) return undefined;
    return { time: logicalToTime(timesRef.current, l, stepRef.current), price: Number(price.toFixed(precision + 2)) };
  }
  function pixels(kind: DrawingKind, pts: DrawingPoint[]): DrawingPixels | undefined {
    const xy = pts.map((p) => ({ x: toX(p.time), y: toY(p.price) }));
    if (xy.some((q) => q.x === null || q.y === null)) return undefined;
    const out: DrawingPixels = { kind, pts: xy as { x: number; y: number }[] };
    if (kind === "fib" && pts.length === 2) out.levels = fibLevels(pts[0]!, pts[1]!).map((l) => ({ y: toY(l.price) ?? -1e6 }));
    return out;
  }

  // ── drawings: pointer handling (capture phase, before the chart sees the event)
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const local = (e: PointerEvent) => {
      const r = containerRef.current!.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    const plotRight = () => (containerRef.current?.clientWidth ?? 0) - (chartRef.current?.priceScale("right").width() ?? 0);
    const consume = (e: PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      suppressClickUntil.current = performance.now() + 600;
    };
    const hitAt = (x: number, y: number) => {
      const list = [...drawingsRef.current].reverse(); // topmost (last drawn) first, the selected one before all
      const sel = list.findIndex((d) => d.id === selDrawingRef.current);
      if (sel > 0) list.unshift(...list.splice(sel, 1));
      for (const d of list) {
        const px = pixels(d.kind, d.points);
        const hit = px && hitTest(px, x, y, plotRight());
        if (hit) return { d, hit };
      }
      return undefined;
    };

    const down = (e: PointerEvent) => {
      if (e.button !== 0 || !chartRef.current || !seriesRef.current) return;
      const { x, y } = local(e);
      if (x < 0 || x > plotRight()) return;
      const t = toolRef.current;
      if (t !== "select") {
        const pt = fromXY(x, y);
        if (!pt) return;
        consume(e);
        const p = pendingRef.current ?? { kind: t, points: [] };
        p.points.push(pt);
        p.hover = pt;
        if (p.points.length >= DRAWING_POINTS[t]) {
          pendingRef.current = undefined;
          cbRef.current.onCreateDrawing?.(t, p.points);
          cbRef.current.onToolDone?.();
        } else pendingRef.current = p;
        draw();
        return;
      }
      const found = hitAt(x, y);
      if (!found) {
        if (selDrawingRef.current) cbRef.current.onSelectDrawing?.(undefined);
        return;
      }
      consume(e);
      cbRef.current.onSelectDrawing?.(found.d.id);
      const l = chartRef.current.timeScale().coordinateToLogical(x);
      const price = seriesRef.current.coordinateToPrice(y);
      if (l === null || price === null) return;
      dragRef.current = {
        id: found.d.id,
        part: found.hit.part === "handle" ? found.hit.index : "body",
        startLogical: l,
        startPrice: price,
        orig: found.d.points,
        moved: false,
      };
      chartRef.current.applyOptions({ handleScroll: false, handleScale: false });
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        /* not all pointers can be captured */
      }
    };

    const move = (e: PointerEvent) => {
      const chart = chartRef.current,
        series = seriesRef.current;
      if (!chart || !series) return;
      const { x, y } = local(e);
      const p = pendingRef.current;
      if (p) {
        const pt = fromXY(x, y);
        if (pt) {
          p.hover = pt;
          draw();
        }
        return;
      }
      const dg = dragRef.current;
      if (!dg) {
        if (toolRef.current === "select") el.style.cursor = x <= plotRight() && hitAt(x, y) ? "move" : "";
        return;
      }
      const l = chart.timeScale().coordinateToLogical(x);
      const price = series.coordinateToPrice(y);
      if (l === null || price === null) return;
      const times = timesRef.current,
        step = stepRef.current;
      const round = (v: number) => Number(v.toFixed(precision + 2));
      if (dg.part === "body") {
        const dl = l - dg.startLogical,
          dp = price - dg.startPrice;
        dg.preview = dg.orig.map((q) => ({
          time: logicalToTime(times, timeToLogical(times, q.time, step) + dl, step),
          price: round(q.price + dp),
        }));
      } else {
        dg.preview = dg.orig.map((q, i) => (i === dg.part ? { time: logicalToTime(times, l, step), price: round(price) } : q));
      }
      dg.moved = true;
      draw();
    };

    const up = (e: PointerEvent) => {
      const dg = dragRef.current;
      if (!dg) return;
      dragRef.current = undefined;
      chartRef.current?.applyOptions({ handleScroll: toolRef.current === "select", handleScale: toolRef.current === "select" });
      try {
        el.releasePointerCapture(e.pointerId);
      } catch {
        /* already released */
      }
      suppressClickUntil.current = performance.now() + 600;
      if (dg.moved && dg.preview && dg.preview.every((q) => q.price > 0)) cbRef.current.onUpdateDrawing?.(dg.id, dg.preview);
      draw();
    };

    el.addEventListener("pointerdown", down, true);
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
    return () => {
      el.removeEventListener("pointerdown", down, true);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [precision]);

  function hatch(ctx: CanvasRenderingContext2D, dir: "up" | "down"): CanvasPattern | null {
    const tk = tokensRef.current;
    if (!tk) return null;
    const key = `${tk.up}${tk.down}`;
    if (patternsRef.current.key !== key) patternsRef.current = { key };
    const cached = patternsRef.current[dir];
    if (cached) return cached;
    const off = document.createElement("canvas");
    off.width = 7;
    off.height = 7;
    const c = off.getContext("2d");
    if (!c) return null;
    c.strokeStyle = dir === "up" ? tk.up : tk.down;
    c.globalAlpha = 0.5;
    c.lineWidth = 1;
    c.beginPath();
    if (dir === "up") {
      c.moveTo(0, 7);
      c.lineTo(7, 0);
      c.moveTo(-1, 1);
      c.lineTo(1, -1);
      c.moveTo(6, 8);
      c.lineTo(8, 6);
    } else {
      c.moveTo(0, 0);
      c.lineTo(7, 7);
      c.moveTo(6, -1);
      c.lineTo(8, 1);
      c.moveTo(-1, 6);
      c.lineTo(1, 8);
    }
    c.stroke();
    const p = ctx.createPattern(off, "repeat");
    if (p) patternsRef.current[dir] = p;
    return p;
  }

  function arrowV(ctx: CanvasRenderingContext2D, x: number, y1: number, y2: number) {
    const top = Math.min(y1, y2),
      bot = Math.max(y1, y2);
    ctx.beginPath();
    ctx.moveTo(x, top);
    ctx.lineTo(x, bot);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x - 3.5, top + 6);
    ctx.lineTo(x, top);
    ctx.lineTo(x + 3.5, top + 6);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x - 3.5, bot - 6);
    ctx.lineTo(x, bot);
    ctx.lineTo(x + 3.5, bot - 6);
    ctx.stroke();
  }

  function labelBox(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, color: string, align: CanvasTextAlign = "left") {
    const tk = tokensRef.current!;
    const tw = ctx.measureText(text).width;
    const bx = align === "left" ? x - 3 : align === "right" ? x - tw - 3 : x - tw / 2 - 3;
    ctx.save();
    ctx.fillStyle = tk.field;
    ctx.globalAlpha = 0.8;
    ctx.fillRect(bx, y - 10, tw + 6, 13);
    ctx.restore();
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.fillText(text, x, y);
    ctx.textAlign = "left";
  }

  function draw() {
    const chart = chartRef.current,
      series = seriesRef.current,
      cv = overlayRef.current,
      host = containerRef.current,
      tk = tokensRef.current;
    if (!chart || !series || !cv || !host || !tk) return;
    const dpr = window.devicePixelRatio || 1;
    const w = host.clientWidth,
      h = host.clientHeight;
    cv.width = w * dpr;
    cv.height = h * dpr;
    cv.style.width = `${w}px`;
    cv.style.height = `${h}px`;
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
      const yTop = series.priceToCoordinate(z.top),
        yBot = series.priceToCoordinate(z.bottom);
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
      if (pat) {
        ctx.save();
        ctx.globalAlpha = dead ? 0.2 : weak ? 0.45 : sel ? 1 : 0.8;
        ctx.fillStyle = pat;
        ctx.fillRect(x1, yTop, right - x1, yBot - yTop);
        ctx.restore();
      }
      ctx.strokeStyle = dead ? tk.ink3 : col;
      ctx.lineWidth = sel ? 1.8 : 1.1;
      ctx.setLineDash(dead ? [2, 3] : weak ? [3, 3] : []);
      ctx.beginPath();
      ctx.moveTo(x1, yTop + 0.5);
      ctx.lineTo(right, yTop + 0.5);
      ctx.moveTo(x1, yBot - 0.5);
      ctx.lineTo(right, yBot - 0.5);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
      const label = `${z.score} · ${dir === "up" ? "DEMAND" : "SUPPLY"} · ${z.status}${z.tests ? ` · TESTED x${z.tests}` : ""}`;
      const tw = ctx.measureText(label).width;
      const tall = yBot - yTop >= 18;
      const lx = x1 + 6 + tw + 6 > right ? Math.max(6, right - tw - 6) : x1 + 6;
      const ly = tall ? yTop + 12 : Math.max(yTop - 5, 12);
      const textCol = dead ? tk.ink3 : dir === "up" ? tk.upInk : tk.downInk;
      if (tall) labelBox(ctx, label, lx, ly, textCol);
      else {
        ctx.fillStyle = textCol;
        ctx.fillText(label, lx, ly);
      }
      // the stamp
      if (dead) {
        const bw = right - x1,
          bh = yBot - yTop;
        const text = "INVALIDATED";
        ctx.save();
        ctx.font = `600 10px ${MONO}`;
        const sw = ctx.measureText(text).width + 16;
        const cx = bw >= sw + 20 ? x1 + bw / 2 : Math.max(x1 + sw / 2 + 4, right - sw / 2 - 4);
        const cy = bh >= 24 ? yTop + bh / 2 : yBot + 12;
        ctx.translate(cx, cy);
        ctx.rotate(-0.14);
        ctx.strokeStyle = tk.stamp;
        ctx.lineWidth = 1.5;
        ctx.strokeRect(-sw / 2, -9, sw, 18);
        ctx.fillStyle = tk.field;
        ctx.globalAlpha = 0.7;
        ctx.fillRect(-sw / 2 + 1, -8, sw - 2, 16);
        ctx.globalAlpha = 1;
        ctx.fillStyle = tk.stamp;
        ctx.textAlign = "center";
        ctx.fillText(text, 0, 4);
        ctx.restore();
        ctx.font = `10.5px ${MONO}`;
        ctx.textAlign = "left";
      }
    }

    // ── open trades: dimension lines
    for (const tr of tradesRef.current ?? []) {
      const yE = series.priceToCoordinate(tr.entry),
        yS = series.priceToCoordinate(tr.stopLoss),
        yT = tr.takeProfit !== undefined ? series.priceToCoordinate(tr.takeProfit) : null;
      if (yE === null || yS === null) continue;
      const line = (y: number, color: string, dash: number[], text: string) => {
        ctx.save();
        ctx.strokeStyle = color;
        ctx.lineWidth = 1;
        ctx.setLineDash(dash);
        ctx.beginPath();
        ctx.moveTo(0, y + 0.5);
        ctx.lineTo(right, y + 0.5);
        ctx.stroke();
        ctx.restore();
        labelBox(ctx, text, 8, y - 4, color);
      };
      line(yE, tk.ink, [], `ENTRY ${tr.entry.toFixed(precision)} · ${tr.direction.toUpperCase()}`);
      line(yS, tk.downInk, [5, 4], `SL ${tr.stopLoss.toFixed(precision)}`);
      if (yT !== null && tr.takeProfit !== undefined) line(yT, tk.upInk, [5, 4], `TP ${tr.takeProfit.toFixed(precision)}`);
      const risk = Math.abs(tr.entry - tr.stopLoss) || 1;
      const dx = 150;
      ctx.strokeStyle = tk.ink;
      ctx.lineWidth = 1;
      arrowV(ctx, dx, yS, yE);
      labelBox(ctx, `1.0R · ${risk.toFixed(precision)}`, dx + 8, (yS + yE) / 2 + 4, tk.ink);
      if (yT !== null && tr.takeProfit !== undefined) {
        arrowV(ctx, dx, yE, yT);
        labelBox(
          ctx,
          `${(Math.abs(tr.takeProfit - tr.entry) / risk).toFixed(1)}R · ${Math.abs(tr.takeProfit - tr.entry).toFixed(precision)}`,
          dx + 8,
          (yE + yT) / 2 + 4,
          tk.ink,
        );
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
        ctx.strokeStyle = tk.ink;
        ctx.lineWidth = 1;
        arrowV(ctx, x, yPrice, yEdge);
        ctx.beginPath();
        ctx.moveTo(x - 5, yPrice + 0.5);
        ctx.lineTo(x + 5, yPrice + 0.5);
        ctx.stroke();
        const ratio = last.atr > 0 ? dist / last.atr : 0;
        const text = last.atr > 0 ? `${dist.toFixed(precision)} · ${ratio.toFixed(ratio < 1 ? 2 : 1)}×ATR` : dist.toFixed(precision);
        labelBox(ctx, text, x - 8, (yPrice + yEdge) / 2 + 4, tk.ink, "right");
      }
      const a = anchorRef.current;
      if (a) {
        const pinX = Math.min(Math.max(a.x, x1 + 14), right - 14);
        const pinY = a.y > yBot ? yBot : yTop;
        ctx.strokeStyle = tk.ink;
        ctx.lineWidth = 1;
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(a.x, a.y - 14);
        ctx.lineTo(pinX, pinY);
        ctx.stroke();
        ctx.fillStyle = tk.ink;
        ctx.beginPath();
        ctx.arc(pinX, pinY, 3.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(a.x, a.y, 2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // ── the human's drawings, in chalk, above the engine's marks
    const dg = dragRef.current;
    for (const d of drawingsRef.current)
      renderDrawing(
        ctx,
        d.kind,
        dg && dg.id === d.id && dg.preview ? dg.preview : d.points,
        right,
        tk,
        d.id === selDrawingRef.current,
        false,
      );
    const pend = pendingRef.current;
    if (pend) {
      const pts = pend.hover ? [...pend.points, pend.hover] : pend.points;
      if (pts.length >= DRAWING_POINTS[pend.kind])
        renderDrawing(ctx, pend.kind, pts.slice(0, DRAWING_POINTS[pend.kind]), right, tk, false, true);
    }
  }

  /** Draw one drawing in chalk (the human colour). `ghost` = being placed. */
  function renderDrawing(
    ctx: CanvasRenderingContext2D,
    kind: DrawingKind,
    pts: DrawingPoint[],
    right: number,
    tk: Tokens,
    sel: boolean,
    ghost: boolean,
  ) {
    const px = pixels(kind, pts);
    if (!px) return;
    const chalk = tk.ink;
    ctx.save();
    ctx.strokeStyle = chalk;
    ctx.fillStyle = chalk;
    ctx.lineWidth = sel ? 2 : 1.5;
    ctx.setLineDash(ghost ? [5, 4] : []);
    const [a, b] = px.pts;
    if (kind === "hline" && a) {
      ctx.beginPath();
      ctx.moveTo(0, a.y + 0.5);
      ctx.lineTo(right, a.y + 0.5);
      ctx.stroke();
      labelBox(ctx, pts[0]!.price.toFixed(precision), right - 4, a.y - 3, chalk, "right");
    } else if (kind === "trendline" && a && b) {
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    } else if (kind === "rect" && a && b) {
      const x = Math.min(a.x, b.x),
        y = Math.min(a.y, b.y),
        w = Math.abs(b.x - a.x),
        h = Math.abs(b.y - a.y);
      ctx.globalAlpha = 0.07;
      ctx.fillRect(x, y, w, h);
      ctx.globalAlpha = 1;
      ctx.strokeRect(x + 0.5, y + 0.5, w, h);
    } else if (kind === "fib" && a && b && pts.length === 2) {
      const x1 = Math.min(a.x, b.x),
        x2 = Math.max(a.x, b.x);
      ctx.save();
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.globalAlpha = 0.6;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      ctx.restore();
      for (const lv of fibLevels(pts[0]!, pts[1]!)) {
        const y = toY(lv.price);
        if (y === null) continue;
        const key = lv.ratio === 0.5 || lv.ratio === 0.618;
        ctx.globalAlpha = key ? 1 : 0.7;
        ctx.lineWidth = key ? 1.25 : 1;
        ctx.beginPath();
        ctx.moveTo(x1, y + 0.5);
        ctx.lineTo(x2, y + 0.5);
        ctx.stroke();
        ctx.globalAlpha = 1;
        labelBox(ctx, `${lv.ratio} · ${lv.price.toFixed(precision)}`, x1 + 3, y - 3, chalk, "left");
      }
    }
    if (sel || ghost) {
      ctx.setLineDash([]);
      ctx.lineWidth = 1;
      for (const q of px.pts) {
        ctx.fillStyle = tk.field;
        ctx.fillRect(q.x - 3.5, q.y - 3.5, 7, 7);
        ctx.strokeStyle = chalk;
        ctx.strokeRect(q.x - 3.5, q.y - 3.5, 7, 7);
      }
    }
    ctx.restore();
  }

  return (
    <div ref={wrapRef} className="relative h-full w-full">
      <div ref={containerRef} className="h-full w-full" />
      <canvas ref={overlayRef} className="pointer-events-none absolute inset-0 z-[3]" />
    </div>
  );
}
