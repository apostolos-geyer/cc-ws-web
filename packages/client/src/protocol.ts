// Phase 4b: re-export wire-frame types + predicates from `@cc-protocol`.
// The shared types are universal and live in the protocol package; this
// barrel keeps the legacy import surface stable for downstream packages
// (`@cc-ws-react`, `@cc-ws-svelte`, `@cc-ws-element`).

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
  OutboundControlRequestFrame,
  OutboundControlRequestSubtype,
  OutboundFrame,
  RateLimitEventFrame,
  ResultFrame,
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
} from "@somewhatintelligent/cc-protocol/client";
export {
  isAssistantFrame,
  isControlRequest,
  isControlResponse,
  isResultFrame,
  isStreamEventFrame,
  isSystemFrame,
  isUserFrame,
} from "@somewhatintelligent/cc-protocol/client";

// SessionMode + buildSpawnArgs are web-only — `--continue`/`--resume` CLI
// args are a runtime concern not in the universal core. Kept here.
export type SessionMode =
  | { kind: "new" }
  | { kind: "continue" }
  | { kind: "resume"; sessionId: string };

export function makeRequestId(): string {
  return crypto.randomUUID();
}

// Effort is spawn-time only (no set_effort control_request); --model
// picks the launch model and set_model can change it later
export function buildSpawnArgs(opts: {
  mode: SessionMode;
  effort?: string;
  model?: string;
  permissionMode?: string;
  includePartialMessages?: boolean;
  includeHookEvents?: boolean;
  permissionPromptTool?: string | null;
}): string[] {
  const args: string[] = [];
  if (opts.mode.kind === "continue") args.push("--continue");
  else if (opts.mode.kind === "resume") args.push("--resume", opts.mode.sessionId);
  if (opts.permissionMode) args.push("--permission-mode", opts.permissionMode);
  if (opts.permissionPromptTool) args.push("--permission-prompt-tool", opts.permissionPromptTool);
  if (opts.includePartialMessages) args.push("--include-partial-messages");
  if (opts.includeHookEvents) args.push("--include-hook-events");
  if (opts.effort) args.push("--effort", opts.effort);
  if (opts.model) args.push("--model", opts.model);
  return args;
}

// _local:respawn — bridge-side frames intercepted by the cc-ws-server.
// Stays in cc-ws-client because they're not part of the universal binary
// protocol; they're a transport-layer extension specific to the bridge.
export type LocalRespawnResultFrame = {
  _local: "respawnResult";
  requestId: string;
  ok: boolean;
  error?: string;
};

export type LocalRespawnFrame = {
  _local: "respawn";
  args: string[];
  requestId: string;
};

export function isLocalRespawnResult(f: unknown): f is LocalRespawnResultFrame {
  return !!f && typeof f === "object" && (f as { _local?: unknown })._local === "respawnResult";
}
