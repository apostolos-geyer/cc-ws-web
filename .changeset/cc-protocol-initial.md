---
"@somewhatintelligent/cc-protocol": minor
---

Initial 0.1.0 release of `@somewhatintelligent/cc-protocol` — the universal,
browser-safe schemas + types + principals package for the Claude Code
stream-json wire protocol.

Contents:

- **Generated schemas + types** for Claude Code binary v2.1.139, produced by
  the `codegen/` pipeline. Discriminator-keyed dispatch maps (`inboundByType`,
  `inboundBySubtype`) for O(1) frame routing.
- **`ClaudeClient`** (`./client`) — consumer-side principal. Wraps a
  `Transport`, translates intent calls (`setPermissionMode`, `interrupt`,
  `sendUserMessage`, …) into typed frames, correlates `request_id`s,
  tracks session/message/task state via an observable `ClientState`.
- **`ClaudeProcess`** (`./process`) — binary-side principal. Wraps a
  `Transport`, drives the lifecycle handshake (`initialize` / `end_session`),
  validates inbound frames against the generated schemas, exposes
  observable lifecycle + validation metrics.
- **Universal transports** (`./transport/*`):
  - `bufferTransport` — replay a pre-recorded fixture
  - `inMemoryPair` — two `Transport`s wired head-to-head (for tests)
  - `wsClientTransport` — browser-safe WebSocket client adapter
- **`Transport`** interface — the universal seam between principals.
  Runtime-specific transports (`spawnTransport`, `wsServerTransport`,
  `stdioTransport`) ship in `@somewhatintelligent/cc-ws-server`.

Browser-safe: zero Node/Bun references in `src/`. Validated by the codegen
pipeline's `verify-package.ts` gate and a CI grep.
