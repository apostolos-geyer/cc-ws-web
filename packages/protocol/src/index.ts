/**
 * Public entrypoint for `@somewhatintelligent/cc-protocol`.
 *
 * Re-exports the codegen output for the active Claude Code binary version
 * declared in `codegen/version.ts`. The active version is `2.1.139`. The
 * import path is hard-coded here rather than computed dynamically so:
 *
 *   - bundlers can statically resolve the re-export graph,
 *   - `import type` consumers ship 0 KB of runtime,
 *   - swapping versions is a single one-line edit in this file (plus
 *     `codegen/version.ts`), tracked atomically by the regen-protocol skill.
 *
 * Phase 2 ships only the schemas + types + dispatch layer. Phase 3 adds
 * `ClaudeClient`, `ClaudeProcess`, and the `Transport` surface as separate
 * subpath exports declared in `package.json`.
 */
// Runtime arktype schemas: every `const X = type(...)` from the generated
// file. Use these for validation (`X.allows(value)`, `X(value)`).
//
// Each schema constant is also a *type* — TypeScript merges declarations and
// arktype's `Type<T>` carries the inferred `infer` member. So `import {
// InitializeRequest } from "@cc-protocol"` gives you both the runtime
// validator AND the type (via `typeof InitializeRequest.infer`). For
// callers who prefer plain type aliases, the parallel `./types` file
// exports `export type X = typeof Schemas.X.infer` for each schema; we
// don't re-export that file from this barrel to avoid name-collision
// errors at the `export *` level. Import from
// `@somewhatintelligent/cc-protocol/types` directly when you want the
// type-alias form.
export * from "../generated/2.1.139/schemas";

// Discriminator-keyed dispatch maps for O(1) schema lookup. The Phase 3
// `ClaudeProcess` consumes these.
export { inboundBySubtype, inboundByType } from "../generated/2.1.139/dispatch";

// Provenance metadata.
export {
  ACTIVE_VERSION,
  ACTIVE_BINARY_SHA256,
  ACTIVE_NPM_PACKAGE_VERSION,
} from "./version";
