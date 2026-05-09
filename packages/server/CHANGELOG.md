# @somewhatintelligent/cc-ws-server

## 0.1.4

### Patch Changes

- First coordinated release across all four packages.

  `@somewhatintelligent/cc-ws-element` (minor, breaking-ish at 0.x):

  - Persistence redesign — opt-in instead of automatic. Pick a backend with `persist="local" | "session"` plus a required `storage-key`, drop in your own via `initial-state` attribute + `cc-ws-state-change` event, or run ephemeral with no attributes (the new default). Multi-instance safe: each `<cc-ws-chat>` namespaces its own session history under its own key.
  - Markdown rendering for assistant messages — `marked` + DOMPurify + sync `shiki` (curated language set) inside the shadow root, with link sanitisation and a streaming caret that follows the deepest trailing leaf.
  - File-mutating tool calls (`Edit` / `MultiEdit` / `Write` / `NotebookEdit`) render as syntax-highlighted diffs instead of raw JSON.
  - Vim cursor fix: `drawSelection` is now unconditionally installed, so vim insert mode renders a CodeMirror overlay caret instead of relying on the native browser caret — the latter was going invisible across click-out → click-back-in cycles inside the shadow-DOM contenteditable.

  `@somewhatintelligent/cc-ws-client`, `cc-ws-react`, `cc-ws-server` (patch): version bump to align under the new release pipeline; no source changes.
