# @somewhatintelligent/cc-protocol

## 0.1.0

### Minor Changes

- 3eb13bc: Initial 0.1.0 release of `@somewhatintelligent/cc-protocol` — the universal,
  browser-safe schemas + types + principals package for the Claude Code
  stream-json wire protocol.

  Contents:

  - **Generated schemas + types** for Claude Code binary v2.1.139, produced by
    the `codegen/` pipeline. Discriminator-keyed dispatch maps (`inboundByType`,
    `inboundBySubtype`) for O(1) frame routing.
  - **`ClaudeClient`** (`./client`) — consumer-side principal. Wraps a
    `Transport`, translates intent calls (`setPermissionMode`, `setModel`,
    `setMaxThinkingTokens`, `interrupt`, `sendUserMessage`, `bashCommand`,
    `stopTask`, `endSession`, `getSettings` / `getContextUsage` / `getSessionCost`
    / `getBinaryVersion` / `fileSuggestions` / `mcpStatus` / `reloadPlugins` /
    `applyFlagSettings` / `seedReadState`, `respondToPermission`,
    `sendShellContext`, `sendBashSideChannel`, `dismissShellEntry`) into typed
    frames, correlates `request_id`s back to promises, and tracks rich session
    state via an observable `ClientState`:
    - `sessionId` / `sessionState` / `init` (cwd, agents, slashCommands, skills)
    - `activeMode` / `pendingMode` / `modeError` (set_permission_mode round-trip)
    - `activeModel` / `pendingModel` / `modelError` (set_model round-trip)
    - `messages: MessageEntry[]` with streaming-bubble assembly
      (message*start → content_block*\* → message_stop) producing
      LocalUserEntry / FrameEntry / StreamingEntry
    - `tasks: TaskEntry[]` driven off `system/task_*` frames with
      sub-agent `parent_tool_use_id` transcript routing
    - `shellEntries: ShellEntry[]` with bash side-channel XML capture
    - `hookEvents: HookEntry[]` ring-buffered
    - `pendingPermissions: PendingPermission[]` UI-shape queue plus an
      optional low-level `onPermissionRequest` callback
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
