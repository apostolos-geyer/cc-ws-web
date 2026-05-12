# @somewhatintelligent/cc-protocol

Universal, browser-safe schemas + types for the Claude Code stream-json wire
protocol. Generated mechanically from a pinned Anthropic binary; no runtime
references to Node or Bun globals.

> Phase 2 ships only the schemas + types + dispatch layer. The engine
> (`ClaudeClient`, `ClaudeProcess`) and transport adapters (`bufferTransport`,
> `inMemoryPair`, `wsClientTransport`) land in Phase 3. Their subpath exports
> are declared up-front so the package shape is stable.

## What's in here today (Phase 2)

| Subpath | Purpose |
|---|---|
| `@somewhatintelligent/cc-protocol` | Runtime [arktype](https://arktype.io) schemas + inferred TypeScript types + a discriminator-keyed dispatch map. |
| `@somewhatintelligent/cc-protocol/version` | `ACTIVE_VERSION`, `ACTIVE_BINARY_SHA256`, `ACTIVE_NPM_PACKAGE_VERSION` — provenance metadata. |

## Usage

### Types-only (browser, client-side narrowing)

`import type` strips the arktype runtime entirely at bundle time; consumers
ship 0 KB of validator overhead.

```ts
import type { StdinMessage, StdoutMessage } from "@somewhatintelligent/cc-protocol";

function handle(msg: StdoutMessage) {
  if (msg.type === "system" && msg.subtype === "init") {
    // msg is narrowed to the init variant
  }
}
```

### Runtime validation (server, integration tests)

```ts
import { StdoutMessage } from "@somewhatintelligent/cc-protocol";

const frame: unknown = JSON.parse(line);
if (StdoutMessage.allows(frame)) {
  // frame is now typed as StdoutMessage
}
```

### Fast discriminator lookup

`inboundBySubtype` / `inboundByType` give O(1) schema lookup keyed by the wire
discriminator. The Phase 3 `ClaudeProcess` uses this for its hot-path validation
tier.

```ts
import { inboundBySubtype } from "@somewhatintelligent/cc-protocol";

const schema = inboundBySubtype[frame.subtype];
if (schema && !schema.allows(frame)) {
  // structural mismatch — log/drop
}
```

## Regen workflow

The schemas are *generated*, not hand-written. The full bump procedure lives
under `codegen/` at the repo root; see `codegen/README.md` and (Phase 3) the
`regen-protocol` skill.

## Engine + transports (coming in Phase 3)

```
@somewhatintelligent/cc-protocol            # universal, browser-safe
  ./                                        # schemas + types + dispatch (Phase 2)
  ./version                                 # provenance (Phase 2)
  ./process                                 # ClaudeProcess (Phase 3)
  ./client                                  # ClaudeClient (Phase 3)
  ./transport                               # Transport interface (Phase 3)
  ./transport/buffer                        # bufferTransport (Phase 3)
  ./transport/in-memory-pair                # inMemoryPair (Phase 3)
  ./transport/ws-client                     # wsClientTransport (Phase 3)
```
