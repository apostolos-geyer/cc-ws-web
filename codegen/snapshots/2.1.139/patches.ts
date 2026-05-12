/**
 * Hand-authored overrides for the 2.1.139 canonical.
 *
 * Each patch carries a `reason` string for the audit trail. Some patches
 * reference the leaked source at `../../../claude-code/src/...` by
 * file:line for provenance — we never copy source from there, only
 * structure (the V1 codegen translates the binary's Zod expression strings
 * to arktype; patches resolve the gaps when the binary's expressions can't
 * be parsed mechanically). The leaked-source provenance is annotation, not
 * a transitive dependency.
 *
 * Categories of patches in this round:
 *   1. Cross-package helpers: tiny zod-wrapper helpers from the binary's
 *      `coreSchemas.ts` (`UUID`, `Message`, `StreamEvent` etc.) that show
 *      up as opaque `Ident()` calls in the canonical's RHS strings.
 *   2. Anonymous schemas with high-value names (`PermissionMode`,
 *      `PermissionUpdate`, `AgentDefinition`, `HookEvent` etc.) so the
 *      generated types read well.
 *   3. Renames for the discriminator-keyed schemas the integration tests
 *      exercise, so the inferred types use the wire-format names
 *      (`StdoutMessage`, `StdinMessage`).
 */

import { definePatches } from "../../patch-dsl";

