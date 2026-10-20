import type { FastifyInstance } from "fastify";
import websocket from "@fastify/websocket";
import { findInstrument, isTimeframe, type Instrument, type Timeframe } from "@tradingworld/shared";
import type { AppContext } from "../context.js";
import type { CandleUpdate } from "../providers/types.js";

type ClientMsg = { type: "subscribe"; symbol: string; timeframe: string; includeLowQuality?: boolean; includeInvalidated?: boolean; token?: string } | { type: "auth"; token?: string } | { type: "unsubscribe" } | { type: "ping" };

/**
 * /ws — one subscription per socket: {type:"subscribe", symbol, timeframe, includeLowQuality?, includeInvalidated?}.
 * Server pushes: candle (every tick), analysis (on candle close or every ~15s), alert (when triggered),
 * status (provider health + this instrument's feed state, on subscribe and with every analysis push).
 */
export default async function realtime(app: FastifyInstance, ctx: AppContext) {
  await app.register(websocket);

  app.get("/ws", { websocket: true }, (socket) => {
    let unsub: (() => void) | undefined;
    let analysisTimer: NodeJS.Timeout | undefined;
    let current: { symbol: string; instrument: Instrument; timeframe: Timeframe; includeLowQuality: boolean; includeInvalidated: boolean } | undefined;
    const send = (o: unknown) => { if (socket.readyState === 1) socket.send(JSON.stringify(o)); };

    // alerts and notifications are private: only the owner's sockets receive them (the token identifies the socket)
    let userId: string | undefined;
    const authenticate = (token?: string) => {
      if (!token) return;
      try { userId = (app.jwt.verify(token) as { id: string }).id; } catch { userId = undefined; send({ type: "error", message: "BAD_TOKEN" }); }
    };
    const offAlert = ctx.alerts.onTrigger((e) => { if (userId && e.alert.userId === userId) send({ type: "alert", event: e }); });
    const offNotify = ctx.notifications.onNotify((n) => { if (userId && n.userId === userId) { const { userId: _u, ...rest } = n; send({ type: "notification", notification: rest }); } });

    const pushStatus = () => {
      if (!current) return;
      const provider = ctx.providers.for(current.instrument);
      send({ type: "status", provider: provider.status(), feed: ctx.providers.feed(current.instrument) });
    };

    const pushAnalysis = async () => {
      if (!current) return;
      pushStatus();
      try {
        const r = await ctx.analysis.run(current.symbol, current.timeframe, { force: true, includeLowQuality: current.includeLowQuality, includeInvalidated: current.includeInvalidated });
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
      if (msg.type === "auth") return authenticate(msg.token);
      if (msg.type === "subscribe") {
        const instrument = findInstrument(msg.symbol);
        if (!instrument || !isTimeframe(msg.timeframe)) return send({ type: "error", message: "BAD_SUBSCRIPTION" });
        cleanup();
        if (msg.token) authenticate(msg.token);
        current = { symbol: instrument.symbol, instrument, timeframe: msg.timeframe, includeLowQuality: msg.includeLowQuality === true, includeInvalidated: msg.includeInvalidated === true };
        const provider = ctx.providers.for(instrument);
        pushStatus();
        unsub = provider.subscribe(instrument, msg.timeframe, (u: CandleUpdate) => {
          send({ type: "candle", update: u });
          if (u.closed) void pushAnalysis();
          else void ctx.alerts.evaluate(u.symbol, u.candle.close);
        });
        analysisTimer = setInterval(pushAnalysis, 15_000);
        void pushAnalysis();
      }
    });
    socket.on("close", () => { cleanup(); offAlert(); offNotify(); });
  });
}
