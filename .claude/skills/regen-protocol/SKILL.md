---
name: regen-protocol
description: Bump the `@somewhatintelligent/cc-protocol` package to a new Claude Code binary version. Walks the extract → diff → patch → generate → integration-test loop end-to-end, ending at a green `bun codegen/checkpoint.ts`. Use when the user says "bump claude protocol", "regen claude schemas", or "claude binary updated", or any time `codegen/version.ts`'s `ACTIVE_VERSION` lags behind `claude --version`.
---

# regen-protocol — bump workflow for `@cc-protocol`

The schemas under `packages/protocol/generated/<ver>/` are a pure function
of the binary at `/Users/stoli/.local/share/claude/versions/<ver>` and the
patches at `codegen/snapshots/<ver>/patches.ts`. This skill is the
mechanical procedure to roll a new version through the pipeline.

Read this file end-to-end before starting; the steps are ordered, and
some steps loop until coverage is high enough.

## Pre-flight

```sh
# Branch + clean state.
git status --short          # must be empty (or stash/commit first)
git rev-parse --abbrev-ref HEAD  # confirm we're on the right branch
```

If the working tree isn't clean, stop and ask the user before touching
anything. The skill's edits are large; uncommitted work would mingle
unhelpfully.

## Step 1 — discover the version delta

```sh
cat codegen/version.ts                      # current ACTIVE_VERSION
claude --version                            # installed binary version
```

If they match, report "in sync" and stop. Otherwise, capture the new
version as `NEW_VER` and proceed.

## Step 2 — extract the new canonical

```sh
mkdir -p codegen/snapshots/$NEW_VER
bun codegen/extract.ts extract \
  /Users/stoli/.local/share/claude/versions/$NEW_VER \
  --out codegen/snapshots/$NEW_VER
```

