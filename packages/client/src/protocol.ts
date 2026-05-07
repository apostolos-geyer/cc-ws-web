// Wire protocol — every JSON shape exchanged between the browser and the
// bridge. Two channels share the same WS:
//   1. Claude Code stream-json frames (forwarded verbatim to/from the child).
//   2. _local frames (intercepted by the bridge, never reach the child).
//
// Field sets are pulled from the binary's own runtime schemas (see
// apps/slopbox/.spec/artifacts/extracted/canonical.json in the platform
// repo). Variants we don't actively consume still ride the same
// discriminated union so consumers can narrow without `as any` escape
// hatches. Unknown system subtypes fall through to UnknownSystemFrame.

// ---------- shared ----------

export type Json = unknown;

export type SessionMode =
  | { kind: "new" }
  | { kind: "continue" }
  | { kind: "resume"; sessionId: string };

// ---------- content blocks (inside message.content arrays) ----------

export type TextContentBlock = { type: "text"; text: string };
export type ThinkingContentBlock = { type: "thinking"; thinking: string };
export type ToolUseContentBlock = {
  type: "tool_use";
  id: string;
  name: string;
  input: unknown;
};
export type ToolResultContentBlock = {
  type: "tool_result";
  tool_use_id: string;
  content: string | Array<TextContentBlock | { type: "image"; source: unknown }>;
  is_error?: boolean;
};
export type ImageContentBlock = { type: "image"; source: unknown };

export type AssistantContentBlock =
  | TextContentBlock
  | ThinkingContentBlock
  | ToolUseContentBlock;

export type UserContentBlock =
  | TextContentBlock
  | ToolResultContentBlock
  | ImageContentBlock;

// ---------- assistant / user message envelopes ----------

export type AssistantMessage = {
  id: string;
  role: "assistant";
  model?: string;
  content: AssistantContentBlock[];
  stop_reason?: string | null;
  stop_sequence?: string | null;
  usage?: UsageBlock;
};

export type UserMessage = {
  role: "user";
  content: string | UserContentBlock[];
};

export type UsageBlock = {
  input_tokens?: number;
  output_tokens?: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
  service_tier?: string;
};

// ---------- streaming events (carried on `stream_event` frames) ----------

export type StreamEvent =
  | { type: "message_start"; message: AssistantMessage }
  | {
      type: "content_block_start";
      index: number;
      content_block: AssistantContentBlock;
    }
  | {
      type: "content_block_delta";
      index: number;
      delta:
        | { type: "text_delta"; text: string }
        | { type: "thinking_delta"; thinking: string }
        | { type: "input_json_delta"; partial_json: string }
        | { type: "signature_delta"; signature: string };
    }
  | { type: "content_block_stop"; index: number }
  | { type: "message_delta"; delta: { stop_reason?: string }; usage?: UsageBlock }
  | { type: "message_stop" };

// ---------- inbound: system frames ----------

export type SessionStateValue = "idle" | "running" | "requires_action";

export type SystemInit = {
  type: "system";
  subtype: "init";
  agents?: string[];
  apiKeySource?: string;
  betas?: string[];
  claude_code_version?: string;
  cwd?: string;
  tools?: string[];
  mcp_servers?: unknown[];
  model?: string;
  permissionMode?: string;
  permission_mode?: string;
  slash_commands?: string[];
  output_style?: string;
  skills?: string[];
  plugins?: unknown[];
  plugin_errors?: unknown;
  fast_mode_state?: unknown;
  analytics_disabled?: boolean;
  memory_paths?: string[];
  uuid?: string;
  session_id?: string;
};

export type SystemStatus = {
  type: "system";
  subtype: "status";
  status?: string | null;
  permissionMode?: string;
  compact_result?: unknown;
  compact_error?: unknown;
  uuid?: string;
  session_id?: string;
};

export type SystemSessionStateChanged = {
  type: "system";
  subtype: "session_state_changed";
  state: SessionStateValue;
  uuid?: string;
  session_id?: string;
};

export type SystemTaskStarted = {
  type: "system";
  subtype: "task_started";
  task_id: string;
  tool_use_id?: string;
  description: string;
  task_type?: string;
  workflow_name?: string;
  prompt?: string;
  skip_transcript?: boolean;
  uuid?: string;
  session_id?: string;
};

export type SystemTaskProgress = {
  type: "system";
  subtype: "task_progress";
  task_id: string;
  tool_use_id?: string;
  description?: string;
  usage?: TaskUsageBlock;
  last_tool_name?: string;
  summary?: string;
  uuid?: string;
  session_id?: string;
};

