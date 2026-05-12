# @somewhatintelligent/cc-ws-client

## 0.2.0

### Minor Changes

- 3eb13bc: Internal refactor: state aggregation moved to `@somewhatintelligent/cc-protocol/client`.

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

### Patch Changes

- Updated dependencies [3eb13bc]
  - @somewhatintelligent/cc-protocol@0.1.0

## 0.1.4

### Patch Changes

- First coordinated release across all four packages.

  `@somewhatintelligent/cc-ws-element` (minor, breaking-ish at 0.x):

  - Persistence redesign — opt-in instead of automatic. Pick a backend with `persist="local" | "session"` plus a required `storage-key`, drop in your own via `initial-state` attribute + `cc-ws-state-change` event, or run ephemeral with no attributes (the new default). Multi-instance safe: each `<cc-ws-chat>` namespaces its own session history under its own key.
  - Markdown rendering for assistant messages — `marked` + DOMPurify + sync `shiki` (curated language set) inside the shadow root, with link sanitisation and a streaming caret that follows the deepest trailing leaf.
  - File-mutating tool calls (`Edit` / `MultiEdit` / `Write` / `NotebookEdit`) render as syntax-highlighted diffs instead of raw JSON.
  - Vim cursor fix: `drawSelection` is now unconditionally installed, so vim insert mode renders a CodeMirror overlay caret instead of relying on the native browser caret — the latter was going invisible across click-out → click-back-in cycles inside the shadow-DOM contenteditable.

  `@somewhatintelligent/cc-ws-client`, `cc-ws-react`, `cc-ws-server` (patch): version bump to align under the new release pipeline; no source changes.
