/**
 * Single active version of the Claude Code stream-json wire protocol.
 *
 * Consumed by `extract.ts`, `generate.ts`, `verify-package.ts`, integration
 * tests, and `packages/protocol/src/version.ts`. Edit ONLY when bumping the
 * active snapshot — the regen-protocol skill rewrites this file as part of
 * the bump workflow. `ACTIVE_BINARY_SHA256` is the sha256 recorded in
 * `codegen/snapshots/<ACTIVE_VERSION>/binary-metadata.json`.
 */
export const ACTIVE_VERSION = "2.1.139";
export const ACTIVE_BINARY_SHA256 =
  "aa8a0a39f2abbd9e09518eb7268cda105b8029620a38f5a5cbc362b65331c3db";
export const ACTIVE_NPM_PACKAGE_VERSION = "2.1.139";