export type SystemTaskNotification = {
  type: "system";
  subtype: "task_notification";
  task_id: string;
  tool_use_id?: string;
  status?: "completed" | "failed" | "stopped" | string;
  output_file?: string;
  summary?: string;
  usage?: TaskUsageBlock;
  skip_transcript?: boolean;
  uuid?: string;
  session_id?: string;
};

// task_updated.patch is a wire-safe subset of TaskState fields that changed.
// Mergeable into the local task map. Excludes abortController/messages/result.
export type TaskUpdatedPatch = {
  status?: "running" | "completed" | "failed" | "killed" | "stopped" | string;
  description?: string;
  summary?: string;
  last_tool_name?: string;
  output_file?: string;
  usage?: TaskUsageBlock;
  tool_use_id?: string;
};

export type SystemTaskUpdated = {
  type: "system";
  subtype: "task_updated";
  task_id: string;
  patch: TaskUpdatedPatch;
  uuid?: string;
  session_id?: string;
};

export type TaskUsageBlock = {
  total_tokens?: number;
  tool_uses?: number;
  duration_ms?: number;
  input_tokens?: number;
  output_tokens?: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
};

export type HookSubtype = "hook_started" | "hook_progress" | "hook_response";

export type SystemHook = {
  type: "system";
  subtype: HookSubtype;
  hook_event_name?: string;
  hookEventName?: string;
  hook_id?: string;
  status?: string;
  output?: unknown;
  error?: string;
  uuid?: string;
  session_id?: string;
};

export type SystemLocalCommandOutput = {
  type: "system";
  subtype: "local_command_output";
  content?: string;
  uuid?: string;
  session_id?: string;
};

export type SystemCompactBoundary = {
  type: "system";
  subtype: "compact_boundary";
  compact_metadata?: unknown;
  uuid?: string;
  session_id?: string;
};

export type SystemFrame =
  | SystemInit
  | SystemStatus
  | SystemSessionStateChanged
  | SystemTaskStarted
  | SystemTaskProgress
  | SystemTaskNotification
  | SystemTaskUpdated
  | SystemHook
  | SystemLocalCommandOutput
  | SystemCompactBoundary;

// Catch-all for system subtypes the binary may emit but the lib doesn't
// model. Sits OUTSIDE SystemFrame so narrowing on a known subtype yields
// a single specific variant; consumers that need the broad case (e.g.
// renderers showing every system frame) accept SystemFrame | UnknownSystemFrame.
export type UnknownSystemFrame = {
  type: "system";
  subtype: string;
  uuid?: string;
  session_id?: string;
};

// ---------- inbound: non-system frames ----------

export type AssistantFrame = {
  type: "assistant";
  message: AssistantMessage;
  parent_tool_use_id?: string | null;
  error?: unknown;
  uuid?: string;
  session_id?: string;
};

export type UserFrame = {
  type: "user";
  message: UserMessage;
  parent_tool_use_id?: string | null;
  isSynthetic?: boolean;
  isReplay?: boolean;
  tool_use_result?: unknown;
  priority?: string;
  origin?: string;
  client_platform?: string;
  shouldQuery?: boolean;
  timestamp?: number;
  uuid?: string;
  session_id?: string;
};

export type ResultFrame = {
  type: "result";
  subtype?: string;
  duration_ms?: number;
  duration_api_ms?: number;
  is_error?: boolean;
  num_turns?: number;
  stop_reason?: string | null;
  total_cost_usd?: number;
  usage?: UsageBlock;
  modelUsage?: Record<string, UsageBlock>;
  permission_denials?: unknown[];
  errors?: unknown[];
  terminal_reason?: string;
  fast_mode_state?: unknown;
  origin?: string;
  uuid?: string;
  session_id?: string;
};

export type StreamEventFrame = {
  type: "stream_event";
  event: StreamEvent;
  parent_tool_use_id?: string | null;
  uuid?: string;
  session_id?: string;
  ttft_ms?: number;
};

export type RateLimitEventFrame = {
  type: "rate_limit_event";
  resetsAt?: number;
  resetsIn?: number;
  retryAfter?: number;
};

// ---------- inbound: control_request (binary asks us) ----------

export type CanUseToolControlRequest = {
  subtype: "can_use_tool";
  tool_name?: string;
  input?: unknown;
  permission_suggestions?: unknown[];
};

// Other inbound control_request subtypes the lib may receive but doesn't
// drive UI off of. We accept them with subtype + an opaque payload.
export type UnknownControlRequest = {
  subtype: string;
};

