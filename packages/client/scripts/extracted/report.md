# Claude Code schema extraction report

- total schemas extracted: **453**
- with `subtype` discriminant: **57** unique subtypes
- with `type` discriminant: **39** unique types
- unions resolved: **25**

## Schemas by `type` discriminant

| type literal | id(s) | inferred name |
|---|---|---|
| `adaptive` | `lK5` | Adaptive |
| `addRules` | `G$_`, `AgH` | AddRules, AddRules |
| `assistant` | `w15` | Assistant |
| `auth_status` | `h15` | AuthStatus |
| `base64` | `MqJ` | Base64 |
| `bash_command` | `G67` | BashCommand |
| `claudeai-proxy` | `eL4`, `tK5` | Claudeai-proxy, Claudeai-proxy |
| `control_cancel_request` | `Ec3` | ControlCancelRequest |
| `control_request` | `Oc8` | ControlRequest |
| `control_response` | `BUK` | ControlResponse |
| `disabled` | `iK5` | Disabled |
| `enabled` | `nK5` | Enabled |
| `http` | `aK5` | Http |
| `json_schema` | `dK5` | JsonSchema |
| `keep_alive` | `UUK` | KeepAlive |
| `local` | `jlA` | Local |
| `mode_set_request` | `h67` | ModeSetRequest |
| `plan_approval_request` | `k67` | PlanApprovalRequest |
| `plan_approval_response` | `V67` | PlanApprovalResponse |
| `prompt_suggestion` | `F15` | PromptSuggestion |
| `rate_limit_event` | `J15` | RateLimitEvent |
| `result` | `D15`, `M15` | SuccessRequest, Result |
| `sdk` | `tL4`, `sK5` | Sdk, Sdk |
| `shutdown_approved` | `v67` | ShutdownApproved |
| `shutdown_rejected` | `y67` | ShutdownRejected |
| `shutdown_request` | `N67`, `Cr5` | ShutdownRequest, ShutdownRequest |
| `sse` | `iL4`, `oK5` | Sse, Sse |
| `sse-ide` | `rL4` | Sse-ide |
| `stdio` | `Ub6`, `rK5` | Stdio, Stdio |
| `stream_event` | `P15` | StreamEvent |
| `system` | `X15`, `W15`, `G15`, `Kw8`, `Ow8`, `Z15`, `R15`, `L15`, `k15`, `V15`, `N15`, `v15`, `E15`, `S15`, `C15`, `I15`, `b15`, `x15`, `u15`, `p15`, `B15`, `U15` | InitRequest, CompactBoundaryRequest, StatusRequest, PostTurnSummaryRequest, TaskSummaryRequest, MirrorErrorRequest, ApiRetryRequest, LocalCommandOutputRequest, HookStartedRequest, HookProgressRequest, HookResponseRequest, PluginInstallRequest, FilesPersistedRequest, TaskNotificationRequest, TaskStartedRequest, TaskUpdatedRequest, SessionStateChangedRequest, NotificationRequest, TaskProgressRequest, MemoryRecallRequest, ElicitationCompleteRequest, PermissionDeniedRequest |
| `text` | `Ky7` | Text |
| `tool_progress` | `y15` | ToolProgress |
| `tool_use_summary` | `m15` | ToolUseSummary |
| `transcript_mirror` | `Tw8` | TranscriptMirror |
| `update_environment_variables` | `Sc3` | UpdateEnvironmentVariables |
| `user` | `W67` | User |
| `ws` | `sL4` | Ws |
| `ws-ide` | `oL4` | Ws-ide |

## Schemas by `subtype` discriminant

