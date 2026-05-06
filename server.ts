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

    message(ws: ServerWebSocket<WSData>, msg) {
      const text = typeof msg === "string" ? msg : new TextDecoder().decode(msg);
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