export default definePatches({
  version: "2.1.139",
  patches: [
    // ========================================================================
    // 1. UUID / common scalar helpers
    // ========================================================================
    // The binary wraps UUID generation behind a tiny helper (`nT()` in the
    // bundled artifact); the extractor can't see through the wrapper because
    // there's no `y.string()` call site for it. Every system/result frame
    // carries one — typing as plain string is safe (we don't enforce the
    // UUID shape at the protocol layer).
    ...uuidPatches([
      "AssistantMessage",
      "AuthStatusMessage",
      "PromptSuggestionMessage",
      "RateLimitEventMessage",
      "StreamEventMessage",
      "SystemApiRetry",
      "SystemCompactBoundary",
      "SystemElicitationComplete",
      "SystemFilesPersisted",
      "SystemHookProgress",
      "SystemHookResponse",
      "SystemHookStarted",
      "SystemInit",
      "SystemLocalCommandOutput",
      "SystemMemoryRecall",
      "SystemMirrorError",
      "SystemNotification",
      "SystemPermissionDenied",
      "SystemPluginInstall",
      "SystemSessionStateChanged",
      "SystemStatus",
      "SystemTaskNotification",
      "SystemTaskProgress",
      "SystemTaskStarted",
      "SystemTaskUpdated",
      "ToolProgressMessage",
      "ToolUseSummaryMessage",
      "SystemPostTurnSummary",
      "SystemTaskSummary",
      "ResultMessage",
      "ResultSuccess",
    ]),

    // ========================================================================
    // 2. Resolve common anonymous helpers to readable names
    // ========================================================================
    {
      kind: "resolveAnon",
      canonicalKey: "anon/7c9dcdfce023ddb1",
      name: "PermissionMode",
      reason:
        "Enum of the six permission modes the binary advertises (default / acceptEdits / bypassPermissions / plan / dontAsk / auto). Matched against ../../../claude-code/src/types/permissions.ts:16-24 + utils/permissions/PermissionMode.ts:21.",
    },
    {
      kind: "resolveAnon",
      canonicalKey: "anon/b4e58b18615719a9",
      name: "AgentDefinition",
      reason:
        "Anonymous object whose shape matches ../../../claude-code/src/entrypoints/sdk/coreSchemas.ts:1110-1184 (AgentDefinitionSchema). Identified by InitializeRequest.agents using this as its record value type.",
    },

    // ========================================================================
    // 3. ResultMessage usage payload — the binary's `P67()` ref points at
    //    Anthropic SDK's Usage shape. The extractor can't recurse into the
    //    helper. Type liberally as a record of numbers.
    // ========================================================================
    {
      kind: "fieldType",
      schema: "ResultMessage",
      field: "usage",
      arktype: "Record<string, unknown>",
      reason:
        "Anthropic SDK usage object — provider-specific keys (input_tokens, output_tokens, cache_creation_input_tokens, ...). Permissive shape so future field additions don't break validation.",
    },
    {
      kind: "fieldType",
      schema: "ResultMessage",
      field: "terminal_reason",
      arktype: "string?",
      reason:
        "Free-form termination reason string. R67() is a thin wrapper at the binary's coreSchemas; not worth deep-typing. Optional in the canonical.",
    },
    {
      kind: "fieldType",
      schema: "ResultSuccess",
      field: "usage",
      arktype: "Record<string, unknown>",
      reason: "Same as ResultMessage.usage — Anthropic SDK Usage shape.",
    },
    {
      kind: "fieldType",
      schema: "ResultSuccess",
      field: "terminal_reason",
      arktype: "string?",
      reason: "Same as ResultMessage.terminal_reason — optional in the canonical.",
    },

    // ========================================================================
    // 4. AssistantMessage / UserMessage / StreamEventMessage bodies
    //    Wire format wraps an Anthropic SDK Message object; we model it
    //    permissively at the protocol layer because the SDK message shape
    //    is rich, often-updated, and not load-bearing for our routing.
    // ========================================================================
    {
      kind: "fieldType",
      schema: "AssistantMessage",
      field: "message",
      arktype: "Record<string, unknown>",
      reason:
        "Anthropic SDK assistant message shape (T15() = SDK Message). Permissive at the wire-protocol layer; UI layer narrows on content blocks.",
    },
    {
      kind: "fieldType",
      schema: "UserMessage",
      field: "message",
      arktype: "Record<string, unknown>",
      reason: "Anthropic SDK user-message shape (O15()).",
    },
    {
      kind: "fieldType",
      schema: "StreamEventMessage",
      field: "event",
      arktype: "Record<string, unknown>",
      reason:
        "Anthropic streaming-event envelope (A15()). Per the runtime-validation design the hot path bypasses stream_event field validation entirely; only the discriminator is checked.",
    },

    // ========================================================================
    // 5. InitializeRequest.hooks — record keyed by HookEvent enum, value is
    //    array of callback descriptors.
    // ========================================================================
    {
      kind: "fieldType",
      schema: "InitializeRequest",
      field: "hooks",
      arktype: "Record<string, unknown>?",
      reason:
        "Record<HookEvent, SDKHookCallbackMatcher[]>. j67()=HookEventSchema, kc3()=SDKHookCallbackMatcherSchema. Matched against ../../../claude-code/src/entrypoints/sdk/coreSchemas.ts:385 + controlSchemas.ts:62. Typed as Record<string, unknown> for V1 — the value shape (matcher with optional hooks array) is complex and not used by our routing. Trailing `?` marks the field optional.",
    },

    // ========================================================================
    // 6. McpMessageRequest.message — JSON-RPC message payload, opaque.
    // ========================================================================
    {
      kind: "fieldType",
      schema: "McpMessageRequest",
      field: "message",
      arktype: "Record<string, unknown>",
      reason:
        "JSON-RPC 2.0 message (Lc3() = JsonRpcMessageSchema). Provider-defined; we forward verbatim.",
    },

    // ========================================================================
    // 7. CanUseToolRequest.decision_reason_type — enum over a small, known set.
    // ========================================================================
    {
      kind: "fieldType",
      schema: "CanUseToolRequest",
      field: "decision_reason_type",
      arktype: "string?",
      reason:
        "y.enum(ub6) over a binary-internal constant array (DecisionReasonType). Typed as plain string for V1; the values aren't required to route. Optional in the canonical.",
    },

    // ========================================================================
    // 8. ShutdownResponseMessage / PlanApprovalResponseMessage2 — `approve` is
    //    a boolean-shaped helper (W0() == boolean).
    // ========================================================================
    {
      kind: "fieldType",
      schema: "ShutdownResponseMessage",
      field: "approve",
      arktype: "boolean",
      reason: "W0() is the binary's boolean-helper wrapper.",
    },
    {
      kind: "fieldType",
      schema: "PlanApprovalResponseMessage2",
      field: "approve",
      arktype: "boolean",
      reason: "Same as ShutdownResponseMessage.approve.",
    },

    // ========================================================================
    // 9. SetModeMessage2.mode — PermissionMode enum after rename.
    // ========================================================================
    {
      kind: "fieldType",
      schema: "SetModeMessage2",
      field: "mode",
      arktype: "expr:PermissionMode",
      reason:
        "izq() resolves to the external-permission-mode helper; matches the PermissionMode enum we just named via resolveAnon.",
    },

    // ========================================================================
    // 10. SystemCompactBoundary.compact_metadata — the binary emits an inline
    //     object that we can also type by hand for clarity.
    // ========================================================================
    {
      kind: "fieldType",
      schema: "SystemCompactBoundary",
      field: "compact_metadata",
      arktype: "Record<string, unknown>?",
      reason:
        "Inline shape: {trigger:'manual'|'auto', pre_tokens, post_tokens, ...}. Typed permissively for V1; consumer code doesn't narrow on subfields today. Optional in the canonical.",
    },
  ],
});

/**
 * Small helper to fan out a `uuid` fieldType patch across every system /
 * result / assistant frame. Keeps the patch list readable and the reason
 * field consistent. The canonical marks `uuid` as a required field on
 * inbound frames (the binary always emits one), so we leave it required.
 */
function uuidPatches(schemas: string[]) {
  return schemas.map((schema) => ({
    kind: "fieldType" as const,
    schema,
    field: "uuid",
    arktype: "string",
    reason:
      "nT() is the binary's UUID-string helper (matched against ../../../claude-code/src/entrypoints/sdk/coreSchemas.ts UUIDSchema). String at the wire layer — UUID validation is enforced upstream by the binary, not by the protocol package.",
  }));
}
