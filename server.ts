import type { ServerWebSocket, Subprocess } from "bun";

type WSData = { child: Subprocess<"pipe", "pipe", "inherit">; buf: string };

const PORT = 3000;

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
      const child = Bun.spawn(
        ["claude", "--continue", "--print", "--input-format", "stream-json", "--output-format", "stream-json", "--verbose"],
        { stdin: "pipe", stdout: "pipe", stderr: "inherit" },
      );
      ws.data = { child, buf: "" };

      (async () => {
        const decoder = new TextDecoder();
        try {
          for await (const chunk of child.stdout) {
            ws.data.buf += decoder.decode(chunk as Uint8Array, { stream: true });
            let nl: number;
            while ((nl = ws.data.buf.indexOf("\n")) !== -1) {
              const line = ws.data.buf.slice(0, nl);
              ws.data.buf = ws.data.buf.slice(nl + 1);
              if (line.trim()) {
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
        }
        console.log("[ws] claude stdout closed");
        try { ws.close(); } catch {}
      })();
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
          try {
            ws.send(
              JSON.stringify({
                _local: "shellResult",
                requestId,
                command,
                stdout,
                stderr,
                exitCode,
              }),
            );
          } catch {
            // ws closed
          }
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
