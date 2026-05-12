#!/usr/bin/env bun
// @somewhatintelligent/cc-ws-server — Bun-based WebSocket server fronting a
// Claude Code child per connection. Phase 4 rewrite: protocol-level glue
// lives in @somewhatintelligent/cc-protocol; this file is now just the
// runtime bridge between a `wsServerTransport` (consumer side) and a
// `spawnTransport` (binary side), keyed by Bun.ServerWebSocket.
//
// The server is a passthrough by design — the consumer (browser) owns the
// protocol state machine (initialize / set_permission_mode / end_session /
// etc.). We deliberately do NOT instantiate `ClaudeProcess` server-side:
// that would have us racing the consumer's `initialize` with our own. The
// bridge's sole responsibilities are:
//
//   1. On `_local:respawn`, end the current spawnTransport and create a new
//      one with the requested args. Reply with `{_local:"respawnResult"}`.
//      No `respawn()` method on either principal — caller-managed via
//      transport recreation (per the architecture).
//   2. For every other inbound frame from the WS, forward to the binary.
//   3. For every frame from the binary, forward to the WS.
//   4. On WS close, kill the child.

import type { ServerWebSocket } from "bun";
import { spawnTransport, type SpawnTransport } from "./transport/spawn";
import { wsServerTransport, type WsServerTransport } from "./transport/ws-server";

export type WsData = {
  childT: SpawnTransport | null;
  wsT: WsServerTransport | null;
  // Subscription on the current spawnTransport so respawn can clean up.
  unsubChild: (() => void) | null;
};

function trace(direction: "IN" | "OUT" | "OUT-LOCAL" | "IN-LOCAL" | "META", payload: string) {
  const ts = new Date().toISOString().slice(11, 23);
  console.log(`[${ts}] ${direction.padEnd(9)} ${payload}`);
}

function attachChild(
  data: WsData,
  ws: ServerWebSocket<WsData>,
  sessionArgs: readonly string[],
): SpawnTransport {
  const child = spawnTransport({
    args: [...sessionArgs],
    onRawLine: (line) => trace("META", `[stdout-raw] ${line}`),
  });
  data.childT = child;
  data.unsubChild = child.onFrame((frame) => {
    if (data.childT !== child) return; // post-respawn — drop late frames
    const line = JSON.stringify(frame);
    trace("OUT", line);
    try { ws.send(line); } catch {
      // ws may be closing
    }
  });
  // Surface child exit so the WS doesn't hang on a dead binary.
  child.exited.then(() => {
    if (data.childT !== child) return;
    trace("META", "claude exited");
    try { ws.close(); } catch {}
  }).catch(() => undefined);
  return child;
}

function detachChild(data: WsData): void {
  if (data.unsubChild) {
    data.unsubChild();
    data.unsubChild = null;
  }
  data.childT = null;
}

// Tests / alternate hosts call createWsData() and pass it via
// srv.upgrade(req, { data: createWsData() }).
export function createWsData(): WsData {
  return { childT: null, wsT: null, unsubChild: null };
}

export const websocket = {
  open(ws: ServerWebSocket<WsData>) {
    console.log("[ws] open — awaiting client respawn for session args");
    trace("META", "ws-open awaiting initial _local:respawn");
    ws.data.wsT = wsServerTransport(ws);
  },

  async message(ws: ServerWebSocket<WsData>, msg: string | Uint8Array) {
    const text = typeof msg === "string" ? msg : new TextDecoder().decode(msg);

    let parsed: unknown;
    try { parsed = JSON.parse(text); } catch {
      // Non-JSON; ignore
      return;
    }
    const p = parsed as Record<string, unknown> | null;
    const isLocal = !!p && typeof p._local === "string";
    if (isLocal) trace("IN-LOCAL", text);
    else trace("IN", text);

    if (p && p._local === "respawn") {
      const argsArr = Array.isArray(p.args)
        ? (p.args as unknown[]).filter((a): a is string => typeof a === "string")
        : Array.isArray((p as { extraArgs?: unknown }).extraArgs)
          ? ((p as { extraArgs: unknown[] }).extraArgs).filter((a): a is string => typeof a === "string")
          : [];
      const requestId = typeof p.requestId === "string" ? p.requestId : "";
      trace("META", `respawn requested with args=${JSON.stringify(argsArr)}`);
      try {
        // Tear down current child if any. We bypass the protocol-level
        // end_session handshake: this is a hard respawn driven by the
        // consumer changing session args (--continue / --resume / etc).
        const prev = ws.data.childT;
        detachChild(ws.data);
        if (prev) {
          try { await prev.close(); } catch {}
        }
        attachChild(ws.data, ws, argsArr);
        const reply = JSON.stringify({ _local: "respawnResult", requestId, ok: true });
        trace("OUT-LOCAL", reply);
        try { ws.send(reply); } catch {}
      } catch (err) {
        console.error("[ws] _local respawn error", err);
        trace("META", "respawn error: " + String(err));
        try {
          ws.send(JSON.stringify({ _local: "respawnResult", requestId, ok: false, error: String(err) }));
        } catch {}
      }
      return;
    }

    const child = ws.data.childT;
    if (!child) return;
    try {
      await child.send(parsed);
    } catch (err) {
      console.error("[ws] child send error", err);
    }
  },

  close(ws: ServerWebSocket<WsData>) {
    console.log("[ws] close — killing claude");
    const prev = ws.data.childT;
    detachChild(ws.data);
    if (prev) {
      prev.close().catch(() => undefined);
    }
    if (ws.data.wsT) {
      ws.data.wsT.shutdown();
      ws.data.wsT = null;
    }
  },
};

// ---------- public entry: startServer() ----------
//
// This package is JUST the WebSocket bridge. It does not serve HTML, static
// files, or bundled JS — that's a host concern. Two ways to consume:
//
//   1. Standalone runnable:    `bun src/server.ts` (or `cc-ws-server` via bin)
//      starts a bare WS-only server on PORT (default 3000) at /ws. No HTTP
//      surface beyond the upgrade endpoint.
//
//   2. Embedded in your own Bun.serve:
//        import { websocket, createWsData } from "@somewhatintelligent/cc-ws-server";
//        Bun.serve<WsData>({
//          fetch(req, srv) {
//            if (new URL(req.url).pathname === "/ws") {
//              if (srv.upgrade(req, { data: createWsData() })) return;
//              return new Response("expected ws upgrade", { status: 426 });
//            }
//            // your own static / api / etc.
//          },
//          websocket,
//        });

export type StartServerOptions = {
  port?: number;
  /** Path the WS endpoint is mounted at (default "/ws"). */
  wsPath?: string;
};

export function startServer(options: StartServerOptions = {}) {
  const port = options.port ?? 3000;
  const wsPath = options.wsPath ?? "/ws";

  const server = Bun.serve<WsData, never>({
    port,
    fetch(req, srv) {
      const url = new URL(req.url);
      if (url.pathname === wsPath) {
        if (srv.upgrade(req, { data: createWsData() })) return;
        return new Response("expected ws upgrade", { status: 426 });
      }
      return new Response("not found", { status: 404 });
    },
    websocket,
  });

  console.log(`[cc-ws/server] listening on ws://localhost:${port}${wsPath}`);
  return server;
}

if (import.meta.main) {
  startServer({ port: Number(Bun.env.PORT ?? 3000) });
}
