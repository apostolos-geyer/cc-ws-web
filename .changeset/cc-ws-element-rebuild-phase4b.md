---
"@somewhatintelligent/cc-ws-element": patch
---

Rebuild the `<cc-ws-chat>` bundle against `@cc-ws-svelte@0.1.7` (Phase 4b
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
