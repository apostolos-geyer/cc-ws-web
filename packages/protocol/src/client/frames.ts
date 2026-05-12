/**
 * Hand-written, web-safe wire-frame types for the consumer side of the
 * Claude Code stream-json protocol.
 *
 * These mirror the field subsets the existing consumers (the React /
 * Svelte / element apps) read. They overlap with — but are deliberately
 * looser than — the generated arktype schemas in
 * `packages/protocol/generated/<ver>/types.ts`. The generated types are
 * pinned to a specific binary version and include every field the binary
 * emits; these are the field subset our state aggregation actually
 * consumes, plus a few legacy-field aliases (`permissionMode` /
 * `permission_mode`, etc.) for backward compatibility with snapshots
 * captured from older binaries.
 *
 * Pure types — zero runtime, browser-safe.
 */

// ---------- shared ----------

export type Json = unknown;

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

// ---------- streaming events ----------

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
  request_id?: string;
};

export type CanUseToolRequest = ControlRequestFrame & {
  request: CanUseToolControlRequest;
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
  | RateLimitEventFrame;

// ---------- outbound frames ----------

export type UserMessageFrame = {
  type: "user";
  message: { role: "user"; content: string | UserContentBlock[] };
};

export type BashCommandFrame = {
  type: "bash_command";
  command: string;
};

export type OutboundControlRequestSubtype =
  | { subtype: "interrupt" }
  | { subtype: "set_permission_mode"; mode: string }
  | { subtype: "set_model"; model: string }
  | { subtype: "set_max_thinking_tokens"; max_tokens: number }
  | { subtype: "end_session" }
  | { subtype: "get_settings" }
  | { subtype: "get_context_usage" }
  | { subtype: "get_session_cost" }
  | { subtype: "get_binary_version" }
  | { subtype: "mcp_status" }
  | { subtype: "reload_plugins" }
  | { subtype: "apply_flag_settings" }
  | { subtype: "seed_read_state" }
  | { subtype: "file_suggestions"; query: string }
  | { subtype: "stop_task"; task_id: string };

export type OutboundControlRequestFrame = {
  type: "control_request";
  request_id: string;
  request: OutboundControlRequestSubtype;
};

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

export type OutboundFrame =
  | UserMessageFrame
  | BashCommandFrame
  | OutboundControlRequestFrame
  | CanUseToolResponseFrame;

// ---------- predicates ----------

export function isSystemFrame(f: unknown): f is SystemFrame | UnknownSystemFrame {
  return !!f && typeof f === "object" && (f as { type?: unknown }).type === "system";
}

export function isUserFrame(f: unknown): f is UserFrame {
  return !!f && typeof f === "object" && (f as { type?: unknown }).type === "user";
}

export function isAssistantFrame(f: unknown): f is AssistantFrame {
  return !!f && typeof f === "object" && (f as { type?: unknown }).type === "assistant";
}

export function isStreamEventFrame(f: unknown): f is StreamEventFrame {
  return !!f && typeof f === "object" && (f as { type?: unknown }).type === "stream_event";
}

export function isResultFrame(f: unknown): f is ResultFrame {
  return !!f && typeof f === "object" && (f as { type?: unknown }).type === "result";
}

export function isControlRequest(f: unknown): f is ControlRequestFrame {
  return !!f && typeof f === "object" && (f as { type?: unknown }).type === "control_request";
}

export function isControlResponse(f: unknown): f is ControlResponseFrame {
  return !!f && typeof f === "object" && (f as { type?: unknown }).type === "control_response";
}
