---
"@somewhatintelligent/cc-ws-client": minor
---

Phase 4 of the protocol architecture refactor.

- The underlying WebSocket plumbing (`ws.ts`) now wraps `wsClientTransport`
  from `@somewhatintelligent/cc-protocol/transport/ws-client`. The public
  `WsClient` contract is unchanged — same status / lastError atoms, same
  connect / disconnect / send / onFrame surface — so the `createCcSession`
  factory, all its atoms, methods, and the React/Svelte adapters continue
  to work unchanged.
- New additive entry point: `createReactiveClient` (`./reactive` subpath)
  — a thin nanostores facade over `ClaudeClient` from
  `@somewhatintelligent/cc-protocol/client`. Useful for consumers who
  want raw access to the protocol-package client; `createCcSession`
  remains the canonical higher-level API.
- New direct re-exports from the protocol package: `ClaudeClient`,
  `wsClientTransport`, `Transport`, `Frame`, `ClientState` — so callers
  can `import { ClaudeClient } from "@somewhatintelligent/cc-ws-client"`
  if they prefer a single workspace dep.
- New runtime dependency: `@somewhatintelligent/cc-protocol`.
