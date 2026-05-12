/**
 * `wsServerTransport(ws)` — a `Transport` wrapped around a Bun
 * `ServerWebSocket`. The bridge between an incoming WS connection and a
 * `ClaudeProcess` / `ClaudeClient`.
 *
 * Inbound `message` events → `JSON.parse` → `onFrame` handlers.
 * Outbound `send(frame)` → `JSON.stringify` → `ws.send`.
 * `close()` → `ws.close()`.
 *
 * The Bun ServerWebSocket is *dispatch-driven* — Bun calls handler
 * callbacks on the `websocket` config block of `Bun.serve`. This adapter
 * exposes an `attach(message|close)` pair that the host's `websocket`
 * handler should call from inside Bun's own `message` / `close` hooks.
 *
 * Pattern of use:
 *   const wsT = wsServerTransport(ws);
 *   // In Bun.serve's websocket.message(ws, msg):
 *   wsT.deliver(msg);
 *   // In Bun.serve's websocket.close(ws):
 *   wsT.shutdown();
 *
 * (We can't subscribe to events on a Bun.ServerWebSocket directly — it's
 * not EventTarget-shaped — so this delivery API is the Bun-idiomatic
 * shape.)
 */

import type { ServerWebSocket } from "bun";
import type { Frame, Transport } from "@somewhatintelligent/cc-protocol/transport";

export interface WsServerTransport extends Transport {
  /** Deliver an inbound message from Bun's websocket.message handler. */
  deliver(msg: string | Uint8Array | ArrayBuffer): void;
  /** Mark the underlying WS as closed (from websocket.close). */
  shutdown(): void;
}

export function wsServerTransport<T = unknown>(
  ws: ServerWebSocket<T>,
): WsServerTransport {
  const handlers = new Set<(frame: Frame) => void>();
  let closed = false;

  function decode(msg: string | Uint8Array | ArrayBuffer): string {
    if (typeof msg === "string") return msg;
    if (msg instanceof Uint8Array) return new TextDecoder().decode(msg);
    return new TextDecoder().decode(new Uint8Array(msg));
  }

  return {
    async send(frame: Frame): Promise<void> {
      if (closed) throw new Error("wsServerTransport: send after close");
      const text = JSON.stringify(frame);
      // ws.send is synchronous on Bun.
      ws.send(text);
    },
    onFrame(handler) {
      handlers.add(handler);
      return () => {
        handlers.delete(handler);
      };
    },
    async close(): Promise<void> {
      if (closed) return;
      closed = true;
      try {
        ws.close();
      } catch {
        // ignore — ws may already be closed
      }
      handlers.clear();
    },
    get closed() {
      return closed;
    },
    deliver(msg: string | Uint8Array | ArrayBuffer): void {
      if (closed) return;
      const text = decode(msg);
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        return; // ignore non-JSON
      }
      for (const h of [...handlers]) h(parsed);
    },
    shutdown(): void {
      closed = true;
      handlers.clear();
    },
  };
}
