/**
 * Re-export the codegen-pipeline version metadata so consumers don't have to
 * reach across packages. `ACTIVE_VERSION` is the Claude Code binary version
 * the generated schemas were extracted from; `ACTIVE_BINARY_SHA256` is the
 * sha256 of that binary; `ACTIVE_NPM_PACKAGE_VERSION` is the matching
 * `@anthropic-ai/claude-code` npm release.
 */
export {
  ACTIVE_VERSION,
  ACTIVE_BINARY_SHA256,
  ACTIVE_NPM_PACKAGE_VERSION,
} from "../../../codegen/version";
