export { createCcSession } from "./session";
export {
  parseBashFrame,
  buildBashXml,
  escapeXml,
  decodeXml,
  type BashFrame,
} from "./shell";
export {
  sumContextTokens,
  getFrameUsage,
  type UsageLike,
} from "./usage";
export {
  isAssistantFrame,
  isControlRequest,
  isControlResponse,
  isLocalRespawnResult,
  isResultFrame,
  isStreamEventFrame,
  isSystemFrame,
  isUserFrame,
} from "./protocol";
export type {
  CcAtoms,
  CcSession,
  CcSessionOptions,
  CcPersistenceOptions,
  HookEntry,
  InitData,
  SessionState,
  ShellEntry,
  ShellSource,
  StorageLike,
  TaskEntry,
  TaskStatus,
  TaskUsage,
} from "./session";
export type {
  MessageEntry,
  LocalUserEntry,
  FrameEntry,
  StreamingEntry,
  InFlightMessage,
  StreamingBlock,
  TextBlock,
  ToolUseBlock,
  ThinkingBlock,
} from "./messages";
export type {
  PendingPermission,
  PermissionDecision,
  OnCanUseTool,
} from "./permissions";
export type { WsStatus } from "./ws";
export type {
  AssistantContentBlock,
  AssistantFrame,
  AssistantMessage,
  ControlRequestFrame,
  ControlResponseFrame,
  HookSubtype,
  InboundFrame,
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
  UnknownSystemFrame,
  UsageBlock,
  UserContentBlock,
  UserFrame,
  UserMessage,
} from "./protocol";
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

// Phase 4: thin reactive facade over `ClaudeClient` from `@cc-protocol`.
// This is an *additive* low-level entry point for consumers who want raw
// access to the protocol-package client; `createCcSession` remains the
// canonical higher-level API.
export { createReactiveClient } from "./reactive";
export type { ReactiveClient, ReactiveClientOptions } from "./reactive";

// Phase 4: re-export the protocol package's principals so callers can
// `import { ClaudeClient } from "@somewhatintelligent/cc-ws-client"` if
// they prefer one dep.
export { ClaudeClient } from "@somewhatintelligent/cc-protocol/client";
export type { ClientState } from "@somewhatintelligent/cc-protocol/client";
export { wsClientTransport } from "@somewhatintelligent/cc-protocol/transport/ws-client";
export type { Transport, Frame } from "@somewhatintelligent/cc-protocol/transport";