The extractor prints a coverage line; record total call sites,
discriminants, namespace count. A sharp drop vs the prior version is a
red flag — investigate before continuing (bundler change? new wrapper?
re-read the extractor's V2 anchor logic in `codegen/extract.ts`).

## Step 3 — diff against the prior canonical

```sh
mkdir -p codegen/snapshots/drift
bun codegen/extract.ts compare \
  codegen/snapshots/$OLD_VER/canonical.json \
  codegen/snapshots/$NEW_VER/canonical.json \
  --out codegen/snapshots/drift
# Then rename the produced diff.md to <old>-to-<new>.md so future bumps
# don't overwrite it.
mv codegen/snapshots/drift/diff.md codegen/snapshots/drift/$OLD_VER-to-$NEW_VER.md
```

Open the drift file. The structure is `added / removed / changed` per
canonical key. Each "changed" entry is a candidate patch action.

## Step 4 — seed patches

```sh
cp codegen/snapshots/$OLD_VER/patches.ts codegen/snapshots/$NEW_VER/patches.ts
```

Then edit the new copy to bump the `version: "X"` string at the top.
This carries every prior override forward; the patch loop below
selectively updates entries when the drift report says a referenced
schema changed.

## Step 5 — update the active version

```sh
# Edit codegen/version.ts:
#   export const ACTIVE_VERSION = "<NEW_VER>";
#   export const ACTIVE_BINARY_SHA256 = "<sha from snapshots/<NEW_VER>/binary-metadata.json>";
#   export const ACTIVE_NPM_PACKAGE_VERSION = "<from same metadata>";
```

Also update `packages/protocol/src/index.ts` to point its `export * from
"../generated/<NEW_VER>/schemas"` line to the new directory.

Also update `packages/protocol/__tests__/types.test.ts`'s
`expect(ACTIVE_VERSION).toBe(...)` assertion.

## Step 6 — first codegen pass

```sh
bun codegen/generate.ts
```

The output reports coverage as `X / Y fields typed (Z patches applied)`.
If any *discriminant-keyed* schema has zero typed fields, generate.ts
exits non-zero — at least one patch is required for those.

## Step 7 — patching loop

For each entry in `drift/$OLD_VER-to-$NEW_VER.md` that the drift report
flags as needing patching:

1. Look up the schema name in the drift entry.
2. For *structure* (not source — provenance rule), check
   `/Users/stoli/Desktop/devel/personal/claude-code/src/entrypoints/sdk/`
   (leaked source — READ ONLY, never copy text):
   - `controlSchemas.ts` for control_request/response shapes
   - `coreSchemas.ts` for top-level message types
3. Author a `Patch` in `codegen/snapshots/$NEW_VER/patches.ts` with a
   `reason` string that cites the source of truth (e.g.
   `"controlSchemas.ts:142 — set_permission_mode now accepts ultraplan flag"`).
   Available patch kinds (see `codegen/patch-dsl.ts`):
   - `fieldType` — override a single field's arktype expression
   - `addField` — add a missing field
   - `removeField` — drop a stale field
   - `renameSchema` — rename a generated identifier
   - `resolveAnon` — name an anonymous helper bucket
   - `discriminantHint` — inform the generator about a union discriminator
4. Re-run `bun codegen/generate.ts`. Re-read the coverage line.
5. Repeat until coverage is acceptable (no discriminant-keyed schemas
   with zero typed fields; remaining `unknown`s are intentional).

## Step 8 — re-record integration fixtures

```sh
bun codegen/integration/run-tests.ts --update-fixtures
```

This spawns the new binary, replays every test in
`codegen/integration/tests.ts`, captures fresh fixtures, and validates
each captured frame against the new schemas. Any new subtype the binary
emits that lacks a test in the catalog gets surfaced — add a stub entry
to `tests.ts` and re-record before continuing.

## Step 9 — run all checkpoint gates

```sh
bun codegen/checkpoint.ts
```

This is the consolidated runner — extractor reproducibility, generate
idempotence, gap check, integration tests, replay, package tests,
publish dry-run, verify-package, simulated drift, outside-island diff.
All must pass.

## Step 10 — write a changeset

```sh
bun changeset
```

Per-package version bumps:
- `@somewhatintelligent/cc-protocol` — minor (additive schema changes)
  or major (breaking shape changes) — let the drift report's `changed`
  count guide this.
- `@somewhatintelligent/cc-ws-server` — patch (gets the new schemas
  transitively).
- `@somewhatintelligent/cc-ws-client` — patch (same).

The changeset description should reference the drift file:
`See drift/$OLD_VER-to-$NEW_VER.md for the schema delta.`

## Step 11 — final verify

```sh
bun codegen/verify-package.ts
```

This is the `prepublishOnly` guard. Must exit 0.

## Step 12 — final test suite

```sh
bun test                                            # all packages
bun test packages/protocol/__tests__/               # explicit run
bun test packages/server/__tests__/                 # explicit run
CC_PROTOCOL_LIVE_BINARY=1 bun test packages/server/__tests__/live.test.ts
```

## Step 13 — hand off to the user

Stop and report:
- old version → new version
- discriminant deltas (added, removed, changed)
- schemas patched + their `reason` strings
- coverage delta (X% → Y%)
- any new subtypes added to the integration test catalog
- changeset entry written

The user reviews + commits + publishes. Do NOT publish unprompted.

## Skill self-test (run before committing changes to this skill)

A "simulated bump" walkthrough validates the loop without an actual
binary upgrade:

1. Back up `codegen/version.ts` and `codegen/snapshots/2.1.139/patches.ts`.
2. Temporarily set `ACTIVE_VERSION = "2.1.137"` in `codegen/version.ts`.
3. Trim a few entries from `2.1.139/patches.ts` so coverage drops.
4. Walk steps 6-9 of this skill against the current tree.
5. Confirm the patch loop produces a clean checkpoint at the end.
6. Restore the backups. Commit any improvements you needed to make to
   make the loop converge.

Last self-tested: 2026-05-12 against 2.1.137 ↔ 2.1.139 — simulated bump
loop converged. Walked steps 5-6 (set `ACTIVE_VERSION = "2.1.137"`, ran
`bun codegen/generate.ts`, observed the expected coverage drop and the
mismatched-`ACTIVE_VERSION` test assertion catching the change). State
restored cleanly after.

## Triggers

Invoke this skill on any of:
- "bump claude protocol"
- "regen claude schemas"
- "regenerate protocol"
- "claude binary updated"
- "the claude version changed"
- `claude --version` doesn't match `codegen/version.ts`'s `ACTIVE_VERSION`
