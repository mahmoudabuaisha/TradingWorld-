import type { FastifyInstance } from "fastify";
import websocket from "@fastify/websocket";
import { findInstrument, isTimeframe, type Timeframe } from "@tradingworld/shared";
import type { AppContext } from "../context.js";
import type { CandleUpdate } from "../providers/types.js";

type ClientMsg = { type: "subscribe"; symbol: string; timeframe: string } | { type: "unsubscribe" } | { type: "ping" };

/**
 * /ws — one subscription per socket: {type:"subscribe", symbol, timeframe}.
 * Server pushes: candle (every tick), analysis (on candle close or every ~15s), alert (when triggered), status.
 */
export default async function realtime(app: FastifyInstance, ctx: AppContext) {
  await app.register(websocket);

  app.get("/ws", { websocket: true }, (socket) => {
    let unsub: (() => void) | undefined;
    let analysisTimer: NodeJS.Timeout | undefined;
    let current: { symbol: string; timeframe: Timeframe } | undefined;
    const send = (o: unknown) => { if (socket.readyState === 1) socket.send(JSON.stringify(o)); };

    const offAlert = ctx.alerts.onTrigger((e) => { if (current && e.alert.symbol === current.symbol) send({ type: "alert", event: e }); });

    const pushAnalysis = async () => {
      if (!current) return;
      try {
        const r = await ctx.analysis.run(current.symbol, current.timeframe, { force: true });
        send({ type: "analysis", result: r });
        await ctx.alerts.evaluate(current.symbol, r.lastPrice, r);
      } catch (e) { send({ type: "error", message: (e as Error).message }); }
    };

    const cleanup = () => { unsub?.(); unsub = undefined; if (analysisTimer) clearInterval(analysisTimer); analysisTimer = undefined; current = undefined; };

    socket.on("message", async (raw: Buffer) => {
      let msg: ClientMsg;
      try { msg = JSON.parse(raw.toString()) as ClientMsg; } catch { return send({ type: "error", message: "BAD_JSON" }); }
      if (msg.type === "ping") return send({ type: "pong", at: Date.now() });
      if (msg.type === "unsubscribe") return cleanup();
      if (msg.type === "subscribe") {
        const instrument = findInstrument(msg.symbol);
        if (!instrument || !isTimeframe(msg.timeframe)) return send({ type: "error", message: "BAD_SUBSCRIPTION" });
        cleanup();
        current = { symbol: instrument.symbol, timeframe: msg.timeframe };
        const provider = ctx.providers.for(instrument);
        send({ type: "status", provider: provider.status() });
        unsub = provider.subscribe(instrument, msg.timeframe, (u: CandleUpdate) => {
          send({ type: "candle", update: u });
          if (u.closed) void pushAnalysis();
          else void ctx.alerts.evaluate(u.symbol, u.candle.close);
        });
        analysisTimer = setInterval(pushAnalysis, 15_000);
        void pushAnalysis();
      }
    });
    socket.on("close", () => { cleanup(); offAlert(); });
  });
}
