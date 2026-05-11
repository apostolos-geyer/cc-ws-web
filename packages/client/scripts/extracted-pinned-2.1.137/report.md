# Claude Code schema extraction report

- total schemas extracted: **449**
- with `subtype` discriminant: **56** unique subtypes
- with `type` discriminant: **39** unique types
- unions resolved: **24**

## Schemas by `type` discriminant

| type literal | id(s) | inferred name |
|---|---|---|
| `adaptive` | `Bq5` | Adaptive |
| `addRules` | `fz_`, `RFH` | AddRules, AddRules |
| `assistant` | `K75` | Assistant |
| `auth_status` | `Z75` | AuthStatus |
| `base64` | `Asw` | Base64 |
| `bash_command` | `AH7` | BashCommand |
| `claudeai-proxy` | `qR4`, `lq5` | Claudeai-proxy, Claudeai-proxy |
| `control_cancel_request` | `sF3` | ControlCancelRequest |
| `control_request` | `fQ8` | ControlRequest |
| `control_response` | `lmK` | ControlResponse |
| `disabled` | `Fq5` | Disabled |
| `enabled` | `Uq5` | Enabled |
| `http` | `dq5` | Http |
| `json_schema` | `mq5` | JsonSchema |
| `keep_alive` | `nmK` | KeepAlive |
| `local` | `EFA` | Local |
| `mode_set_request` | `fH7` | ModeSetRequest |
| `plan_approval_request` | `wH7` | PlanApprovalRequest |
| `plan_approval_response` | `JH7` | PlanApprovalResponse |
| `prompt_suggestion` | `b75` | PromptSuggestion |
| `rate_limit_event` | `O75` | RateLimitEvent |
| `result` | `A75`, `z75` | SuccessRequest, Result |
| `sdk` | `_R4`, `cq5` | Sdk, Sdk |
| `shutdown_approved` | `DH7` | ShutdownApproved |
| `shutdown_rejected` | `MH7` | ShutdownRejected |
| `shutdown_request` | `jH7`, `Rl5` | ShutdownRequest, ShutdownRequest |
| `sse` | `aG4`, `Qq5` | Sse, Sse |
| `sse-ide` | `sG4` | Sse-ide |
| `stdio` | `RI6`, `gq5` | Stdio, Stdio |
| `stream_event` | `w75` | StreamEvent |
| `system` | `Y75`, `J75`, `j75`, `E$8`, `S$8`, `D75`, `M75`, `f75`, `X75`, `P75`, `W75`, `G75`, `L75`, `k75`, `V75`, `N75`, `v75`, `y75`, `h75`, `S75`, `C75`, `I75` | InitRequest, CompactBoundaryRequest, StatusRequest, PostTurnSummaryRequest, TaskSummaryRequest, MirrorErrorRequest, ApiRetryRequest, LocalCommandOutputRequest, HookStartedRequest, HookProgressRequest, HookResponseRequest, PluginInstallRequest, FilesPersistedRequest, TaskNotificationRequest, TaskStartedRequest, TaskUpdatedRequest, SessionStateChangedRequest, NotificationRequest, TaskProgressRequest, MemoryRecallRequest, ElicitationCompleteRequest, PermissionDeniedRequest |
| `text` | `gV7` | Text |
| `tool_progress` | `R75` | ToolProgress |
| `tool_use_summary` | `E75` | ToolUseSummary |
| `transcript_mirror` | `C$8` | TranscriptMirror |
| `update_environment_variables` | `tF3` | UpdateEnvironmentVariables |
| `user` | `TH7` | User |
| `ws` | `HR4` | Ws |
| `ws-ide` | `tG4` | Ws-ide |

## Schemas by `subtype` discriminant

