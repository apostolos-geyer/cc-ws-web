# Claude Code schema extraction

`@somewhatintelligent/cc-ws-client`'s [`protocol.ts`](../src/protocol.ts) is a typed mirror of
the wire protocol the Claude Code binary speaks over `--input-format
stream-json --output-format stream-json`. Anthropic doesn't publish that
protocol's spec — but every Zod schema the binary uses to validate it is
embedded in the executable as plain JS source (Bun ships an uncompressed
bundle inside the standalone binary). This script extracts those
schemas so we can keep `protocol.ts` honest.

## Why we have it

Zod schemas are runtime values, not types. `z.object({...})`,
`z.literal("foo")`, `.describe("...")` are real JS expressions that
survive bundling, minification, and `bun build --compile` — only
variable names get shortened. The binary is therefore self-documenting
for its own wire format.

The protocol drifts between Claude Code releases (new system subtypes,
new control_request payloads, new optional fields). We pin our types
to a specific binary version and re-run this script on each bump to
detect drift; otherwise our discriminated union slowly desyncs and our
"no `as any`" type tightening becomes a fiction.

## Usage

```bash
# locate the active claude binary (Mach-O / ELF, ~200MB Bun executable)
CLAUDE_BIN=$(readlink -f "$(which claude)")
file "$CLAUDE_BIN"

# extract every Zod schema in the binary into ./extracted/
bun packages/client/scripts/extract-claude-schemas.ts extract "$CLAUDE_BIN" --out packages/client/scripts/extracted

# diff against a previously committed canonical snapshot (drift detection)
bun packages/client/scripts/extract-claude-schemas.ts compare \
  packages/client/scripts/extracted-pinned/canonical.json \
  packages/client/scripts/extracted/canonical.json
```

Outputs (under `--out` dir, default `./extracted`):

| File              | What it is                                                                    |
| ----------------- | ----------------------------------------------------------------------------- |
| `canonical.json`  | by-discriminant snapshot keyed on `subtype/X` / `type/X` — diff-stable        |
| `schemas.json`    | full registry by minified id — single-version analysis only (ids regenerate) |
| `unions.json`     | every `v.union([...])` with members + their discriminants                     |
| `report.md`       | human-readable, grouped by discriminant                                       |
| `raw.js`          | bodies one-per-line, prefixed by id, for `grep`                              |

## Workflow when the binary bumps

1. Re-run `extract` against the new `claude` binary.
2. `compare` the new `canonical.json` against the previously committed snapshot.
3. Review the `added` / `removed` / `changed` keys.
4. For any added or changed system subtype / control_request subtype that
   the lib actually consumes: update [`protocol.ts`](../src/protocol.ts)
   variants, narrow handlers in [`session.ts`](../src/session.ts),
   bump tests in [`__tests__/`](../__tests__).
5. Commit the new pinned `canonical.json` alongside the type updates.

The schema cited in `protocol.ts` is from the v2.1.129 binary
(2026-05-05). When you bump, drop the new pinned snapshot under
`packages/client/scripts/extracted-pinned/` and reference it here.

## How the extraction works

Every schema in the binary takes the lazy form:

```js
<id>=xH(()=>v.<...>)
```

…where `xH` is `lazySchema` and `v` is `zod`. The script:

1. Anchors on `<id>=xH(` with paren-balanced body parsing (string- and
   comment-aware) to capture the full schema source verbatim.
2. Pulls structural discriminants — `type:v.literal("X")`,
   `subtype:v.literal("X")` — and uses them as canonical keys.
   Those keys are stable across builds; minified ids (`Lr9`, `bqH`,
   `xH`, `v`, …) are not.
3. Cross-references `<ident>()` calls inside bodies to resolve
   `v.union([...])` membership.
4. For schemas with no discriminant (helpers like `PermissionUpdate`),
   hashes the body shape after mangling minified-id references — two
   builds of the same conceptual helper produce the same hash.

V1 limitation: extracts only the lazy-wrapped (`xH(()=>...)`) form. A
small number of internal helper schemas defined as bare
`<id>=v.<kind>(...)` (no lazy wrapper) are missed — visible as
`(unresolved)` members in some unions in the report. Add a second
regex pass for the bare form when needed.

## Hard rule

The output is **derived from observation of a binary you legally
installed**, not from any leaked Claude Code source. The leak (if you
have access to it elsewhere) is a reading aid for understanding what
the binary contains; the actual typed protocol gets built from the
extracted `canonical.json` produced here.
