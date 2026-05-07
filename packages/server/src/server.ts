// @cc-ws/server — Bun-based WebSocket server fronting a Claude Code child
// per connection. Speaks the wire protocol documented in @cc-ws/client. The
// server is independently runnable (see bin/start.ts) and embeddable —
// startServer() owns Bun.serve and mounts /ws; an optional staticDir lets
// the same Bun.serve also serve a UI (apps/web uses this).

import type { ServerWebSocket, Subprocess } from "bun";

export type WsData = {
  child: Subprocess<"pipe", "pipe", "inherit"> | null;
  buf: string;
};

// Fixed transport-level flags every spawn needs. The client controls
// everything else (--continue / --resume / --permission-mode / --effort /
// --model / --include-* / etc) by sending a _local:respawn frame after WS
// open. We do NOT spawn until the client tells us how — this puts session
// lifecycle (new / continue / resume) under client control without baking
// choices into the bridge.
const FIXED_CLAUDE_ARGS = [
  "claude",
  "--print",
  "--input-format",
  "stream-json",
  "--output-format",
  "stream-json",
  "--verbose",
] as const;

function trace(direction: "IN" | "OUT" | "OUT-LOCAL" | "IN-LOCAL" | "META", payload: string) {
  const ts = new Date().toISOString().slice(11, 23);
  console.log(`[${ts}] ${direction.padEnd(9)} ${payload}`);
}

function spawnClaude(
  ws: ServerWebSocket<WsData>,
  sessionArgs: readonly string[] = [],
): Subprocess<"pipe", "pipe", "inherit"> {
  const child = Bun.spawn([...FIXED_CLAUDE_ARGS, ...sessionArgs], {
    stdin: "pipe",
    stdout: "pipe",
    stderr: "inherit",
  });
  // Hot-swap the active child synchronously before starting the pump so
  // the pump's identity check (ws.data.child === child) holds on iter 0.
  ws.data.child = child;
  (async () => {
    const decoder = new TextDecoder();
    try {
      for await (const chunk of child.stdout) {
        // The buf is shared with whichever child is currently active. On
        // respawn we hot-swap ws.data.child; the OLD pump must keep
        // draining (so the OS pipe doesn't back up) but must not write
        // into ws.data.buf or ws.send anymore.
        if (ws.data?.child !== child) continue;
        ws.data.buf += decoder.decode(chunk as Uint8Array, { stream: true });
        let nl: number;
        while ((nl = ws.data.buf.indexOf("\n")) !== -1) {
          const line = ws.data.buf.slice(0, nl);
          ws.data.buf = ws.data.buf.slice(nl + 1);
          if (line.trim()) {
            trace("OUT", line);
            try { ws.send(line); } catch {}
          }
        }
      }
    } catch (err) {
      console.error("[ws] stdout pump error", err);
      trace("META", "stdout pump error: " + String(err));
    }
    if (ws.data?.child === child) {
      console.log("[ws] claude stdout closed");
      trace("META", "claude stdout closed");
      try { ws.close(); } catch {}
    } else {
      trace("META", "old claude stdout closed (post-respawn)");
    }
  })();
  return child;
}

// The websocket handler. Exported so tests / alternate hosts can mount it
// onto their own Bun.serve. Most callers should use startServer() below.
//
// IMPORTANT: when calling srv.upgrade() pass `{ data: createWsData() }` so
// the typed WsData arrives initialized. open() no longer assigns ws.data.
export function createWsData(): WsData {
  return { child: null, buf: "" };
}

export const websocket = {
  open(_ws: ServerWebSocket<WsData>) {
    console.log("[ws] open — awaiting client respawn for session args");
    trace("META", "ws-open awaiting initial _local:respawn");
  },

  async message(ws: ServerWebSocket<WsData>, msg: string | Uint8Array) {
    const text = typeof msg === "string" ? msg : new TextDecoder().decode(msg);

    let parsed: any;
    try { parsed = JSON.parse(text); } catch {}
    if (parsed?._local) trace("IN-LOCAL", text);
    else trace("IN", text);

    if (parsed?._local === "respawn") {
      // {args:[...]} (client lib) takes precedence; {extraArgs:[...]} is
      // accepted for backwards compatibility with the older append-only shape.
      const argsArr = Array.isArray(parsed.args)
        ? parsed.args.filter((a: unknown): a is string => typeof a === "string")
        : Array.isArray(parsed.extraArgs)
          ? parsed.extraArgs.filter((a: unknown): a is string => typeof a === "string")
          : [];
      const requestId = typeof parsed.requestId === "string" ? parsed.requestId : "";
      trace("META", `respawn requested with args=${JSON.stringify(argsArr)}`);
      try {
        try { ws.data?.child?.kill(); } catch {}
        ws.data.buf = "";
        spawnClaude(ws, argsArr);
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

    if (!ws.data?.child?.stdin) return;
    try {
      ws.data.child.stdin.write(text + "\n");
      ws.data.child.stdin.flush?.();
    } catch (err) {
      console.error("[ws] stdin write error", err);
    }
  },

  close(ws: ServerWebSocket<WsData>) {
    console.log("[ws] close — killing claude");
    try { ws.data?.child?.kill(); } catch {}
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
//        import { websocket, createWsData } from "@cc-ws/server";
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
  // Path the WS endpoint is mounted at (default "/ws").
  wsPath?: string;
};

export function startServer(options: StartServerOptions = {}) {
  const port = options.port ?? 3000;
  const wsPath = options.wsPath ?? "/ws";

  const server = Bun.serve<WsData>({
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
