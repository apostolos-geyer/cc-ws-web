# @somewhatintelligent/cc-ws-element

## 0.3.1

### Patch Changes

- decacb9: Rebuild the `<cc-ws-chat>` bundle against `@cc-ws-svelte@0.1.7` (Phase 4b
  state-aggregation migration). No code changes in the element package
  itself — the bundled JS now includes the new `ClaudeClient`-backed
  reactive surface (richer `messages` / `tasks` / `shellEntries` /
  `hookEvents` / `pendingPermissions` / mode + model tracking) via the
  transitive Svelte adapter. The widget's external API (attributes,
  events, custom-property tokens) is unchanged.

  This bump is needed because `cc-ws-svelte` is a devDep on `cc-ws-element`
  (bundled at build time, not loaded at runtime), so changesets'
  `updateInternalDependencies` doesn't auto-propagate the version change.
  Without an explicit changeset here, `bun publish --tolerate-republish`
  would skip the element package and consumers would keep the old 0.3.0
  bundle that pre-dates the Phase 4b refactor.

## 0.3.0

### Minor Changes

- First coordinated release across all four packages.

  `@somewhatintelligent/cc-ws-element` (minor, breaking-ish at 0.x):

  - Persistence redesign — opt-in instead of automatic. Pick a backend with `persist="local" | "session"` plus a required `storage-key`, drop in your own via `initial-state` attribute + `cc-ws-state-change` event, or run ephemeral with no attributes (the new default). Multi-instance safe: each `<cc-ws-chat>` namespaces its own session history under its own key.
  - Markdown rendering for assistant messages — `marked` + DOMPurify + sync `shiki` (curated language set) inside the shadow root, with link sanitisation and a streaming caret that follows the deepest trailing leaf.
  - File-mutating tool calls (`Edit` / `MultiEdit` / `Write` / `NotebookEdit`) render as syntax-highlighted diffs instead of raw JSON.
  - Vim cursor fix: `drawSelection` is now unconditionally installed, so vim insert mode renders a CodeMirror overlay caret instead of relying on the native browser caret — the latter was going invisible across click-out → click-back-in cycles inside the shadow-DOM contenteditable.

  `@somewhatintelligent/cc-ws-client`, `cc-ws-react`, `cc-ws-server` (patch): version bump to align under the new release pipeline; no source changes.
