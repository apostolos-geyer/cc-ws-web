// Phase 4b: cc-ws-client is now a thin nanostores+persistence facade over
// `ClaudeClient` from `@somewhatintelligent/cc-protocol`. All wire-frame
// → state aggregation lives in the universal protocol package; this
// package owns reactivity, localStorage persistence, the `_local:respawn`
// flow with the cc-ws-server bridge, and effort tracking (which requires
// a respawn because there's no `set_effort` control_request).
//
// Every public symbol the legacy v0.1.4 index.ts exported is still
// exported with the same name and a type-compatible shape so React /
// Svelte / element packages and consuming apps need no code changes.

// ---------- session factory + atoms ----------

export {
  createCcSession,
  createReactiveClient,
  type CcAtoms,
  type CcSession,
  type CcSessionOptions,
  type ReactiveClient,
  type ReactiveClientOptions,
  type WsStatus,
} from "./reactive";

// ---------- usage helpers (web-only convenience) ----------

export {
  sumContextTokens,
  getFrameUsage,
  type UsageLike,
} from "./usage";

// ---------- shell helpers (pure, browser-safe — re-export from protocol) ----------

export {
  parseBashFrame,
  buildBashXml,
  escapeXml,
  decodeXml,
  type BashFrame,
} from "@somewhatintelligent/cc-protocol/client";

// ---------- wire-frame types + predicates + spawn-args + _local types ----------

export type {
  AssistantContentBlock,
  AssistantFrame,
  AssistantMessage,
  BashCommandFrame,
  CanUseToolControlRequest,
  CanUseToolRequest,
  CanUseToolResponseFrame,
  ControlRequestFrame,
  ControlRequestPayload,
  ControlResponseError,
  ControlResponseFrame,
  ControlResponseSuccess,
  HookSubtype,
  ImageContentBlock,
  InboundFrame,
  Json,
  LocalRespawnFrame,
  LocalRespawnResultFrame,
  OutboundControlRequestFrame,
  OutboundControlRequestSubtype,
  OutboundFrame,
  RateLimitEventFrame,
  ResultFrame,
  SessionMode,
  SessionStateValue,
  StreamEvent,
  StreamEventFrame,
  SystemCompactBoundary,
  SystemFrame,
  SystemHook,
  SystemInit,
  SystemLocalCommandOutput,
  SystemSessionStateChanged,
  SystemStatus,
  SystemTaskNotification,
  SystemTaskProgress,
  SystemTaskStarted,
  SystemTaskUpdated,
  TaskUpdatedPatch,
  TaskUsageBlock,
  TextContentBlock,
  ThinkingContentBlock,
  ToolResultContentBlock,
  ToolUseContentBlock,
  UnknownControlRequest,
  UnknownSystemFrame,
  UsageBlock,
  UserContentBlock,
  UserFrame,
  UserMessage,
  UserMessageFrame,
} from "./protocol";
export {
  buildSpawnArgs,
  isAssistantFrame,
  isControlRequest,
  isControlResponse,
  isLocalRespawnResult,
  isResultFrame,
  isStreamEventFrame,
  isSystemFrame,
  isUserFrame,
  makeRequestId,
} from "./protocol";

// ---------- state-aggregation types (sourced from @cc-protocol/client) ----------

export type {
  FrameEntry,
  HookEntry,
  InFlightMessage,
  InitData,
  LocalUserEntry,
  MessageEntry,
  PendingPermission,
  PermissionDecision,
  OnCanUseTool,
  ShellEntry,
  ShellSource,
  StreamingBlock,
  StreamingEntry,
  TaskEntry,
  TaskStatus,
  TaskUsage,
  TextBlock,
  ThinkingBlock,
  ToolUseBlock,
} from "@somewhatintelligent/cc-protocol/client";

// ---------- session state aliases ----------

import type { SessionState as ProtocolSessionState } from "@somewhatintelligent/cc-protocol/client";
export type SessionState = ProtocolSessionState;

// ---------- persistence ----------

export type {
  CcPersistenceOptions,
  StorageLike,
  PersistedShape,
  PersistenceConfig,
} from "./persistence";

// ---------- modes catalog ----------

export {
  PERMISSION_MODE_DEFS,
  PERMISSION_MODE_OPTIONS,
  KNOWN_PERMISSION_MODES,
  CYCLE_ORDER,
  nextCycleMode,
  MODEL_DEFS,
  MODEL_OPTIONS,
  KNOWN_MODELS,
  EFFORT_DEFS,
  EFFORT_OPTIONS,
  KNOWN_EFFORTS,
} from "./modes";
export type {
  PermissionMode,
  Model,
  Effort,
} from "./modes";

// ---------- raw protocol package re-exports ----------

export { ClaudeClient } from "@somewhatintelligent/cc-protocol/client";
export type { ClientState, ClaudeClientOptions } from "@somewhatintelligent/cc-protocol/client";
export { wsClientTransport } from "@somewhatintelligent/cc-protocol/transport/ws-client";
export type { Transport, Frame } from "@somewhatintelligent/cc-protocol/transport";