| subtype literal | id(s) | inferred name | describe (first) |
|---|---|---|---|
| `api_retry` | `R15` | ApiRetryRequest | Emitted when an API request fails with a retryable error and will be retried aft… |
| `apply_flag_settings` | `hUK` | ApplyFlagSettingsRequest | Merges the provided settings into the flag settings layer, updating the active c… |
| `background_tasks` | `yUK` | BackgroundTasksRequest | When set, backgrounds only the task whose originating tool_use block has this id… |
| `can_use_tool` | `OUK` | CanUseToolRequest | Set when a safetyCheck is present anywhere in the decision reason (including nes… |
| `cancel_async_message` | `PUK` | CancelAsyncMessageRequest | Drops a pending async user message from the command queue by uuid. No-op if alre… |
| `compact_boundary` | `W15` | CompactBoundaryRequest | Relink info for messagesToKeep. Loaders splice the preserved segment at anchor_u… |
| `elicitation` | `SUK` | ElicitationRequest | Permission-display title from the MCP server's _meta['anthropic/permissionDispla… |
| `elicitation_complete` | `B15` | ElicitationCompleteRequest | Emitted when an MCP server confirms that a URL-mode elicitation is complete.… |
| `error` | `hc3` | ErrorRequest |  |
| `file_suggestions` | `JUK` | FileSuggestionsRequest | Requests at-mention file autocomplete suggestions for a partial path prefix. Ret… |
| `files_persisted` | `E15` | FilesPersistedRequest |  |
| `get_binary_version` | `MUK` | GetBinaryVersionRequest | Requests the responder's CLI binary version. Used by /version in --remote mode s… |
| `get_context_usage` | `jUK` | GetContextUsageRequest | Requests a breakdown of current context window usage by category.… |
| `get_session_cost` | `DUK` | GetSessionCostRequest | Requests the formatted session cost summary (the same text /usage prints in non-… |
| `get_settings` | `EUK` | GetSettingsRequest | Returns the effective merged settings and the raw per-source settings.… |
| `hook_callback` | `ZUK` | HookCallbackRequest | Delivers a hook callback with its input data.… |
| `hook_progress` | `V15` | HookProgressRequest |  |
| `hook_response` | `N15` | HookResponseRequest |  |
| `hook_started` | `k15` | HookStartedRequest |  |
| `init` | `X15` | InitRequest | @internal Plugin load-time errors (e.g., unsatisfied dependency version). Affect… |
| `initialize` | `qUK` | InitializeRequest | Custom workflow body for the plan-mode system reminder. Replaces the default cod… |
| `interrupt` | `KUK` | InterruptRequest | Interrupts the currently running conversation turn.… |
| `local_command_output` | `L15` | LocalCommandOutputRequest | Output from a local slash command (e.g. /voice, /usage). Displayed as assistant-… |
| `mcp_call` | `fUK` | McpCallRequest | Fully-qualified MCP tool name, e.g. mcp__server__tool_name.… |
| `mcp_message` | `RUK` | McpMessageRequest | Sends a JSON-RPC message to a specific MCP server.… |
| `mcp_reconnect` | `VUK` | McpReconnectRequest | Reconnects a disconnected or failed MCP server.… |
| `mcp_set_servers` | `LUK` | McpSetServersRequest | Replaces the set of dynamically managed MCP servers.… |
| `mcp_status` | `wUK` | McpStatusRequest | Requests the current status of all MCP server connections.… |
| `mcp_toggle` | `NUK` | McpToggleRequest | Enables or disables an MCP server.… |
| `memory_recall` | `p15` | MemoryRecallRequest | How memories were surfaced: 'select' returns full file bodies chosen by the para… |
| `message_rated` | `pUK` | MessageRatedRequest | UUID of the assistant message being rated.… |
| `mirror_error` | `Z15` | MirrorErrorRequest | Emitted when SessionStore.append() rejects or times out for a transcript-mirror … |
| `notification` | `x15` | NotificationRequest | Loop-side text notification. Mirrors the interactive REPL notification queue (ke… |
| `oauth_token_refresh` | `uUK` | OauthTokenRefreshRequest | @internal Request from the CLI subprocess to the SDK host for a fresh OAuth acce… |
| `permission_denied` | `U15` | PermissionDeniedRequest | Subagent ID when the denied tool call originated inside a subagent. Mirrors can_… |
| `plugin_install` | `v15` | PluginInstallRequest | Headless plugin installation progress (CLAUDE_CODE_SYNC_PLUGIN_INSTALL). started… |
| `post_turn_summary` | `Kw8` | PostTurnSummaryRequest | @internal Background post-turn summary emitted after each assistant turn. summar… |
| `read_file` | `WUK` | ReadFileRequest | How to encode the bytes in `contents`. Defaults to utf-8 (lossy for binary); pas… |
| `reload_plugins` | `kUK` | ReloadPluginsRequest | Reloads plugins from disk and returns the refreshed session components.… |
| `rename_session` | `UK` | RenameSessionRequest | Sets the user-facing title for the current session.… |
| `request_user_dialog` | `IUK` | RequestUserDialogRequest | Dialog-specific data passed to the host renderer. Shape is defined per dialog_ki… |
| `rewind_files` | `XUK` | RewindFilesRequest | Rewinds file changes made since a specific user message.… |
| `seed_read_state` | `GUK` | SeedReadStateRequest | Seeds the readFileState cache with a path+mtime entry. Use when a prior Read was… |
| `session_state_changed` | `b15` | SessionStateChangedRequest | Mirrors notifySessionStateChanged. 'idle' fires after heldBackResult flushes and… |
| `set_color` | `YUK` | SetColorRequest |  |
| `set_max_thinking_tokens` | `zUK` | SetMaxThinkingTokensRequest | Sets the maximum number of thinking tokens for extended thinking.… |
| `set_model` | `AUK` | SetModelRequest | Sets the model to use for subsequent conversation turns.… |
| `set_permission_mode` | `TUK` | SetPermissionModeRequest | @internal CCR ultraplan session marker.… |
| `status` | `G15` | StatusRequest |  |
| `stop_task` | `vUK` | StopTaskRequest | Stops a running task.… |
| `submit_feedback` | `xUK` | SubmitFeedbackRequest | Where the feedback flow was initiated. Stamped into the POST body and tengu_bug_… |
| `success` | `D15` | SuccessRequest |  |
| `success` | `yc3` | SuccessRequest |  |
| `task_notification` | `S15` | TaskNotificationRequest |  |
| `task_progress` | `u15` | TaskProgressRequest |  |
| `task_started` | `C15` | TaskStartedRequest | meta.name from the workflow script (e.g. 'spec'). Only set when task_type is 'lo… |
| `task_summary` | `Ow8` | TaskSummaryRequest | @internal Mid-turn progress line from the debounced classifier. Mirrors external… |
| `task_updated` | `I15` | TaskUpdatedRequest | Wire-safe subset of TaskState fields that changed. Excludes abortController, mes… |

## Unions (with member ids resolved)

### `Aw8` (29 members)

| member id | discriminant | inferred name |
|---|---|---|
| `w15` | type:assistant | Assistant |
| `qw8` | — | (unresolved) |
| `f15` | — | Schema_f15 |
| `X15` | type:system | InitRequest |
| `P15` | type:stream_event | StreamEvent |
| `W15` | type:system | CompactBoundaryRequest |
| `G15` | type:system | StatusRequest |
| `R15` | type:system | ApiRetryRequest |
| `L15` | type:system | LocalCommandOutputRequest |
| `k15` | type:system | HookStartedRequest |
| `V15` | type:system | HookProgressRequest |
| `N15` | type:system | HookResponseRequest |
| `v15` | type:system | PluginInstallRequest |
| `y15` | type:tool_progress | ToolProgress |
| `h15` | type:auth_status | AuthStatus |
| `S15` | type:system | TaskNotificationRequest |
| `C15` | type:system | TaskStartedRequest |
| `I15` | type:system | TaskUpdatedRequest |
| `u15` | type:system | TaskProgressRequest |
| `b15` | type:system | SessionStateChangedRequest |
| `x15` | type:system | NotificationRequest |
| `E15` | type:system | FilesPersistedRequest |
| `m15` | type:tool_use_summary | ToolUseSummary |
| `p15` | type:system | MemoryRecallRequest |
| `J15` | type:rate_limit_event | RateLimitEvent |
| `B15` | type:system | ElicitationCompleteRequest |
| `U15` | type:system | PermissionDeniedRequest |
| `F15` | type:prompt_suggestion | PromptSuggestion |
| `Z15` | type:system | MirrorErrorRequest |

### `CVO` (2 members)

| member id | discriminant | inferred name |
|---|---|---|
| `u8_` | — | SchemaVersion |
| `m8_` | — | SchemaVersion |

### `D$q` (5 members)
> Path to the plugin root, relative to the marketplace root (the directory containing .claude-plugin/, not .claude-plugin/ itself)

| member id | discriminant | inferred name |
|---|---|---|
| `Zd` | — | Schema_Zd |
| `j$q` | — | Schema_j$q |
| `gb6` | — | Schema_gb6 |
| `gb6` | — | Schema_gb6 |
| `gb6` | — | Schema_gb6 |

### `D67` (28 members)

| member id | discriminant | inferred name |
|---|---|---|
| `q45` | — | (unresolved) |
| `O45` | — | (unresolved) |
| `T45` | — | (unresolved) |
| `z45` | — | (unresolved) |
| `Y45` | — | (unresolved) |
| `w45` | — | (unresolved) |
| `J45` | — | (unresolved) |
| `j45` | — | (unresolved) |
| `m45` | — | (unresolved) |
| `M45` | — | (unresolved) |
| `f45` | — | (unresolved) |
| `X45` | — | (unresolved) |
| `P45` | — | (unresolved) |
| `W45` | — | (unresolved) |
| `G45` | — | (unresolved) |
| `K45` | — | (unresolved) |
| `D45` | — | (unresolved) |
| `Z45` | — | (unresolved) |
| `R45` | — | (unresolved) |
| `L45` | — | (unresolved) |
| `k45` | — | (unresolved) |
| `V45` | — | (unresolved) |
| `v45` | — | (unresolved) |
| `E45` | — | (unresolved) |
| `S45` | — | (unresolved) |
| `C45` | — | (unresolved) |
| `I45` | — | (unresolved) |
| `b45` | — | (unresolved) |

### `D7J` (6 members)
> Control requests the agent loop originates and needs a reply to u2014 the loopu2192client RPC slice of SDKControlRequestInner. The remaining members are clientu2192loop commands (set/get/mcp/auth/etc).

| member id | discriminant | inferred name |
|---|---|---|
| `OUK` | subtype:can_use_tool | CanUseToolRequest |
| `ZUK` | subtype:hook_callback | HookCallbackRequest |
| `RUK` | subtype:mcp_message | McpMessageRequest |
| `uUK` | subtype:oauth_token_refresh | OauthTokenRefreshRequest |
| `SUK` | subtype:elicitation | ElicitationRequest |
| `IUK` | subtype:request_user_dialog | RequestUserDialogRequest |

### `FUK` (8 members)

| member id | discriminant | inferred name |
|---|---|---|
| `Aw8` | — | Schema_Aw8 |
| `Kw8` | type:system | PostTurnSummaryRequest |
| `Ow8` | type:system | TaskSummaryRequest |
| `Tw8` | type:transcript_mirror | TranscriptMirror |
| `BUK` | type:control_response | ControlResponse |
| `Oc8` | type:control_request | ControlRequest |
| `Ec3` | type:control_cancel_request | ControlCancelRequest |
| `UUK` | type:keep_alive | KeepAlive |

### `K15` (1 members)

| member id | discriminant | inferred name |
|---|---|---|
| `_66` | — | Schema__66 |

### `L63` (0 members)
> MCP tool execution result

| member id | discriminant | inferred name |
|---|---|---|

### `M7J` (27 members)
> Control requests a client sends to drive the loop u2014 the clientu2192loop command slice of SDKControlRequestInner. The remaining members are loopu2192client RPCs that block on a reply (see AgentOriginatedControlRequest).

| member id | discriminant | inferred name |
|---|---|---|
| `KUK` | subtype:interrupt | InterruptRequest |
| `qUK` | subtype:initialize | InitializeRequest |
| `TUK` | subtype:set_permission_mode | SetPermissionModeRequest |
| `AUK` | subtype:set_model | SetModelRequest |
| `zUK` | subtype:set_max_thinking_tokens | SetMaxThinkingTokensRequest |
| `UK` | subtype:rename_session | RenameSessionRequest |
| `YUK` | subtype:set_color | SetColorRequest |
| `wUK` | subtype:mcp_status | McpStatusRequest |
| `jUK` | subtype:get_context_usage | GetContextUsageRequest |
| `DUK` | subtype:get_session_cost | GetSessionCostRequest |
| `MUK` | subtype:get_binary_version | GetBinaryVersionRequest |
| `fUK` | subtype:mcp_call | McpCallRequest |
| `JUK` | subtype:file_suggestions | FileSuggestionsRequest |
| `XUK` | subtype:rewind_files | RewindFilesRequest |
| `PUK` | subtype:cancel_async_message | CancelAsyncMessageRequest |
| `WUK` | subtype:read_file | ReadFileRequest |
| `GUK` | subtype:seed_read_state | SeedReadStateRequest |
| `LUK` | subtype:mcp_set_servers | McpSetServersRequest |
| `kUK` | subtype:reload_plugins | ReloadPluginsRequest |
| `VUK` | subtype:mcp_reconnect | McpReconnectRequest |
| `NUK` | subtype:mcp_toggle | McpToggleRequest |
| `pUK` | subtype:message_rated | MessageRatedRequest |
| `vUK` | subtype:stop_task | StopTaskRequest |
| `yUK` | subtype:background_tasks | BackgroundTasksRequest |
| `hUK` | subtype:apply_flag_settings | ApplyFlagSettingsRequest |
| `EUK` | subtype:get_settings | GetSettingsRequest |
| `xUK` | subtype:submit_feedback | SubmitFeedbackRequest |

### `T$q` (1 members)
> Path to MCPB file relative to plugin root

| member id | discriminant | inferred name |
|---|---|---|
| `Zd` | — | Schema_Zd |

### `TlA` (3 members)
> Controls Claude's thinking/reasoning behavior. When set, takes precedence over the deprecated maxThinkingTokens.

| member id | discriminant | inferred name |
|---|---|---|
| `lK5` | type:adaptive | Adaptive |
| `nK5` | type:enabled | Enabled |
| `iK5` | type:disabled | Disabled |

### `We9` (1 members)

| member id | discriminant | inferred name |
|---|---|---|
| `gr` | — | Schema_gr |

### `X7J` (6 members)

| member id | discriminant | inferred name |
|---|---|---|
| `qw8` | — | (unresolved) |
| `G67` | type:bash_command | BashCommand |
| `Oc8` | type:control_request | ControlRequest |
| `BUK` | type:control_response | ControlResponse |
| `UUK` | type:keep_alive | KeepAlive |
| `Sc3` | type:update_environment_variables | UpdateEnvironmentVariables |

### `_66` (4 members)

| member id | discriminant | inferred name |
|---|---|---|
| `rK5` | type:stdio | Stdio |
| `oK5` | type:sse | Sse |
| `aK5` | type:http | Http |
| `sK5` | type:sdk | Sdk |

### `dG_` (2 members)

| member id | discriminant | inferred name |
|---|---|---|
| `bc3` | — | Schema_bc3 |
| `xc3` | — | Schema_xc3 |

### `db6` (2 members)

| member id | discriminant | inferred name |
|---|---|---|
| `Qb6` | — | (unresolved) |
| `Zd` | — | Schema_Zd |

### `eK5` (2 members)

| member id | discriminant | inferred name |
|---|---|---|
| `_66` | — | Schema__66 |
| `tK5` | type:claudeai-proxy | Claudeai-proxy |

### `f15` (2 members)

| member id | discriminant | inferred name |
|---|---|---|
| `D15` | type:result | SuccessRequest |
| `M15` | type:result | Result |

### `f7J` (4 members)
> Observational messages the agent loop emits u2014 fire-and-forget, no reply expected. The remaining StdoutMessage members are control-protocol traffic (requests the loop originates and needs a reply to, responses to client-originated requests, keep-alives). This sub-union is the target for QueryEvent convergence so a Transport-shaped REPL can consume events without filtering control noise.

| member id | discriminant | inferred name |
|---|---|---|
| `Aw8` | — | Schema_Aw8 |
| `Kw8` | type:system | PostTurnSummaryRequest |
| `Ow8` | type:system | TaskSummaryRequest |
| `Tw8` | type:transcript_mirror | TranscriptMirror |

### `gr` (8 members)

| member id | discriminant | inferred name |
|---|---|---|
| `Ub6` | type:stdio | Stdio |
| `iL4` | type:sse | Sse |
| `rL4` | type:sse-ide | Sse-ide |
| `oL4` | type:ws-ide | Ws-ide |
| `aL4` | — | Schema_aL4 |
| `sL4` | type:ws | Ws |
| `tL4` | type:sdk | Sdk |
| `eL4` | type:claudeai-proxy | Claudeai-proxy |

### `lA` (2 members)

| member id | discriminant | inferred name |
|---|---|---|
| `p45` | — | Schema_p45 |
| `t45` | — | Schema_t45 |

### `vc3` (33 members)

| member id | discriminant | inferred name |
|---|---|---|
| `KUK` | subtype:interrupt | InterruptRequest |
| `OUK` | subtype:can_use_tool | CanUseToolRequest |
| `qUK` | subtype:initialize | InitializeRequest |
| `TUK` | subtype:set_permission_mode | SetPermissionModeRequest |
| `AUK` | subtype:set_model | SetModelRequest |
| `zUK` | subtype:set_max_thinking_tokens | SetMaxThinkingTokensRequest |
| `UK` | subtype:rename_session | RenameSessionRequest |
| `YUK` | subtype:set_color | SetColorRequest |
| `wUK` | subtype:mcp_status | McpStatusRequest |
| `jUK` | subtype:get_context_usage | GetContextUsageRequest |
| `DUK` | subtype:get_session_cost | GetSessionCostRequest |
| `MUK` | subtype:get_binary_version | GetBinaryVersionRequest |
| `fUK` | subtype:mcp_call | McpCallRequest |
| `JUK` | subtype:file_suggestions | FileSuggestionsRequest |
| `ZUK` | subtype:hook_callback | HookCallbackRequest |
| `RUK` | subtype:mcp_message | McpMessageRequest |
| `XUK` | subtype:rewind_files | RewindFilesRequest |
| `PUK` | subtype:cancel_async_message | CancelAsyncMessageRequest |
| `WUK` | subtype:read_file | ReadFileRequest |
| `GUK` | subtype:seed_read_state | SeedReadStateRequest |
| `LUK` | subtype:mcp_set_servers | McpSetServersRequest |
| `kUK` | subtype:reload_plugins | ReloadPluginsRequest |
| `VUK` | subtype:mcp_reconnect | McpReconnectRequest |
| `NUK` | subtype:mcp_toggle | McpToggleRequest |
| `pUK` | subtype:message_rated | MessageRatedRequest |
| `uUK` | subtype:oauth_token_refresh | OauthTokenRefreshRequest |
| `vUK` | subtype:stop_task | StopTaskRequest |
| `yUK` | subtype:background_tasks | BackgroundTasksRequest |
| `hUK` | subtype:apply_flag_settings | ApplyFlagSettingsRequest |
| `EUK` | subtype:get_settings | GetSettingsRequest |
| `SUK` | subtype:elicitation | ElicitationRequest |
| `IUK` | subtype:request_user_dialog | RequestUserDialogRequest |
| `xUK` | subtype:submit_feedback | SubmitFeedbackRequest |

### `vk4` (1 members)

| member id | discriminant | inferred name |
|---|---|---|
| `loose` | — | (unresolved) |

### `z15` (0 members)

| member id | discriminant | inferred name |
|---|---|---|

### `zlA` (3 members)

| member id | discriminant | inferred name |
|---|---|---|
| `G$_` | type:addRules | AddRules |
| `Y67` | — | ClassificationOfThisPermissionDecisionFor |
| `Y67` | — | ClassificationOfThisPermissionDecisionFor |

## Counts by zod kind

- `array`: 6
- `boolean`: 1
- `discriminatedUnion`: 5
- `enum`: 25
- `literal`: 2
- `looseObject`: 1
- `object`: 327
- `partialRecord`: 1
- `preprocess`: 1
- `record`: 4
- `strictObject`: 39
- `string`: 11
- `union`: 25
- `unknown`: 5