| subtype literal | id(s) | inferred name | describe (first) |
|---|---|---|---|
| `api_retry` | `M75` | ApiRetryRequest | Emitted when an API request fails with a retryable error and will be retried aft… |
| `apply_flag_settings` | `umK` | ApplyFlagSettingsRequest | Merges the provided settings into the flag settings layer, updating the active c… |
| `can_use_tool` | `jmK` | CanUseToolRequest | Set when a safetyCheck is present anywhere in the decision reason (including nes… |
| `cancel_async_message` | `NmK` | CancelAsyncMessageRequest | Drops a pending async user message from the command queue by uuid. No-op if alre… |
| `compact_boundary` | `J75` | CompactBoundaryRequest | Relink info for messagesToKeep. Loaders splice the preserved segment at anchor_u… |
| `elicitation` | `pmK` | ElicitationRequest | Permission-display title from the MCP server's _meta['anthropic/permissionDispla… |
| `elicitation_complete` | `C75` | ElicitationCompleteRequest | Emitted when an MCP server confirms that a URL-mode elicitation is complete.… |
| `error` | `aF3` | ErrorRequest |  |
| `file_suggestions` | `GmK` | FileSuggestionsRequest | Requests at-mention file autocomplete suggestions for a partial path prefix. Ret… |
| `files_persisted` | `L75` | FilesPersistedRequest |  |
| `get_binary_version` | `LmK` | GetBinaryVersionRequest | Requests the responder's CLI binary version. Used by /version in --remote mode s… |
| `get_context_usage` | `RmK` | GetContextUsageRequest | Requests a breakdown of current context window usage by category.… |
| `get_session_cost` | `ZmK` | GetSessionCostRequest | Requests the formatted session cost summary (the same text /usage prints in non-… |
| `get_settings` | `mmK` | GetSettingsRequest | Returns the effective merged settings and the raw per-source settings.… |
| `hook_callback` | `hmK` | HookCallbackRequest | Delivers a hook callback with its input data.… |
| `hook_progress` | `P75` | HookProgressRequest |  |
| `hook_response` | `W75` | HookResponseRequest |  |
| `hook_started` | `X75` | HookStartedRequest |  |
| `init` | `Y75` | InitRequest | @internal Plugin load-time errors (e.g., unsatisfied dependency version). Affect… |
| `initialize` | `wmK` | InitializeRequest | Custom workflow body for the plan-mode system reminder. Replaces the default cod… |
| `interrupt` | `JmK` | InterruptRequest | Interrupts the currently running conversation turn.… |
| `local_command_output` | `f75` | LocalCommandOutputRequest | Output from a local slash command (e.g. /voice, /usage). Displayed as assistant-… |
| `mcp_call` | `kmK` | McpCallRequest | Fully-qualified MCP tool name, e.g. mcp__server__tool_name.… |
| `mcp_message` | `EmK` | McpMessageRequest | Sends a JSON-RPC message to a specific MCP server.… |
| `mcp_reconnect` | `ImK` | McpReconnectRequest | Reconnects a disconnected or failed MCP server.… |
| `mcp_set_servers` | `SmK` | McpSetServersRequest | Replaces the set of dynamically managed MCP servers.… |
| `mcp_status` | `WmK` | McpStatusRequest | Requests the current status of all MCP server connections.… |
| `mcp_toggle` | `bmK` | McpToggleRequest | Enables or disables an MCP server.… |
| `memory_recall` | `S75` | MemoryRecallRequest | How memories were surfaced: 'select' returns full file bodies chosen by the para… |
| `message_rated` | `cmK` | MessageRatedRequest | UUID of the assistant message being rated.… |
| `mirror_error` | `D75` | MirrorErrorRequest | Emitted when SessionStore.append() rejects or times out for a transcript-mirror … |
| `notification` | `y75` | NotificationRequest | Loop-side text notification. Mirrors the interactive REPL notification queue (ke… |
| `oauth_token_refresh` | `QmK` | OauthTokenRefreshRequest | @internal Request from the CLI subprocess to the SDK host for a fresh OAuth acce… |
| `permission_denied` | `I75` | PermissionDeniedRequest | Subagent ID when the denied tool call originated inside a subagent. Mirrors can_… |
| `plugin_install` | `G75` | PluginInstallRequest | Headless plugin installation progress (CLAUDE_CODE_SYNC_PLUGIN_INSTALL). started… |
| `post_turn_summary` | `E$8` | PostTurnSummaryRequest | @internal Background post-turn summary emitted after each assistant turn. summar… |
| `read_file` | `vmK` | ReadFileRequest | How to encode the bytes in `contents`. Defaults to utf-8 (lossy for binary); pas… |
| `reload_plugins` | `CmK` | ReloadPluginsRequest | Reloads plugins from disk and returns the refreshed session components.… |
| `rename_session` | `XmK` | RenameSessionRequest | Sets the user-facing title for the current session.… |
| `request_user_dialog` | `UmK` | RequestUserDialogRequest | Dialog-specific data passed to the host renderer. Shape is defined per dialog_ki… |
| `rewind_files` | `VmK` | RewindFilesRequest | Rewinds file changes made since a specific user message.… |
| `seed_read_state` | `ymK` | SeedReadStateRequest | Seeds the readFileState cache with a path+mtime entry. Use when a prior Read was… |
| `session_state_changed` | `v75` | SessionStateChangedRequest | Mirrors notifySessionStateChanged. 'idle' fires after heldBackResult flushes and… |
| `set_color` | `PmK` | SetColorRequest |  |
| `set_max_thinking_tokens` | `fmK` | SetMaxThinkingTokensRequest | Sets the maximum number of thinking tokens for extended thinking.… |
| `set_model` | `MmK` | SetModelRequest | Sets the model to use for subsequent conversation turns.… |
| `set_permission_mode` | `DmK` | SetPermissionModeRequest | @internal CCR ultraplan session marker.… |
| `status` | `j75` | StatusRequest |  |
| `stop_task` | `xmK` | StopTaskRequest | Stops a running task.… |
| `submit_feedback` | `gmK` | SubmitFeedbackRequest | Where the feedback flow was initiated. Stamped into the POST body and tengu_bug_… |
| `success` | `A75` | SuccessRequest |  |
| `success` | `oF3` | SuccessRequest |  |
| `task_notification` | `k75` | TaskNotificationRequest |  |
| `task_progress` | `h75` | TaskProgressRequest |  |
| `task_started` | `V75` | TaskStartedRequest | meta.name from the workflow script (e.g. 'spec'). Only set when task_type is 'lo… |
| `task_summary` | `S$8` | TaskSummaryRequest | @internal Mid-turn progress line from the debounced classifier. Mirrors external… |
| `task_updated` | `N75` | TaskUpdatedRequest | Wire-safe subset of TaskState fields that changed. Excludes abortController, mes… |

## Unions (with member ids resolved)

### `Aew` (26 members)
> Control requests a client sends to drive the loop u2014 the clientu2192loop command slice of SDKControlRequestInner. The remaining members are loopu2192client RPCs that block on a reply (see AgentOriginatedControlRequest).

| member id | discriminant | inferred name |
|---|---|---|
| `JmK` | subtype:interrupt | InterruptRequest |
| `wmK` | subtype:initialize | InitializeRequest |
| `DmK` | subtype:set_permission_mode | SetPermissionModeRequest |
| `MmK` | subtype:set_model | SetModelRequest |
| `fmK` | subtype:set_max_thinking_tokens | SetMaxThinkingTokensRequest |
| `XmK` | subtype:rename_session | RenameSessionRequest |
| `PmK` | subtype:set_color | SetColorRequest |
| `WmK` | subtype:mcp_status | McpStatusRequest |
| `RmK` | subtype:get_context_usage | GetContextUsageRequest |
| `ZmK` | subtype:get_session_cost | GetSessionCostRequest |
| `LmK` | subtype:get_binary_version | GetBinaryVersionRequest |
| `kmK` | subtype:mcp_call | McpCallRequest |
| `GmK` | subtype:file_suggestions | FileSuggestionsRequest |
| `VmK` | subtype:rewind_files | RewindFilesRequest |
| `NmK` | subtype:cancel_async_message | CancelAsyncMessageRequest |
| `vmK` | subtype:read_file | ReadFileRequest |
| `ymK` | subtype:seed_read_state | SeedReadStateRequest |
| `SmK` | subtype:mcp_set_servers | McpSetServersRequest |
| `CmK` | subtype:reload_plugins | ReloadPluginsRequest |
| `ImK` | subtype:mcp_reconnect | McpReconnectRequest |
| `bmK` | subtype:mcp_toggle | McpToggleRequest |
| `cmK` | subtype:message_rated | MessageRatedRequest |
| `xmK` | subtype:stop_task | StopTaskRequest |
| `umK` | subtype:apply_flag_settings | ApplyFlagSettingsRequest |
| `mmK` | subtype:get_settings | GetSettingsRequest |
| `gmK` | subtype:submit_feedback | SubmitFeedbackRequest |

### `De5` (0 members)
> MCP tool execution result

| member id | discriminant | inferred name |
|---|---|---|

### `ER4` (1 members)

| member id | discriminant | inferred name |
|---|---|---|
| `loose` | — | (unresolved) |

### `H75` (0 members)

| member id | discriminant | inferred name |
|---|---|---|

### `HH7` (28 members)

| member id | discriminant | inferred name |
|---|---|---|
| `oq5` | — | (unresolved) |
| `sq5` | — | (unresolved) |
| `tq5` | — | (unresolved) |
| `H95` | — | (unresolved) |
| `_95` | — | (unresolved) |
| `q95` | — | (unresolved) |
| `K95` | — | (unresolved) |
| `O95` | — | (unresolved) |
| `T95` | — | (unresolved) |
| `E95` | — | (unresolved) |
| `z95` | — | (unresolved) |
| `Y95` | — | (unresolved) |
| `w95` | — | (unresolved) |
| `J95` | — | (unresolved) |
| `j95` | — | (unresolved) |
| `aq5` | — | (unresolved) |
| `A95` | — | (unresolved) |
| `D95` | — | (unresolved) |
| `M95` | — | (unresolved) |
| `f95` | — | (unresolved) |
| `X95` | — | (unresolved) |
| `P95` | — | (unresolved) |
| `G95` | — | (unresolved) |
| `L95` | — | (unresolved) |
| `k95` | — | (unresolved) |
| `V95` | — | (unresolved) |
| `N95` | — | (unresolved) |
| `v95` | — | (unresolved) |

### `I$8` (29 members)

| member id | discriminant | inferred name |
|---|---|---|
| `K75` | type:assistant | Assistant |
| `h$8` | — | (unresolved) |
| `_75` | — | (unresolved) |
| `Y75` | type:system | InitRequest |
| `w75` | type:stream_event | StreamEvent |
| `J75` | type:system | CompactBoundaryRequest |
| `j75` | type:system | StatusRequest |
| `M75` | type:system | ApiRetryRequest |
| `f75` | type:system | LocalCommandOutputRequest |
| `X75` | type:system | HookStartedRequest |
| `P75` | type:system | HookProgressRequest |
| `W75` | type:system | HookResponseRequest |
| `G75` | type:system | PluginInstallRequest |
| `R75` | type:tool_progress | ToolProgress |
| `Z75` | type:auth_status | AuthStatus |
| `k75` | type:system | TaskNotificationRequest |
| `V75` | type:system | TaskStartedRequest |
| `N75` | type:system | TaskUpdatedRequest |
| `h75` | type:system | TaskProgressRequest |
| `v75` | type:system | SessionStateChangedRequest |
| `y75` | type:system | NotificationRequest |
| `L75` | type:system | FilesPersistedRequest |
| `E75` | type:tool_use_summary | ToolUseSummary |
| `S75` | type:system | MemoryRecallRequest |
| `O75` | type:rate_limit_event | RateLimitEvent |
| `C75` | type:system | ElicitationCompleteRequest |
| `I75` | type:system | PermissionDeniedRequest |
| `b75` | type:prompt_suggestion | PromptSuggestion |
| `D75` | type:system | MirrorErrorRequest |

### `LFA` (3 members)
> Controls Claude's thinking/reasoning behavior. When set, takes precedence over the deprecated maxThinkingTokens.

| member id | discriminant | inferred name |
|---|---|---|
| `Bq5` | type:adaptive | Adaptive |
| `Uq5` | type:enabled | Enabled |
| `Fq5` | type:disabled | Disabled |

### `NFA` (2 members)

| member id | discriminant | inferred name |
|---|---|---|
| `S95` | — | Schema_S95 |
| `l95` | — | Schema_l95 |

### `PAq` (5 members)
> Path to the plugin root, relative to the marketplace root (the directory containing .claude-plugin/, not .claude-plugin/ itself)

| member id | discriminant | inferred name |
|---|---|---|
| `Td` | — | Schema_Td |
| `XAq` | — | Schema_XAq |
| `LI6` | — | Schema_LI6 |
| `LI6` | — | Schema_LI6 |
| `LI6` | — | Schema_LI6 |

### `Pr` (8 members)

| member id | discriminant | inferred name |
|---|---|---|
| `RI6` | type:stdio | Stdio |
| `aG4` | type:sse | Sse |
| `sG4` | type:sse-ide | Sse-ide |
| `tG4` | type:ws-ide | Ws-ide |
| `eG4` | — | Schema_eG4 |
| `HR4` | type:ws | Ws |
| `_R4` | type:sdk | Sdk |
| `qR4` | type:claudeai-proxy | Claudeai-proxy |

### `Tew` (6 members)
> Control requests the agent loop originates and needs a reply to u2014 the loopu2192client RPC slice of SDKControlRequestInner. The remaining members are clientu2192loop commands (set/get/mcp/auth/etc).

| member id | discriminant | inferred name |
|---|---|---|
| `jmK` | subtype:can_use_tool | CanUseToolRequest |
| `hmK` | subtype:hook_callback | HookCallbackRequest |
| `EmK` | subtype:mcp_message | McpMessageRequest |
| `QmK` | subtype:oauth_token_refresh | OauthTokenRefreshRequest |
| `pmK` | subtype:elicitation | ElicitationRequest |
| `UmK` | subtype:request_user_dialog | RequestUserDialogRequest |

### `Ts9` (1 members)

| member id | discriminant | inferred name |
|---|---|---|
| `Pr` | — | Schema_Pr |

### `VFA` (3 members)

| member id | discriminant | inferred name |
|---|---|---|
| `fz_` | type:addRules | AddRules |
| `ae9` | — | ClassificationOfThisPermissionDecisionFor |
| `ae9` | — | ClassificationOfThisPermissionDecisionFor |

### `VI6` (2 members)

| member id | discriminant | inferred name |
|---|---|---|
| `kI6` | — | (unresolved) |
| `Td` | — | Schema_Td |

### `YAq` (1 members)
> Path to MCPB file relative to plugin root

| member id | discriminant | inferred name |
|---|---|---|
| `Td` | — | Schema_Td |

### `a95` (1 members)

| member id | discriminant | inferred name |
|---|---|---|
| `rH6` | — | Schema_rH6 |

### `ew` (6 members)

| member id | discriminant | inferred name |
|---|---|---|
| `h$8` | — | (unresolved) |
| `AH7` | type:bash_command | BashCommand |
| `fQ8` | type:control_request | ControlRequest |
| `lmK` | type:control_response | ControlResponse |
| `nmK` | type:keep_alive | KeepAlive |
| `tF3` | type:update_environment_variables | UpdateEnvironmentVariables |

### `g0_` (2 members)

| member id | discriminant | inferred name |
|---|---|---|
| `_g3` | — | Schema__g3 |
| `qg3` | — | Schema_qg3 |

### `imK` (8 members)

| member id | discriminant | inferred name |
|---|---|---|
| `I$8` | — | Schema_I$8 |
| `E$8` | type:system | PostTurnSummaryRequest |
| `S$8` | type:system | TaskSummaryRequest |
| `C$8` | type:transcript_mirror | TranscriptMirror |
| `lmK` | type:control_response | ControlResponse |
| `fQ8` | type:control_request | ControlRequest |
| `sF3` | type:control_cancel_request | ControlCancelRequest |
| `nmK` | type:keep_alive | KeepAlive |

### `nq5` (2 members)

| member id | discriminant | inferred name |
|---|---|---|
| `rH6` | — | Schema_rH6 |
| `lq5` | type:claudeai-proxy | Claudeai-proxy |

### `rF3` (32 members)

| member id | discriminant | inferred name |
|---|---|---|
| `JmK` | subtype:interrupt | InterruptRequest |
| `jmK` | subtype:can_use_tool | CanUseToolRequest |
| `wmK` | subtype:initialize | InitializeRequest |
| `DmK` | subtype:set_permission_mode | SetPermissionModeRequest |
| `MmK` | subtype:set_model | SetModelRequest |
| `fmK` | subtype:set_max_thinking_tokens | SetMaxThinkingTokensRequest |
| `XmK` | subtype:rename_session | RenameSessionRequest |
| `PmK` | subtype:set_color | SetColorRequest |
| `WmK` | subtype:mcp_status | McpStatusRequest |
| `RmK` | subtype:get_context_usage | GetContextUsageRequest |
| `ZmK` | subtype:get_session_cost | GetSessionCostRequest |
| `LmK` | subtype:get_binary_version | GetBinaryVersionRequest |
| `kmK` | subtype:mcp_call | McpCallRequest |
| `GmK` | subtype:file_suggestions | FileSuggestionsRequest |
| `hmK` | subtype:hook_callback | HookCallbackRequest |
| `EmK` | subtype:mcp_message | McpMessageRequest |
| `VmK` | subtype:rewind_files | RewindFilesRequest |
| `NmK` | subtype:cancel_async_message | CancelAsyncMessageRequest |
| `vmK` | subtype:read_file | ReadFileRequest |
| `ymK` | subtype:seed_read_state | SeedReadStateRequest |
| `SmK` | subtype:mcp_set_servers | McpSetServersRequest |
| `CmK` | subtype:reload_plugins | ReloadPluginsRequest |
| `ImK` | subtype:mcp_reconnect | McpReconnectRequest |
| `bmK` | subtype:mcp_toggle | McpToggleRequest |
| `cmK` | subtype:message_rated | MessageRatedRequest |
| `QmK` | subtype:oauth_token_refresh | OauthTokenRefreshRequest |
| `xmK` | subtype:stop_task | StopTaskRequest |
| `umK` | subtype:apply_flag_settings | ApplyFlagSettingsRequest |
| `mmK` | subtype:get_settings | GetSettingsRequest |
| `pmK` | subtype:elicitation | ElicitationRequest |
| `UmK` | subtype:request_user_dialog | RequestUserDialogRequest |
| `gmK` | subtype:submit_feedback | SubmitFeedbackRequest |

### `rH6` (4 members)

| member id | discriminant | inferred name |
|---|---|---|
| `gq5` | type:stdio | Stdio |
| `Qq5` | type:sse | Sse |
| `dq5` | type:http | Http |
| `cq5` | type:sdk | Sdk |

### `tRO` (2 members)

| member id | discriminant | inferred name |
|---|---|---|
| `F6_` | — | SchemaVersion |
| `g6_` | — | SchemaVersion |

### `zew` (4 members)
> Observational messages the agent loop emits u2014 fire-and-forget, no reply expected. The remaining StdoutMessage members are control-protocol traffic (requests the loop originates and needs a reply to, responses to client-originated requests, keep-alives). This sub-union is the target for QueryEvent convergence so a Transport-shaped REPL can consume events without filtering control noise.

| member id | discriminant | inferred name |
|---|---|---|
| `I$8` | — | Schema_I$8 |
| `E$8` | type:system | PostTurnSummaryRequest |
| `S$8` | type:system | TaskSummaryRequest |
| `C$8` | type:transcript_mirror | TranscriptMirror |

## Counts by zod kind

- `array`: 6
- `boolean`: 1
- `discriminatedUnion`: 5
- `enum`: 25
- `literal`: 2
- `looseObject`: 1
- `object`: 324
- `partialRecord`: 1
- `preprocess`: 1
- `record`: 4
- `strictObject`: 39
- `string`: 11
- `union`: 24
- `unknown`: 5