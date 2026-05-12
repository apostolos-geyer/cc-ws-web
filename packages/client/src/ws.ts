// WS client — thin nanostores facade over `wsClientTransport` from
// `@somewhatintelligent/cc-protocol`. Phase 4: the actual socket plumbing
// moved to the protocol package's universal transport; this file keeps the
// existing `WsClient` contract (status atom, lastError atom, connect /
// disconnect / send / onFrame) so `createCcSession` and tests don't need
// to change.
//
// Does NOT auto-reconnect by default — preserves the existing behavior of
// `createWsClient`. Consumers who want reconnect should switch to
// `createReactiveClient` from `./reactive.ts` which wires the same transport
// with backoff configured.
//
// NDJSON on the wire: each send is a single JSON object; bridge splits
// inbound on `\n`.

import { atom, type WritableAtom } from "nanostores";
import { wsClientTransport, type WsClientTransport } from "@somewhatintelligent/cc-protocol/transport/ws-client";
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
  let transport: WsClientTransport | null = null;
  let unsubFrame: (() => void) | null = null;
  let disconnected = false;

  function connect() {
    if (transport && !transport.closed) {
      return;
    }
    disconnected = false;
    status.set("connecting");
    lastError.set(null);
    transport = wsClientTransport(opts.url, {
      onOpen() {
        status.set("open");
      },
      onSocketClose() {
        // Only flip if the user didn't explicitly disconnect (otherwise
        // disconnect() already set the state).
        if (!disconnected) status.set("closed");
        if (transport && !transport.closed) {
          // Reconnect disabled — drop the transport handle.
          transport = null;
        }
      },
    });
    unsubFrame = transport.onFrame((frame) => {
      // The protocol transport already JSON.parses; mirror the trace shape
      // the legacy client emitted (line-form).
      try {
        opts.onTrace?.("in", JSON.stringify(frame));
      } catch {
        // ignore JSON errors in trace
      }
      for (const h of handlers) {
        try {
          h(frame as InboundFrame);
        } catch (err) {
          // One handler throwing must not stop the others
          console.error("[ws] handler error", err);
        }
      }
    });
  }

  function disconnect() {
    disconnected = true;
    if (unsubFrame) {
      unsubFrame();
      unsubFrame = null;
    }
    if (transport) {
      transport.close().catch(() => undefined);
      transport = null;
    }
    status.set("closed");
  }

  function send(frame: OutboundFrame) {
    if (!transport || transport.closed) return;
    try {
      opts.onTrace?.("out", JSON.stringify(frame));
    } catch {
      // ignore
    }
    transport.send(frame).catch((err: unknown) => {
      // wsClientTransport rejects when not open; legacy behavior was a
      // silent drop. Preserve that.
      console.warn("[ws] send rejected:", err);
    });
  }

  function onFrame(handler: (f: InboundFrame) => void) {
    handlers.add(handler);
    return () => {
      handlers.delete(handler);
    };
  }

  return { status, lastError, connect, disconnect, send, onFrame };
}
