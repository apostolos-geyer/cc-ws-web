// Does NOT auto-reconnect. NDJSON on the wire: each send is a single JSON
// object; bridge splits inbound on `\n`.

import { atom, type WritableAtom } from "nanostores";
import type { InboundFrame, OutboundFrame } from "./protocol";

export type WsStatus =
  | "idle"
  | "connecting"
  | "open"
  | "respawning"
  | "closed"
  | "error";

export type WsClient = {
  status: WritableAtom<WsStatus>;
  lastError: WritableAtom<string | null>;
  connect: () => void;
  disconnect: () => void;
  send: (frame: OutboundFrame) => void;
  // Direct fan-out instead of atom — avoids re-rendering every subscriber per frame
  onFrame: (handler: (frame: InboundFrame) => void) => () => void;
};

export function createWsClient(opts: {
  url: string;
  onTrace?: (dir: "in" | "out", line: string) => void;
}): WsClient {
  const status = atom<WsStatus>("idle");
  const lastError = atom<string | null>(null);
  const handlers = new Set<(f: InboundFrame) => void>();
  let ws: WebSocket | null = null;

  function connect() {
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
      return;
    }
    status.set("connecting");
    lastError.set(null);
    ws = new WebSocket(opts.url);
    ws.onopen = () => status.set("open");
    ws.onclose = () => {
      ws = null;
      status.set("closed");
    };
    ws.onerror = () => {
      lastError.set("ws error");
      status.set("error");
    };
    ws.onmessage = (e) => {
      const text = typeof e.data === "string" ? e.data : "";
      if (!text) return;
      opts.onTrace?.("in", text);
      let parsed: InboundFrame;
      try {
        parsed = JSON.parse(text);
      } catch {
        // One bad frame must not take down the session
        return;
      }
      for (const h of handlers) {
        try {
          h(parsed);
        } catch (err) {
          // One handler throwing must not stop the others
          console.error("[ws] handler error", err);
        }
      }
    };
  }

  function disconnect() {
    if (ws) {
      try { ws.close(); } catch {}
      ws = null;
    }
    status.set("closed");
  }

  function send(frame: OutboundFrame) {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    const line = JSON.stringify(frame);
    opts.onTrace?.("out", line);
    ws.send(line);
  }

  function onFrame(handler: (f: InboundFrame) => void) {
    handlers.add(handler);
    return () => {
      handlers.delete(handler);
    };
  }

  return { status, lastError, connect, disconnect, send, onFrame };
}
