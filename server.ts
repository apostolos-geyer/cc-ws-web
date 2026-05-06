import type { ServerWebSocket, Subprocess } from "bun";

type WSData = { child: Subprocess<"pipe", "pipe", "inherit">; buf: string };

const PORT = 3000;

// Canonical claude flag list — both the initial spawn and the effort-respawn
// handler reuse this. `--continue` keeps conversation continuity across the
// respawn the effort selector triggers (no `set_effort` control_request
// exists, so changing effort is the one thing that needs a kill+respawn).
const BASE_CLAUDE_ARGS = [
  "claude",
  "--continue",
  "--print",
  "--input-format",
  "stream-json",
  "--output-format",
  "stream-json",
  "--verbose",
  "--include-partial-messages",
  "--include-hook-events",
  "--permission-prompt-tool",
  "stdio",
  "--permission-mode",
  "default",
] as const;

function trace(direction: "IN" | "OUT" | "OUT-LOCAL" | "IN-LOCAL" | "META", payload: string) {
  const ts = new Date().toISOString().slice(11, 23); // HH:MM:SS.mmm
  console.log(`[${ts}] ${direction.padEnd(9)} ${payload}`);
}

// Spawn a claude child with the canonical base flags plus optional extras
// (e.g. `["--effort","high"]`), attach it to ws.data, and start the
// stdout-pump that forwards NDJSON frames to the WS. Used by both initial
// open and respawn.
function spawnClaude(
  ws: ServerWebSocket<WSData>,
  extraArgs: readonly string[] = [],
): Subprocess<"pipe", "pipe", "inherit"> {
  const child = Bun.spawn([...BASE_CLAUDE_ARGS, ...extraArgs], {
    stdin: "pipe",
    stdout: "pipe",
    stderr: "inherit",
  });
  // Hot-swap the active child synchronously before starting the pump so
  // the pump's `ws.data.child === child` identity check stays correct on
  // its first iteration.
  ws.data.child = child;
  (async () => {
    const decoder = new TextDecoder();
    try {
      for await (const chunk of child.stdout) {
        // Buf is owned by ws.data — but only the currently-attached child
        // writes into it. On respawn we swap ws.data.child, so this loop
        // will continue draining the OLD child's stdout (which has been
        // killed and should close shortly) while the new pump appends to
        // the same ws.data.buf. To avoid interleaving, we keep the buf
        // tied to the ACTIVE child via identity check.
        if (ws.data?.child !== child) {
          // We're the old pump after a respawn — drain quietly without
          // touching ws.data.buf or sending downstream.
          continue;
        }
        ws.data.buf += decoder.decode(chunk as Uint8Array, { stream: true });
        let nl: number;
        while ((nl = ws.data.buf.indexOf("\n")) !== -1) {
          const line = ws.data.buf.slice(0, nl);
          ws.data.buf = ws.data.buf.slice(nl + 1);
          if (line.trim()) {
            trace("OUT", line);
            try {
              ws.send(line);
            } catch {
              // ws closed
            }
          }
        }
      }
    } catch (err) {
      console.error("[ws] stdout pump error", err);
      trace("META", "stdout pump error: " + String(err));
    }
    // Only close the WS if THIS child is still the active one — a respawn
    // intentionally kills the old child but wants the WS to stay open for
    // the new one's output.
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

Bun.serve<WSData, undefined>({
  port: PORT,
  async fetch(req, server) {
    const url = new URL(req.url);

    if (url.pathname === "/ws") {
      if (server.upgrade(req)) return;
      return new Response("expected ws upgrade", { status: 426 });
    }

    if (url.pathname === "/" || url.pathname === "/index.html") {
      return new Response(Bun.file("./index.html"));
    }

    if (url.pathname === "/client.tsx") {
      // Bun bundles client.tsx + react/react-dom + react-markdown for the browser.
      const built = await Bun.build({
        entrypoints: ["./client.tsx"],
        target: "browser",
        minify: false,
      });
      if (!built.success) {
        console.error("build failed", built.logs);
        return new Response("build failed: " + built.logs.map(String).join("\n"), { status: 500 });
      }
      const out = built.outputs[0];
      return new Response(await out.text(), {
        headers: { "content-type": "application/javascript" },
      });
    }

    // Fallback static (for /favicon.ico etc).
    const f = Bun.file("." + url.pathname);
    if (await f.exists()) return new Response(f);
    return new Response("not found", { status: 404 });
  },

  websocket: {
    open(ws: ServerWebSocket<WSData>) {
      console.log("[ws] open — spawning claude");
      trace("META", "ws-open spawning claude with --include-partial-messages --include-hook-events");
      // ws.data needs to exist before spawnClaude assigns ws.data.child.
      ws.data = { child: undefined as unknown as Subprocess<"pipe", "pipe", "inherit">, buf: "" };
      spawnClaude(ws);
    },

    async message(ws: ServerWebSocket<WSData>, msg) {
      const text = typeof msg === "string" ? msg : new TextDecoder().decode(msg);

      // Intercept `_local` frames before forwarding to claude. Frames the
      // browser sends with a `_local` field never reach the model — they're
      // a parallel local channel for things like context-shell.
      let parsed: any;
      try {
        parsed = JSON.parse(text);
      } catch {
        // malformed; fall through to opaque forwarding
      }
      if (parsed?._local) {
        trace("IN-LOCAL", text);
      } else {
        trace("IN", text);
      }
      if (parsed?._local === "respawn") {
        const extraArgs = Array.isArray(parsed.extraArgs)
          ? parsed.extraArgs.filter((a: unknown): a is string => typeof a === "string")
          : [];
        const requestId = typeof parsed.requestId === "string" ? parsed.requestId : "";
        trace("META", `respawn requested with extraArgs=${JSON.stringify(extraArgs)}`);
        try {
          // Kill the previous child. The old stdout pump's identity check
          // (`ws.data.child === child`) means the post-kill stdout-close
          // path won't ws.close() — the WS stays open for the new child.
          try { ws.data?.child?.kill(); } catch {}
          // Reset the rolling buf so partial NDJSON from the old child
          // doesn't get prepended to the new child's first frame.
          ws.data.buf = "";
          spawnClaude(ws, extraArgs);
          const reply = JSON.stringify({ _local: "respawnResult", requestId, ok: true });
          trace("OUT-LOCAL", reply);
          try { ws.send(reply); } catch { /* ws closed */ }
        } catch (err) {
          console.error("[ws] _local respawn error", err);
          trace("META", "respawn error: " + String(err));
          try {
            ws.send(
              JSON.stringify({
                _local: "respawnResult",
                requestId,
                ok: false,
                error: String(err),
              }),
            );
          } catch {
            // ws closed
          }
        }
        return;
      }
      if (parsed?._local === "shell") {
        const command = typeof parsed.command === "string" ? parsed.command : "";
        const requestId = typeof parsed.requestId === "string" ? parsed.requestId : "";
        try {
          const proc = Bun.spawn(["/bin/sh", "-c", command], {
            stdout: "pipe",
            stderr: "pipe",
            stdin: "ignore",
          });
          const [stdout, stderr] = await Promise.all([
            new Response(proc.stdout).text(),
            new Response(proc.stderr).text(),
          ]);
          const exitCode = await proc.exited;
          const reply = JSON.stringify({
            _local: "shellResult",
            requestId,
            command,
            stdout,
            stderr,
            exitCode,
          });
          trace("OUT-LOCAL", reply);
          try { ws.send(reply); } catch { /* ws closed */ }
        } catch (err) {
          console.error("[ws] _local shell error", err);
          try {
            ws.send(
              JSON.stringify({
                _local: "shellResult",
                requestId,
                command,
                stdout: "",
                stderr: String(err),
                exitCode: -1,
              }),
            );
          } catch {
            // ws closed
          }
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

    close(ws: ServerWebSocket<WSData>) {
      console.log("[ws] close — killing claude");
      try { ws.data?.child?.kill(); } catch {}
    },
  },
});

console.log(`Listening on http://localhost:${PORT}`);
