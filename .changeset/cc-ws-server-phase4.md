---
"@somewhatintelligent/cc-ws-server": minor
---

Phase 4 of the protocol architecture refactor.

- `server.ts` rewritten as a thin runtime bridge over the new universal
  transports: each WebSocket connection bridges a `wsServerTransport` to
  a `spawnTransport`. Server stays a deliberate passthrough — the consumer
  (browser) owns the protocol state machine; the server does not
  instantiate `ClaudeProcess` to avoid racing the consumer's `initialize`.
- `_local:respawn` now swaps the underlying `spawnTransport` per the
  caller-managed-respawn architecture (no `respawn()` method on either
  principal).
- New runtime-specific transport subpath exports:
  - `@somewhatintelligent/cc-ws-server/transport/stdio`
  - `@somewhatintelligent/cc-ws-server/transport/ws-server`
  - `@somewhatintelligent/cc-ws-server/transport/spawn`
- Now depends on `@somewhatintelligent/cc-protocol` for the universal
  `Transport` interface.
- Behavior preserved: same wire format, same `_local:respawn` /
  `respawnResult` shape (incl. legacy `extraArgs` fallback), same
  bridge-side trace lines, same WS-close-kills-the-child semantics.