export type ControlRequestPayload = CanUseToolControlRequest | UnknownControlRequest;

export type ControlRequestFrame = {
  type: "control_request";
  request_id: string;
  request: ControlRequestPayload;
};

// ---------- inbound: control_response ----------

export type ControlResponseSuccess = {
  subtype: "success";
  request_id: string;
  response?: unknown;
};

export type ControlResponseError = {
  subtype: "error";
  request_id: string;
  error?: string;
};

export type ControlResponseFrame = {
  type: "control_response";
  response: ControlResponseSuccess | ControlResponseError;
  // Some bridge variants put request_id at the outer level. Keep optional
  // for forward compatibility; consumers should prefer response.request_id.
  request_id?: string;
};

// ---------- inbound: _local frames (bridge-injected) ----------

export type LocalRespawnResultFrame = {
  _local: "respawnResult";
  requestId: string;
  ok: boolean;
  error?: string;
};

// ---------- inbound union ----------

export type InboundFrame =
  | AssistantFrame
  | UserFrame
  | ResultFrame
  | StreamEventFrame
  | SystemFrame
  | UnknownSystemFrame
  | ControlRequestFrame
  | ControlResponseFrame
  | RateLimitEventFrame
  | LocalRespawnResultFrame;

// ---------- outbound: frames the client sends to the bridge ----------

export type UserMessageFrame = {
  type: "user";
  message: { role: "user"; content: string };
};

export type BashCommandFrame = {
  type: "bash_command";
  command: string;
};

// Outbound control_request subtypes we use. Nested envelope.
export type OutboundControlRequestSubtype =
  | { subtype: "interrupt" }
  | { subtype: "set_permission_mode"; mode: string }
  | { subtype: "set_model"; model: string }
  | { subtype: "set_max_thinking_tokens"; max_tokens: number }
  | { subtype: "end_session" }
  | { subtype: "get_settings" }
  | { subtype: "file_suggestions"; query: string }
  | { subtype: "stop_task"; task_id: string };

export type OutboundControlRequestFrame = {
  type: "control_request";
  request_id: string;
  request: OutboundControlRequestSubtype;
};

// Reply to a can_use_tool control_request. Nested envelope.
export type CanUseToolResponseFrame = {
  type: "control_response";
  response: {
    subtype: "success";
    request_id: string;
    response:
      | { behavior: "allow"; updatedInput: unknown }
      | { behavior: "deny"; message: string };
  };
};

export type LocalRespawnFrame = {
  _local: "respawn";
  args: string[];
  requestId: string;
};

export type OutboundFrame =
  | UserMessageFrame
  | BashCommandFrame
  | OutboundControlRequestFrame
  | CanUseToolResponseFrame
  | LocalRespawnFrame;

// ---------- helpers ----------

export function makeRequestId(): string {
  return crypto.randomUUID();
}

// Translate a SessionMode + extras into the CLI flag list for the spawn
// (consumed by the bridge via _local:respawn). Effort and model are spawn-
// time only at present (no set_effort control_request exists; --model picks
// the launch model and set_model can change it later).
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

// Discriminator helpers — narrow once, reuse the type guard.

export function isSystemFrame(f: InboundFrame): f is SystemFrame | UnknownSystemFrame {
  return (f as { type?: unknown }).type === "system";
}

export function isUserFrame(f: InboundFrame): f is UserFrame {
  return (f as { type?: unknown }).type === "user";
}

export function isAssistantFrame(f: InboundFrame): f is AssistantFrame {
  return (f as { type?: unknown }).type === "assistant";
}

export function isStreamEventFrame(f: InboundFrame): f is StreamEventFrame {
  return (f as { type?: unknown }).type === "stream_event";
}

export function isResultFrame(f: InboundFrame): f is ResultFrame {
  return (f as { type?: unknown }).type === "result";
}

export function isControlRequest(f: InboundFrame): f is ControlRequestFrame {
  return (f as { type?: unknown }).type === "control_request";
}

export function isControlResponse(f: InboundFrame): f is ControlResponseFrame {
  return (f as { type?: unknown }).type === "control_response";
}

export function isLocalRespawnResult(f: InboundFrame): f is LocalRespawnResultFrame {
  return (f as { _local?: unknown })._local === "respawnResult";
}

// Backwards-compat: existing call sites expect this name.
export type CanUseToolRequest = ControlRequestFrame & {
  request: CanUseToolControlRequest;
};
