---
"@somewhatintelligent/cc-ws-client": minor
---

Internal refactor: state aggregation moved to `@somewhatintelligent/cc-protocol/client`.

`cc-ws-client` is now a thin nanostores + persistence facade over
`ClaudeClient`. Every public symbol the v0.1.4 package exported is still
exported with the same name and a type-compatible shape, so React,
Svelte, and element packages — plus consuming apps — need no code
changes.

What moved into `@cc-protocol/client`:

- The `MessageEntry` streaming-bubble reducer (`messages.ts` →
  `@cc-protocol/client/messages.ts`).
- The `TaskEntry` state machine + sub-agent transcript routing
  (`tasks.ts` → `@cc-protocol/client/tasks.ts`).
- The `ShellEntry` bash side-channel aggregator + `parseBashFrame` /
  `buildBashXml` helpers (`shell.ts` → `@cc-protocol/client/shell.ts`).
- The `HookEntry` ring-buffer (extracted from `session.ts` →
  `@cc-protocol/client/hooks.ts`).
- The `PendingPermission` UI-shape queue + `respondToPermission`
  (`permissions.ts` → `@cc-protocol/client/permissions.ts`).
- The control-request `RequestIdCorrelator` (`controls.ts` →
  `@cc-protocol/client/correlate.ts`).
- The transport layer (`ws.ts` → `@cc-protocol/transport/ws-client`).

What stays in `cc-ws-client`:

- `reactive.ts` — the `createCcSession` factory + the smaller
  `createReactiveClient`. Mirrors `ClaudeClient.getSnapshot()` into
  nanostores atoms (`atoms.messages`, `atoms.tasks`, `atoms.shellEntries`,
  `atoms.hookEvents`, `atoms.pendingPermissions`, `atoms.activeMode`, …),
  owns the WsStatus atom, the auto-clearing modeError / modelError
  timers, the `_local:respawn` flow with `@cc-ws-server`, effort
  tracking (which requires a respawn — there's no `set_effort`
  control_request), and the `connect()` / `disconnect()` lifecycle.
- `persistence.ts` — localStorage hydration writer.
- `modes.ts` — the web-only PermissionMode / Model / Effort catalog.
- `protocol.ts` — re-exports wire-frame types from `@cc-protocol` +
  the web-only `SessionMode` data type + `buildSpawnArgs` (`--continue`
  / `--resume` CLI args are a runtime concern, not in the universal
  core) + the `_local:respawn` frame types.
- `usage.ts` — the `sumContextTokens` / `getFrameUsage` helpers.

Test seam: `createCcSession` takes a new `testTransport` option that
replaces the legacy `wsClient: WsClient` injection.

Now depends on `@somewhatintelligent/cc-protocol`.
