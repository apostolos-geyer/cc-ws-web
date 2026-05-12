# @somewhatintelligent/cc-protocol

Universal, browser-safe protocol layer for the Claude Code stream-json
wire format. Three pieces:

1. **Schemas + types** — generated mechanically from a pinned Anthropic
   binary. Use `import type` for browser bundles (0 KB shipped); use the
   runtime arktype schemas for server-side validation.
2. **`ClaudeClient`** — the consumer-side principal. Translates intent
   methods (`setPermissionMode("plan")`, `interrupt()`,
   `sendUserMessage(text)`) into wire frames; correlates `request_id`s
   back to promises; tracks session state.
3. **`ClaudeProcess`** — the binary-side principal. Wraps any `Transport`
   with the protocol state machine + validation. No process spawning
   here — see `@cc-ws-server`'s `spawnTransport` for that.

All three sit over a single `Transport` interface; the package ships
three universal transports (`bufferTransport`, `inMemoryPair`,
`wsClientTransport`) and the runtime-specific ones (`stdio`, `ws-server`,
`spawn`) live in `@cc-ws-server`.

Zero references to `Bun.*` or `node:*` anywhere in
`packages/protocol/src/`; this package is safe to import in a browser
bundle.

## Schemas + types

```ts
// Types-only (browser, client-side narrowing) — `import type` strips the
// arktype runtime; consumers ship 0 KB of validator code.
import type {
  SystemInit,
  ControlResponseMessage,
  PermissionMode,
} from "@somewhatintelligent/cc-protocol";

function handle(frame: SystemInit) {
  if (frame.subtype === "init") {
    // frame is narrowed to the init variant
    console.log(frame.session_id);
  }
}
```

```ts
// Runtime validation (server, integration tests).
import { ControlResponseMessage } from "@somewhatintelligent/cc-protocol";

const frame: unknown = JSON.parse(line);
if (ControlResponseMessage.allows(frame)) {
  // frame is now typed as ControlResponseMessage
}
```

```ts
// O(1) discriminator lookup — `ClaudeProcess` uses this for its hot path.
import { inboundBySubtype } from "@somewhatintelligent/cc-protocol";

const schema = inboundBySubtype[frame.subtype];
if (schema && !schema.allows(frame)) {
  // structural mismatch — log/drop
}
```

## `ClaudeClient` — consumer-side example

```ts
import { ClaudeClient } from "@somewhatintelligent/cc-protocol/client";
import { wsClientTransport } from "@somewhatintelligent/cc-protocol/transport/ws-client";

const transport = wsClientTransport("wss://my-server/ws", {
  reconnect: { kind: "exp", baseMs: 250, maxMs: 30_000 },
});

const client = new ClaudeClient(transport, {
  onPermissionRequest: async (req) => {
    // Prompt the user, return the verdict.
    return { behavior: "allow", updatedInput: undefined };
  },
});

// Reactive surface — call `getSnapshot()` to read; `onStateChange` to subscribe.
client.onStateChange((snap) => {
  console.log("session", snap.sessionId, "messages", snap.messages.length);
});

await client.setPermissionMode("plan");
await client.setModel("opus");
await client.sendUserMessage("Hello, claude.");
```

### `inMemoryPair` — testing pattern

```ts
import { inMemoryPair } from "@somewhatintelligent/cc-protocol/transport/in-memory-pair";
import { ClaudeClient } from "@somewhatintelligent/cc-protocol/client";
import { ClaudeProcess } from "@somewhatintelligent/cc-protocol/process";

const [a, b] = inMemoryPair();
const client = new ClaudeClient(a);
const proc = new ClaudeProcess(b, { validation: "strict" });

// Drive a fixture through, or wire your own fake "binary" loop.
```

## `ClaudeProcess` — binary-side example

```ts
// In production this is paired with a runtime transport from @cc-ws-server.
import { ClaudeProcess } from "@somewhatintelligent/cc-protocol/process";
import { spawnTransport } from "@somewhatintelligent/cc-ws-server/transport/spawn";

const childT = spawnTransport({ args: ["--continue"] });
const proc = new ClaudeProcess(childT, { validation: "discriminator" });

await proc.start();             // sends initialize, awaits ack, warms validators
proc.onFrame((f) => /* ... */); // per-tier-validated frames
await proc.send(someFrame);     // outbound frames
await proc.end();               // sends end_session, awaits ack, closes transport
```

To respawn: dispose the instance and construct a new one with a fresh
transport.

```ts
await proc.end();
const next = new ClaudeProcess(spawnTransport({ args: ["--continue"] }));
await next.start();
```

## Validation tiers

| Mode | When to use | Per-frame work |
|---|---|---|
| `off` | Production hot path, well-burned-in code. | None. Pure passthrough. |
| `discriminator` (default) | Production safe path. | Read `type` / `subtype`, look up schema, confirm the literal exists. O(1). |
| `strict` | Tests, development, schema burn-in. | Full arktype `.allows()` per frame. |

`stream_event` frames bypass field validation regardless of mode unless
`validateStreamEvents: true` — the highest-rate frame type.

## Subpath exports

```
@somewhatintelligent/cc-protocol
  ./                                      schemas + types + dispatch
  ./version                               ACTIVE_VERSION + binary metadata
  ./process                               ClaudeProcess + framing helpers
  ./client                                ClaudeClient
  ./transport                             Transport interface
  ./transport/buffer                      bufferTransport()
  ./transport/in-memory-pair              inMemoryPair()
  ./transport/ws-client                   wsClientTransport(url, opts?)
```

Runtime-specific adapters (`stdio`, `ws-server`, `spawn`) live in
`@somewhatintelligent/cc-ws-server` — they pull in `Bun.spawn` /
`Bun.ServerWebSocket` and would defeat the browser-safe guarantee here.

## Regen workflow

The schemas are *generated*, not hand-written. To bump to a new Claude
binary, invoke the **`regen-protocol`** skill at
`.claude/skills/regen-protocol/SKILL.md`. Triggers: "bump claude
protocol", "regen claude schemas", "claude binary updated". The skill
walks the 13-step procedure end-to-end and lands at a green
`bun codegen/checkpoint.ts`.

See `codegen/README.md` for the underlying pipeline details.
