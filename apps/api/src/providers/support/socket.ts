/**
 * Small reconnecting WebSocket used by the streaming adapters: exponential backoff, optional heartbeat,
 * and an `onOpen` hook so each adapter re-authenticates / re-subscribes after a reconnect.
 * Node ≥ 22 ships a global WebSocket; tests inject a fake constructor.
 */
export interface SocketHandlers {
  onOpen?: (send: (data: unknown) => void) => void;
  onMessage: (data: string) => void;
  onClose?: (reason: string) => void;
}

export interface SocketOptions {
  WebSocketCtor?: typeof WebSocket;
  minBackoffMs?: number;
  maxBackoffMs?: number;
  heartbeat?: { everyMs: number; payload: unknown };
}

export class ReconnectingSocket {
  private ws?: WebSocket;
  private closed = false;
  private attempt = 0;
  private timer?: NodeJS.Timeout;
  private heartbeat?: NodeJS.Timeout;
  readonly stats = { connects: 0, drops: 0, messages: 0 };

  constructor(private readonly url: string, private readonly handlers: SocketHandlers, private readonly opts: SocketOptions = {}) {}

  get connected(): boolean { return this.ws?.readyState === 1; }

  open(): void {
    if (this.closed) return;
    const Ctor = this.opts.WebSocketCtor ?? globalThis.WebSocket;
    if (!Ctor) { this.handlers.onClose?.("WebSocket is not available in this runtime"); return; }
    const ws = new Ctor(this.url);
    this.ws = ws;
    ws.onopen = () => {
      this.attempt = 0;
      this.stats.connects++;
      this.handlers.onOpen?.((d) => this.send(d));
      if (this.opts.heartbeat) {
        this.heartbeat = setInterval(() => this.send(this.opts.heartbeat!.payload), this.opts.heartbeat.everyMs);
      }
    };
    ws.onmessage = (ev) => { this.stats.messages++; this.handlers.onMessage(typeof ev.data === "string" ? ev.data : String(ev.data)); };
    ws.onerror = () => { /* onclose follows */ };
    ws.onclose = (ev) => {
      if (this.heartbeat) { clearInterval(this.heartbeat); this.heartbeat = undefined; }
      if (this.closed) return;
      this.stats.drops++;
      this.handlers.onClose?.(`closed (${(ev as { code?: number }).code ?? "?"})`);
      const backoff = Math.min(this.opts.maxBackoffMs ?? 30_000, (this.opts.minBackoffMs ?? 1_000) * 2 ** this.attempt++);
      this.timer = setTimeout(() => this.open(), backoff);
    };
  }

  send(data: unknown): boolean {
    if (!this.connected) return false;
    this.ws!.send(typeof data === "string" ? data : JSON.stringify(data));
    return true;
  }

  close(): void {
    this.closed = true;
    if (this.timer) clearTimeout(this.timer);
    if (this.heartbeat) clearInterval(this.heartbeat);
    this.ws?.close();
  }
}
