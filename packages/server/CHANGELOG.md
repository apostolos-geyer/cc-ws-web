# @somewhatintelligent/cc-ws-server

## 0.2.0

### Minor Changes

- 3eb13bc: Phase 4 of the protocol architecture refactor.

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
