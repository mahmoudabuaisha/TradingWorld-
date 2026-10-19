import { WS_URL } from "./api";
import type { AnalysisResult, Candle } from "@tradingworld/analysis-engine";
import type { Timeframe } from "@tradingworld/shared";

export type ServerMessage =
  | { type: "candle"; update: { symbol: string; timeframe: Timeframe; candle: Candle; closed: boolean; receivedAt: number } }
  | { type: "analysis"; result: AnalysisResult }
  | { type: "alert"; event: { message: { ar: string; en: string }; price: number } }
  | { type: "status"; provider: { id: string; live: boolean; message?: string } }
  | { type: "error"; message: string }
  | { type: "pong"; at: number };

/** Minimal auto-reconnecting subscription client for /ws. */
export function subscribeMarket(symbol: string, timeframe: Timeframe, onMessage: (m: ServerMessage) => void): () => void {
  let ws: WebSocket | undefined;
  let closed = false;
  let retry = 1000;
  const connect = () => {
    ws = new WebSocket(WS_URL);
    ws.onopen = () => { retry = 1000; ws?.send(JSON.stringify({ type: "subscribe", symbol, timeframe })); };
    ws.onmessage = (ev) => { try { onMessage(JSON.parse(ev.data) as ServerMessage); } catch { /* ignore */ } };
    ws.onclose = () => { if (!closed) { setTimeout(connect, retry); retry = Math.min(retry * 2, 15_000); } };
    ws.onerror = () => ws?.close();
  };
  connect();
  return () => { closed = true; ws?.close(); };
}
