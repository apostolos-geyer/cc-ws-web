# @somewhatintelligent/cc-ws-server

Bun-based runtime for fronting a Claude Code child process. Splits into
three concerns:

1. **WebSocket server shim** — the legacy entrypoint at `src/server.ts`.
   For each WS connection, spawns a `claude` child, pumps stdio between
   the WS and the child, supports `_local:respawn` for new/continue/resume.
   Run as `bun src/server.ts` or via `cc-ws-server` after a global install.
2. **`ClaudeProcess` usage with `spawnTransport`** — the new path. The
   universal `ClaudeProcess` class lives in `@cc-protocol/process`; pair
   it with `spawnTransport` to wrap a real binary.
3. **Runtime transports** — Node/Bun-specific adapters that implement
   `@cc-protocol/transport.Transport`: `stdio`, `ws-server`, `spawn`. Pure
   additions on top of `@cc-protocol` — they expose runtime-specific
   capabilities (`Bun.spawn`, `Bun.ServerWebSocket`) that the universal
   package can't ship.

## 1. The Bun WebSocket server shim

`bun src/server.ts` (or `cc-ws-server` as an installed bin) starts a
bare-bones WS-only Bun server on `PORT` (default 3000) at `/ws`:

```sh
bun add -g @somewhatintelligent/cc-ws-server
PORT=9999 cc-ws-server
```

Or embed in your own `Bun.serve`:

```ts
import { websocket, createWsData } from "@somewhatintelligent/cc-ws-server";
Bun.serve({
  fetch(req, srv) {
    const url = new URL(req.url);
    if (url.pathname === "/ws") {
      if (srv.upgrade(req, { data: createWsData() })) return;
      return new Response("expected ws upgrade", { status: 426 });
    }
    // your own routes...
  },
  websocket,
});
```

> Phase 4 of the codegen migration rewrites this entrypoint on top of
> `ClaudeProcess` + the runtime transports below. Until that lands, the
> existing pump is the source of truth.

## 2. `ClaudeProcess` with `spawnTransport`

`ClaudeProcess` is universal and lives in `@cc-protocol`; the runtime
transport that gets you to a real binary is `spawnTransport` from this
package:

```ts
import { ClaudeProcess } from "@somewhatintelligent/cc-protocol/process";
import { spawnTransport } from "@somewhatintelligent/cc-ws-server/transport/spawn";

const childT = spawnTransport({
  args: ["--continue"],
  env: process.env,
});
const proc = new ClaudeProcess(childT, { validation: "discriminator" });

await proc.start();              // sends initialize, awaits ack, warms validators
proc.onFrame((f) => /* ... */);  // per-tier validated frames
proc.onMetrics((snap) => console.log(snap));
await proc.send(outbound);
await proc.end();                // sends end_session, awaits ack, closes child stdio
```

To respawn: dispose and recreate.

```ts
await proc.end();
const next = new ClaudeProcess(spawnTransport({ args: ["--continue"] }));
await next.start();
```

## 3. Runtime transports overview

| Subpath | What it does |
|---|---|
| `./transport/stdio` | `stdioTransport({ stdin, stdout })` — JSONL framing over arbitrary Web Streams / `FileSink` pair. Used by tests + by `spawn`. |
| `./transport/ws-server` | `wsServerTransport(ws: Bun.ServerWebSocket)` — bridges a Bun WS into a `Transport`. Call `t.deliver(msg)` from your `websocket.message` handler; `t.shutdown()` from `close`. |
| `./transport/spawn` | `spawnTransport({ args, env? })` — `Bun.spawn`s the claude binary with the canonical stream-json flags, wires stdio internally. Returns `Transport & { pid, exited, kill }`. |

For the universal pieces (`ClaudeClient`, `bufferTransport`,
`inMemoryPair`, `wsClientTransport`) see `@somewhatintelligent/cc-protocol`.

## Designed for

A Cloudflare Sandbox container; the worker proxies WS upgrades to
`127.0.0.1:$PORT/ws`. The Phase 4 rewrite will reduce `src/server.ts`
to ~30 lines using `ClaudeProcess` + the runtime transports above.
