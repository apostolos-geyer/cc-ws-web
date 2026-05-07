// apps/web — reference implementation host. Owns its own Bun.serve so it
// can serve HTML + bundled JS, and mounts the @somewhatintelligent/cc-ws-server bridge at /ws.
// The bridge is just the WebSocket; this file is the HTTP layer.

import { websocket, createWsData, type WsData } from "@somewhatintelligent/cc-ws-server";

const PORT = Number(Bun.env.PORT ?? 3000);
const APP_DIR = import.meta.dir + "/..";       // apps/web/
const CLIENT_ENTRY = import.meta.dir + "/client.tsx";

Bun.serve<WsData>({
  port: PORT,
  async fetch(req, srv) {
    const url = new URL(req.url);

    if (url.pathname === "/ws") {
      if (srv.upgrade(req, { data: createWsData() })) return;
      return new Response("expected ws upgrade", { status: 426 });
    }

    // Bundle the React entry on demand. Bun.build pulls in react,
    // react-dom, react-markdown, and the workspace packages.
    if (url.pathname === "/client.tsx") {
      const built = await Bun.build({
        entrypoints: [CLIENT_ENTRY],
        target: "browser",
        minify: false,
      });
      if (!built.success) {
        console.error("[apps/web] build failed", built.logs);
        return new Response(
          "build failed:\n" + built.logs.map(String).join("\n"),
          { status: 500, headers: { "content-type": "text/plain" } },
        );
      }
      const out = built.outputs[0]!;
      return new Response(await out.text(), {
        headers: { "content-type": "application/javascript" },
      });
    }

    // Static fall-through: index.html at /, anything else served verbatim
    // from the app dir.
    const path = url.pathname === "/" ? "/index.html" : url.pathname;
    const f = Bun.file(APP_DIR + path);
    if (await f.exists()) return new Response(f);
    return new Response("not found", { status: 404 });
  },
  websocket,
});

console.log(`[apps/web] listening on http://localhost:${PORT}`);
