// @generated from canonical.json sha256:57ef27ccf4e4ae27b32c1399ecac1d891c2272e71d441092714b8586016c86fa — do not edit by hand.
// Source: codegen/snapshots/2.1.139/canonical.json
// Regenerate with: bun codegen/generate.ts
//
// The active Claude Code binary version is 2.1.139. The Phase 3
// engine (ClaudeProcess) consumes this file's exports via the dispatch map.

import { type } from "arktype";

/* @__PURE__ */ export const AdaptiveMessage = type({
  'type': '\'adaptive\'',
  'display?': '\'summarized\' | \'omitted\'',
});
/* @__PURE__ */ export const AnonE6078ccda89f99b9 = type("'userSettings' | 'projectSettings' | 'localSettings' | 'session' | 'cliArg'");
/* @__PURE__ */ export const AddDirectoriesMessage = type({
  'type': '\'addDirectories\'',
  'directories': 'string[]',
  'destination': AnonE6078ccda89f99b9,
});
/* @__PURE__ */ export const AnonE6078ccda89f99b92 = type("'userSettings' | 'projectSettings' | 'localSettings' | 'session' | 'cliArg'");
/* @__PURE__ */ export const AddDirectoriesMessage2 = type({
  'type': '\'addDirectories\'',
  'directories': 'string[]',
  'destination': AnonE6078ccda89f99b92,
});
/* @__PURE__ */ export const AddRulesMessage = type("unknown");
/* @__PURE__ */ export const Anon4ee62dc4a79353e4 = type("'allow' | 'deny' | 'ask'");
/* @__PURE__ */ export const AnonE5fc16036a421b22 = type({
  'toolName': 'string',
  'ruleContent?': 'string',
});
/* @__PURE__ */ export const AddRulesMessage2 = type({
  'type': '\'addRules\'',
  'rules': AnonE5fc16036a421b22.array(),
  'behavior': Anon4ee62dc4a79353e4,
  'destination': AnonE6078ccda89f99b9,
});
/* @__PURE__ */ export const AddRulesMessage3 = type("unknown");
/* @__PURE__ */ export const Anon4ee62dc4a79353e42 = type("'allow' | 'deny' | 'ask'");
/* @__PURE__ */ export const AnonE5fc16036a421b222 = type({
  'toolName': 'string',
  'ruleContent?': 'string',
});
/* @__PURE__ */ export const AddRulesMessage4 = type({
  'type': '\'addRules\'',
  'rules': AnonE5fc16036a421b222.array(),
  'behavior': Anon4ee62dc4a79353e42,
  'destination': AnonE6078ccda89f99b92,
});
/* @__PURE__ */ export const HttpMessage = type({
  'type': '\'http\'',
  'url': 'string',
  'if?': "unknown",
  'timeout?': 'number',
  'headers?': 'Record<string, string>',
  'allowedEnvVars?': 'string[]',
  'statusMessage?': 'string',
  'once?': 'boolean',
});
/* @__PURE__ */ export const SdkMessage = type({
  'type': '\'sdk\'',
  'name': 'string',
  'alwaysLoad?': 'boolean',
});
/* @__PURE__ */ export const AnonB946fa776c1903c4 = type({
  'clientId?': 'string',
  'callbackPort?': "unknown",
  'authServerMetadataUrl?': "unknown",
  'scopes?': 'string',
  'xaa?': "unknown",
});
/* @__PURE__ */ export const SseMessage = type({
  'type': '\'sse\'',
  'url': 'string',
  'headers?': 'Record<string, string>',
  'headersHelper?': 'string',
  'oauth?': AnonB946fa776c1903c4,
  'alwaysLoad?': 'boolean',
});
/* @__PURE__ */ export const StdioMessage = type({
  'type?': '\'stdio\'',
  'command': 'string',
  'args': 'string[]',
  'env?': 'Record<string, string>',
  'alwaysLoad?': 'boolean',
});
/* @__PURE__ */ export const Anon8702a4e99b43389f = HttpMessage.or(SdkMessage).or(SseMessage).or(StdioMessage);
/* @__PURE__ */ export const AnonA07fa418900ae98f2 = Anon8702a4e99b43389f;
/* @__PURE__ */ export const PermissionMode = type("'default' | 'acceptEdits' | 'bypassPermissions' | 'plan' | 'dontAsk' | 'auto'");
/* @__PURE__ */ export const AgentDefinition = type({
  'description': 'string',
  'tools?': 'string[]',
  'disallowedTools?': 'string[]',
  'prompt': 'string',
  'model?': 'string',
  'mcpServers?': AnonA07fa418900ae98f2.array(),
  'criticalSystemReminder_EXPERIMENTAL?': 'string',
  'skills?': 'string[]',
  'initialPrompt?': 'string',
  'maxTurns?': "unknown",
  'background?': 'boolean',
  'memory?': '\'user\' | \'project\' | \'local\'',
  'effort?': "unknown",
  'permissionMode?': PermissionMode,
});
/* @__PURE__ */ export const AgentMessage = type({
  'type': '\'agent\'',
  'prompt': 'string',
  'if?': "unknown",
  'timeout?': 'number',
  'model?': 'string',
  'statusMessage?': 'string',
  'once?': 'boolean',
});
/* @__PURE__ */ export const Anon002a0ba1e21e1289 = type("'started' | 'installed' | 'failed' | 'completed'");
/* @__PURE__ */ export const Anon002b374e918b5649 = type("unknown");
/* @__PURE__ */ export const Anon00be60ae36a954e4 = type("unknown");
/* @__PURE__ */ export const Anon01073d8d7e5103f7 = type({
  'error?': { "type?": "string", "message?": "string", "details?": { "error_code?": "string" } },
});
/* @__PURE__ */ export const Anon0138240ae992a4c8 = type("unknown");
/* @__PURE__ */ export const Anon014680089a6c3b1c = type({
  'async': 'true',
  'asyncTimeout?': 'number',
});
/* @__PURE__ */ export const Anon0192649e27e2a811 = type({
  'task_id?': 'string',
  'shell_id?': 'string',
});
/* @__PURE__ */ export const Anon019738bc89509793 = type({
  'filePath': 'string',
  'content': 'string',
  'numLines': 'number',
  'startLine': 'number',
  'totalLines': 'number',
});
/* @__PURE__ */ export const Anon01c58946e424ec3e = type({
  'operation': '\'outgoingCalls\'',
  'filePath': 'string',
  'line?': "unknown",
  'character?': "unknown",
});
/* @__PURE__ */ export const Anon01d73e84e616b1f7 = type({
  'access_token': 'string',
  'token_type': 'string',
  'expires_in?': "unknown",
  'scope?': 'string',
  'refresh_token?': 'string',
});
/* @__PURE__ */ export const Anon02b1c43b07d4787e = type("'stdio' | 'socket'");
/* @__PURE__ */ export const Anon02ef0ffa4f99338d = type({
  'matches': 'string[]',
  'query': 'string',
  'total_deferred_tools': 'number',
  'pending_mcp_servers?': 'string[]',
});
/* @__PURE__ */ export const Anon032f966d148510b1 = type("'content' | 'files_with_matches' | 'count'");
/* @__PURE__ */ export const Anon034887aa0cef8c5e = type({
  'defaultEnvironmentId?': 'string',
});
/* @__PURE__ */ export const Anon03b4d5528600a018 = type({
  'originalWidth?': 'number',
  'originalHeight?': 'number',
  'displayWidth?': 'number',
  'displayHeight?': 'number',
});
/* @__PURE__ */ export const Anon040d788b3c8c031d = type("unknown");
/* @__PURE__ */ export const Anon04189851323dc843 = type({
  'base64': 'string',
  'mediaType': 'string',
});
/* @__PURE__ */ export const Anon041aa2c18c4e33ed = type("'allowed' | 'allowed_warning' | 'rejected'");
/* @__PURE__ */ export const Anon062297084cfd4b8e = type("'active' | 'idle' | 'blocked'");
/* @__PURE__ */ export const Anon063c7d829ab3ac04 = type("unknown");
/* @__PURE__ */ export const Anon063c7d829ab3ac0410 = type("unknown");
/* @__PURE__ */ export const Anon063c7d829ab3ac0411 = type("unknown");
/* @__PURE__ */ export const Anon063c7d829ab3ac0412 = type("unknown");
/* @__PURE__ */ export const Anon063c7d829ab3ac0413 = type("unknown");
/* @__PURE__ */ export const Anon063c7d829ab3ac0414 = type("unknown");
/* @__PURE__ */ export const Anon063c7d829ab3ac0415 = type("unknown");
/* @__PURE__ */ export const Anon063c7d829ab3ac0416 = type("unknown");
/* @__PURE__ */ export const Anon063c7d829ab3ac0417 = type("unknown");
/* @__PURE__ */ export const Anon063c7d829ab3ac0418 = type("unknown");
/* @__PURE__ */ export const Anon063c7d829ab3ac0419 = type("unknown");
/* @__PURE__ */ export const Anon063c7d829ab3ac042 = type("unknown");
/* @__PURE__ */ export const Anon063c7d829ab3ac0420 = type("unknown");
/* @__PURE__ */ export const Anon063c7d829ab3ac0421 = type("unknown");
/* @__PURE__ */ export const Anon063c7d829ab3ac043 = type("unknown");
/* @__PURE__ */ export const Anon063c7d829ab3ac044 = type("unknown");
/* @__PURE__ */ export const Anon063c7d829ab3ac045 = type("unknown");
/* @__PURE__ */ export const Anon063c7d829ab3ac046 = type("unknown");
/* @__PURE__ */ export const Anon063c7d829ab3ac047 = type("unknown");
/* @__PURE__ */ export const Anon063c7d829ab3ac048 = type("unknown");
/* @__PURE__ */ export const Anon063c7d829ab3ac049 = type("unknown");
/* @__PURE__ */ export const Anon06d8b24674847960 = type("'chat' | 'transcript'");
/* @__PURE__ */ export const Anon070fb729b331287e = type({
  'id': 'string',
  'cron': 'string',
  'humanSchedule': 'string',
  'prompt': 'string',
  'recurring?': 'boolean',
  'durable?': 'boolean',
});
/* @__PURE__ */ export const Anon53a40f0a5a146c2f = type("unknown");
/* @__PURE__ */ export const Anon17a7e6c7301ae98c = type("'authentication_failed' | 'oauth_org_not_allowed' | 'billing_error' | 'rate_limit' | 'invalid_request' | 'server_error' | 'unknown' | 'max_output_tokens'");
/* @__PURE__ */ export const AssistantMessage = type({
  'type': '\'assistant\'',
  'message': 'Record<string, unknown>',
  'parent_tool_use_id': 'string | null',
  'error?': Anon17a7e6c7301ae98c,
  'uuid': 'string',
  'session_id': 'string',
});
/* @__PURE__ */ export const AuthStatusMessage = type({
  'type': '\'auth_status\'',
  'isAuthenticating': 'boolean',
  'output': 'string[]',
  'error?': 'string',
  'uuid': 'string',
  'session_id': 'string',
});
/* @__PURE__ */ export const PromptSuggestionMessage = type({
  'type': '\'prompt_suggestion\'',
  'suggestion': 'string',
  'uuid': 'string',
  'session_id': 'string',
});
/* @__PURE__ */ export const Anon9e39883363f40975 = type({
  'status': '\'allowed\' | \'allowed_warning\' | \'rejected\'',
  'resetsAt?': 'number',
  'rateLimitType?': '\'five_hour\' | \'seven_day\' | \'seven_day_opus\' | \'seven_day_sonnet\' | \'overage\'',
  'utilization?': 'number',
  'overageStatus?': '\'allowed\' | \'allowed_warning\' | \'rejected\'',
  'overageResetsAt?': 'number',
  'overageDisabledReason?': '\'overage_not_provisioned\' | \'org_level_disabled\' | \'org_level_disabled_until\' | \'out_of_credits\' | \'seat_tier_level_disabled\' | \'member_level_disabled\' | \'seat_tier_zero_credit_limit\' | \'group_zero_credit_limit\' | \'member_zero_credit_limit\' | \'org_service_level_disabled\' | \'no_limits_configured\' | \'fetch_error\' | \'unknown\'',
  'isUsingOverage?': 'boolean',
  'surpassedThreshold?': 'number',
});
/* @__PURE__ */ export const RateLimitEventMessage = type({
  'type': '\'rate_limit_event\'',
  'rate_limit_info': Anon9e39883363f40975,
  'uuid': 'string',
  'session_id': 'string',
});
/* @__PURE__ */ export const StreamEventMessage = type({
  'type': '\'stream_event\'',
  'event': 'Record<string, unknown>',
  'parent_tool_use_id': 'string | null',
  'uuid': 'string',
  'session_id': 'string',
  'ttft_ms?': 'number',
});
/* @__PURE__ */ export const SystemApiRetry = type({
  'type': '\'system\'',
  'subtype': '\'api_retry\'',
  'attempt': 'number',
  'max_retries': 'number',
  'retry_delay_ms': 'number',
  'error_status': 'number | null',
  'error': Anon17a7e6c7301ae98c,
  'uuid': 'string',
  'session_id': 'string',
});
/* @__PURE__ */ export const SystemCompactBoundary = type({
  'type': '\'system\'',
  'subtype': '\'compact_boundary\'',
  'compact_metadata?': 'Record<string, unknown>',
  'uuid': 'string',
  'session_id': 'string',
});
/* @__PURE__ */ export const SystemElicitationComplete = type({
  'type': '\'system\'',
  'subtype': '\'elicitation_complete\'',
  'mcp_server_name': 'string',
  'elicitation_id': 'string',
  'uuid': 'string',
  'session_id': 'string',
});
/* @__PURE__ */ export const SystemFilesPersisted = type({
  'type': '\'system\'',
  'subtype': '\'files_persisted\'',
  'files': type({ "filename": "string", "file_id": "string" }).array(),
  'failed': type({ "filename": "string", "error": "string" }).array(),
  'processed_at': 'string',
  'uuid': 'string',
  'session_id': 'string',
});
/* @__PURE__ */ export const SystemHookProgress = type({
  'type': '\'system\'',
  'subtype': '\'hook_progress\'',
  'hook_id': 'string',
  'hook_name': 'string',
  'hook_event': 'string',
  'stdout': 'string',
  'stderr': 'string',
  'output': 'string',
  'uuid': 'string',
  'session_id': 'string',
});
/* @__PURE__ */ export const SystemHookResponse = type({
  'type': '\'system\'',
  'subtype': '\'hook_response\'',
  'hook_id': 'string',
  'hook_name': 'string',
  'hook_event': 'string',
  'output': 'string',
  'stdout': 'string',
  'stderr': 'string',
  'exit_code?': 'number',
  'outcome': '\'success\' | \'error\' | \'cancelled\'',
  'uuid': 'string',
  'session_id': 'string',
});
/* @__PURE__ */ export const SystemHookStarted = type({
  'type': '\'system\'',
  'subtype': '\'hook_started\'',
  'hook_id': 'string',
  'hook_name': 'string',
  'hook_event': 'string',
  'uuid': 'string',
  'session_id': 'string',
});
/* @__PURE__ */ export const Anon687df4bcd3dc44ff = type("'off' | 'cooldown' | 'on'");
/* @__PURE__ */ export const AnonAfa84af4bd34512f = type("'user' | 'project' | 'org' | 'temporary' | 'oauth'");
/* @__PURE__ */ export const SystemInit = type({
  'type': '\'system\'',
  'subtype': '\'init\'',
  'agents?': 'string[]',
  'apiKeySource': AnonAfa84af4bd34512f,
  'betas?': 'string[]',
  'claude_code_version': 'string',
  'cwd': 'string',
  'tools': 'string[]',
  'mcp_servers': type({ "name": "string", "status": "string" }).array(),
  'model': 'string',
  'permissionMode': PermissionMode,
  'slash_commands': 'string[]',
  'output_style': 'string',
  'skills': 'string[]',
  'plugins': type({ "name": "string", "path": "string", "source?": "string" }).array(),
  'plugin_errors?': type({ "plugin": "string", "type": "string", "message": "string" }).array(),
  'fast_mode_state?': Anon687df4bcd3dc44ff,
  'analytics_disabled?': 'boolean',
  'memory_paths?': { "auto?": "string", "team?": "string" },
  'uuid': 'string',
  'session_id': 'string',
});
/* @__PURE__ */ export const SystemLocalCommandOutput = type({
  'type': '\'system\'',
  'subtype': '\'local_command_output\'',
  'content': 'string',
  'uuid': 'string',
  'session_id': 'string',
});
/* @__PURE__ */ export const SystemMemoryRecall = type({
  'type': '\'system\'',
  'subtype': '\'memory_recall\'',
  'mode': '\'select\' | \'synthesize\'',
  'memories': type({ "path": "string", "scope": "'personal' | 'team'", "content?": "string" }).array(),
  'uuid': 'string',
  'session_id': 'string',
});
/* @__PURE__ */ export const SystemMirrorError = type({
  'type': '\'system\'',
  'subtype': '\'mirror_error\'',
  'error': 'string',
  'key': { "projectKey": "string", "sessionId": "string", "subpath?": "string" },
  'uuid': 'string',
  'session_id': 'string',
});
/* @__PURE__ */ export const SystemNotification = type({
  'type': '\'system\'',
  'subtype': '\'notification\'',
  'key': 'string',
  'text': 'string',
  'priority': '\'low\' | \'medium\' | \'high\' | \'immediate\'',
  'color?': 'string',
  'timeout_ms?': 'number',
  'uuid': 'string',
  'session_id': 'string',
});
/* @__PURE__ */ export const SystemPermissionDenied = type({
  'type': '\'system\'',
  'subtype': '\'permission_denied\'',
  'tool_name': 'string',
  'tool_use_id': 'string',
  'agent_id?': 'string',
  'decision_reason_type?': 'string',
  'decision_reason?': 'string',
  'message': 'string',
  'uuid': 'string',
  'session_id': 'string',
});
/* @__PURE__ */ export const SystemPluginInstall = type({
  'type': '\'system\'',
  'subtype': '\'plugin_install\'',
  'status': '\'started\' | \'installed\' | \'failed\' | \'completed\'',
  'name?': 'string',
  'error?': 'string',
  'uuid': 'string',
  'session_id': 'string',
});
/* @__PURE__ */ export const SystemSessionStateChanged = type({
  'type': '\'system\'',
  'subtype': '\'session_state_changed\'',
  'state': '\'idle\' | \'running\' | \'requires_action\'',
  'uuid': 'string',
  'session_id': 'string',
});
/* @__PURE__ */ export const AnonEab522eb3849891d = type("unknown");
/* @__PURE__ */ export const SystemStatus = type({
  'type': '\'system\'',
  'subtype': '\'status\'',
  'status': AnonEab522eb3849891d,
  'permissionMode?': PermissionMode,
  'compact_result?': '\'success\' | \'failed\'',
  'compact_error?': 'string',
  'uuid': 'string',
  'session_id': 'string',
});
/* @__PURE__ */ export const SystemTaskNotification = type({
  'type': '\'system\'',
  'subtype': '\'task_notification\'',
  'task_id': 'string',
  'tool_use_id?': 'string',
  'status': '\'completed\' | \'failed\' | \'stopped\'',
  'output_file': 'string',
  'summary': 'string',
  'usage?': { "total_tokens": "number", "tool_uses": "number", "duration_ms": "number" },
  'skip_transcript?': 'boolean',
  'uuid': 'string',
  'session_id': 'string',
});
/* @__PURE__ */ export const SystemTaskProgress = type({
  'type': '\'system\'',
  'subtype': '\'task_progress\'',
  'task_id': 'string',
  'tool_use_id?': 'string',
  'description': 'string',
  'usage': { "total_tokens": "number", "tool_uses": "number", "duration_ms": "number" },
  'last_tool_name?': 'string',
  'summary?': 'string',
  'uuid': 'string',
  'session_id': 'string',
});
/* @__PURE__ */ export const SystemTaskStarted = type({
  'type': '\'system\'',
  'subtype': '\'task_started\'',
  'task_id': 'string',
  'tool_use_id?': 'string',
  'description': 'string',
  'task_type?': 'string',
  'workflow_name?': 'string',
  'prompt?': 'string',
  'skip_transcript?': 'boolean',
  'uuid': 'string',
  'session_id': 'string',
});
/* @__PURE__ */ export const SystemTaskUpdated = type({
  'type': '\'system\'',
  'subtype': '\'task_updated\'',
  'task_id': 'string',
  'patch': { "status?": "'pending' | 'running' | 'completed' | 'failed' | 'killed'", "description?": "string", "end_time?": "number", "total_paused_ms?": "number", "error?": "string", "is_backgrounded?": "boolean" },
  'uuid': 'string',
  'session_id': 'string',
});
/* @__PURE__ */ export const ToolProgressMessage = type({
  'type': '\'tool_progress\'',
  'tool_use_id': 'string',
  'tool_name': 'string',
  'parent_tool_use_id': 'string | null',
  'elapsed_time_seconds': 'number',
  'task_id?': 'string',
  'uuid': 'string',
  'session_id': 'string',
});
/* @__PURE__ */ export const ToolUseSummaryMessage = type({
  'type': '\'tool_use_summary\'',
  'summary': 'string',
  'preceding_tool_use_ids': 'string[]',
  'uuid': 'string',
  'session_id': 'string',
});
/* @__PURE__ */ export const Anon07ca1350d0879686 = Anon53a40f0a5a146c2f.or(AssistantMessage).or(AuthStatusMessage).or(PromptSuggestionMessage).or(RateLimitEventMessage).or(StreamEventMessage).or(SystemApiRetry).or(SystemCompactBoundary).or(SystemElicitationComplete).or(SystemFilesPersisted).or(SystemHookProgress).or(SystemHookResponse).or(SystemHookStarted).or(SystemInit).or(SystemLocalCommandOutput).or(SystemMemoryRecall).or(SystemMirrorError).or(SystemNotification).or(SystemPermissionDenied).or(SystemPluginInstall).or(SystemSessionStateChanged).or(SystemStatus).or(SystemTaskNotification).or(SystemTaskProgress).or(SystemTaskStarted).or(SystemTaskUpdated).or(ToolProgressMessage).or(ToolUseSummaryMessage);
/* @__PURE__ */ export const Anon081af0b47500ad4d = type("'same-dir' | 'worktree'");
/* @__PURE__ */ export const Anon08513a20cc3b35e8 = type({
  'login': 'string',
});
/* @__PURE__ */ export const Anon08513a20cc3b35e82 = type({
  'login': 'string',
});
/* @__PURE__ */ export const Anon085dc9d6e9f248cf = type({
  'tasks': 'number',
  'queued': 'number',
  'kinds': 'string[]',
});
/* @__PURE__ */ export const Anon08b4e8085ff79b43 = type({
  'version': '1',
  'plugins?': "unknown",
});
/* @__PURE__ */ export const Anon0907d075be36d518 = type({
  'command?': "unknown",
  'args?': "unknown",
  'extensionToLanguage?': "unknown",
  'transport': '\'stdio\' | \'socket\'',
  'env?': 'Record<string, string>',
  'initializationOptions?': 'unknown',
  'settings?': 'unknown',
  'workspaceFolder?': 'string',
  'startupTimeout?': "unknown",
  'shutdownTimeout?': "unknown",
  'restartOnCrash?': 'boolean',
  'maxRestarts?': "unknown",
});
/* @__PURE__ */ export const Anon095b97f07efe07b9 = type("'firstParty' | 'bedrock' | 'vertex' | 'foundry' | 'anthropicAws' | 'mantle' | 'gateway'");
/* @__PURE__ */ export const Anon098ef4b73054e5d8 = type({
  'action': '\'accept\' | \'decline\' | \'cancel\'',
  'content?': 'Record<string, unknown>',
});
/* @__PURE__ */ export const Anon09c845f36afa1008 = type({
  'kind': '\'peer\'',
  'from': 'string',
  'name?': 'string',
});
/* @__PURE__ */ export const Anon0a150b08265309d1 = type("unknown");
/* @__PURE__ */ export const Anon0ab629a817c5a48f = type({
  'label': 'string',
  'cwd': 'string',
  'pid': 'number',
});
/* @__PURE__ */ export const Anon0ae71a74c5d00e55 = type({
  'source': '\'hostPattern\'',
  'hostPattern': 'string',
});
/* @__PURE__ */ export const Anon0b097e5e1ee27493 = type("unknown");
/* @__PURE__ */ export const Anon0bd69b7da475f0d6 = type({
  'filename': 'string',
  'file_id': 'string',
});
/* @__PURE__ */ export const Anon0beb52c2780d0da9 = type({
  'file_path': 'string',
  'old_string': 'string',
  'new_string': 'string',
  'replace_all?': "unknown",
});
/* @__PURE__ */ export const Anon0c2650b8dd06b14d = type({
  'hook_event_name': '\'PreToolUse\'',
  'tool_name': 'string',
  'tool_input': 'unknown',
  'tool_use_id': 'string',
});
/* @__PURE__ */ export const Anon0c337f7a55d5b4e3 = type("'completed' | 'failed' | 'stopped'");
/* @__PURE__ */ export const Anon0c3463031d3ff7c1 = type("'disable'");
/* @__PURE__ */ export const Anon0c3463031d3ff7c12 = type("'disable'");
/* @__PURE__ */ export const Anon0c8654c98c02fa9f = type({
  'eventName': 'string',
  'eventData?': "unknown",
});
/* @__PURE__ */ export const Anon0c8654c98c02fa9f2 = type({
  'eventName': 'string',
  'eventData?': "unknown",
});
/* @__PURE__ */ export const Anon0cf51681c41d09b2 = type({
  'error_code?': 'string',
});
/* @__PURE__ */ export const Anon0d1c033fc2b7362e = type({
  'path': 'string',
  'scope': '\'personal\' | \'team\'',
  'content?': 'string',
});
/* @__PURE__ */ export const Anon0d4ae1e2557240dd = type("'http' | 'streamable-http'");
/* @__PURE__ */ export const Anon0d77962e80a27c02 = type("'interactive' | 'bg' | 'daemon' | 'daemon-worker'");
/* @__PURE__ */ export const Anon213b7f97920a9965 = type({
  'oldStart': 'number',
  'oldLines': 'number',
  'newStart': 'number',
  'newLines': 'number',
  'lines': 'string[]',
});
/* @__PURE__ */ export const Anon919fa7099f916637 = type({
  'filename': 'string',
  'status': '\'modified\' | \'added\'',
  'additions': 'number',
  'deletions': 'number',
  'changes': 'number',
  'patch': 'string',
  'repository?': 'string | null',
});
/* @__PURE__ */ export const Anon0de17b3445fddb73 = type({
  'type': '\'create\' | \'update\'',
  'filePath': 'string',
  'content': 'string',
  'structuredPatch': Anon213b7f97920a9965.array(),
  'originalFile': 'string | null',
  'gitDiff?': Anon919fa7099f916637,
  'userModified?': 'boolean',
});
/* @__PURE__ */ export const Anon0dfb04d0dd48f1bd = type({
  'terminal': 'string | null',
  'mux': '\'tmux\' | \'screen\' | \'zellij\' | null',
  'ssh': 'boolean',
  'wheelFlood?': 'boolean',
  'hyperlinks?': 'boolean',
  'progressReporting?': 'boolean',
  'wtSession?': 'boolean',
  'isVscodeTerm?': 'boolean',
});
/* @__PURE__ */ export const Anon0e2f2508a67c3f89 = type({
  'intent': 'string',
  'name?': 'string',
});
/* @__PURE__ */ export const Anon0f7bca0dd981fab1 = type("unknown");
/* @__PURE__ */ export const Anon104c7998c4aa5771 = type({});
/* @__PURE__ */ export const Anon1076740198fcfca9 = type({
  'question': 'string',
  'header': 'string',
  'options?': "unknown",
  'multiSelect': 'boolean',
});
/* @__PURE__ */ export const Anon7d8d6ab5419816412 = type("'pending' | 'in_progress' | 'completed'");
/* @__PURE__ */ export const Anon10bcec706ed7f5e4 = type({
  'content': 'string',
  'status': Anon7d8d6ab5419816412,
  'activeForm': 'string',
});
/* @__PURE__ */ export const Anon10d9d4216f23efa0 = type({
  'dir': 'string',
  'name?': 'string',
  'spawnMode': '\'same-dir\' | \'worktree\'',
  'capacity?': "unknown",
  'permissionMode?': "unknown",
  'sandbox': 'boolean',
  'sessionTimeoutSeconds?': "unknown",
  'createSessionOnStart': 'boolean',
});
/* @__PURE__ */ export const Anon1116ac1180612b81 = type({
  'id': 'string',
  'humanSchedule': 'string',
  'recurring': 'boolean',
  'durable?': 'boolean',
});
/* @__PURE__ */ export const Anon11548354fbc81525 = type({
  'proto?': "unknown",
  'op': '\'has\'',
  'short?': "unknown",
});
/* @__PURE__ */ export const Anon13c8729b6b01f422 = type({
  'path': 'string',
  'timeoutMs?': 'number',
  'refreshIntervalMs?': "unknown",
});
/* @__PURE__ */ export const Anon13f8a4cb5ebc4865 = type({
  'base64': 'string',
});
/* @__PURE__ */ export const Anon1451ffa3d3ec3e15 = type({
  'id': 'string',
});
/* @__PURE__ */ export const Anon15588d2e10428e81 = type({
  'id': 'string',
  'subject': 'string',
  'description': 'string',
  'status?': "unknown",
  'blocks': 'string[]',
  'blockedBy': 'string[]',
});
/* @__PURE__ */ export const Anon15d094f44f598fe5 = type({
  'hook_event_name': '\'Stop\'',
  'stop_hook_active': 'boolean',
  'last_assistant_message?': 'string',
});
/* @__PURE__ */ export const Anon1626a6590402bc78 = type({
  'task_id': 'string',
  'block?': "unknown",
  'timeout?': "unknown",
});
/* @__PURE__ */ export const Anon165e4c275ccf2503 = type({
  'source': '\'npm\'',
  'package?': "unknown",
});
/* @__PURE__ */ export const Anon166ac11be591a8b6 = type("unknown");
/* @__PURE__ */ export const Anon166ac11be591a8b62 = type("unknown");
/* @__PURE__ */ export const Anon1695dea4ffbf9254 = type({
  'hook_event_name': '\'PermissionRequest\'',
  'tool_name': 'string',
  'tool_input': 'unknown',
  'permission_suggestions?': AddRulesMessage.array(),
});
/* @__PURE__ */ export const Anon16bf6e5e8f5a3779 = type({
  'source': '\'github\'',
  'repo': 'string',
  'ref?': 'string',
  'sha?': "unknown",
});
/* @__PURE__ */ export const Anon16e7092546f3dfc5 = type({
  'parent?': type({ "name": "string", "owner": { "login": "string" } }).or("null"),
});
/* @__PURE__ */ export const Anon16fd6f4ee6d5cda8 = type({
  'totalCommands': 'number',
  'includedCommands': 'number',
  'tokens': 'number',
});
/* @__PURE__ */ export const Anon171ac13fd93cecd5 = type({
  'kind': '\'channel\'',
  'server': 'string',
});
/* @__PURE__ */ export const Anon171d9077db912522 = type("'none' | 'worktree'");
/* @__PURE__ */ export const Anon176d6475f62496d5 = type({
  'account_uuid?': 'string | null',
  'account_email?': 'string | null',
  'organization_uuid?': 'string | null',
  'organization_name?': 'string | null',
  'organization_type?': 'string | null',
  'organization_rate_limit_tier?': 'string | null',
  'user_rate_limit_tier?': 'string | null',
  'seat_tier?': 'string | null',
});
/* @__PURE__ */ export const Anon17973297851555e7 = type({
  'kind': '\'human\'',
});
/* @__PURE__ */ export const Anon19c7d88c176bb245 = type("'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'");
/* @__PURE__ */ export const Anon1a83757b973f348a = type({
  'input_tokens': 'number',
  'output_tokens': 'number',
  'cache_creation_input_tokens': 'number | null',
  'cache_read_input_tokens': 'number | null',
  'server_tool_use': type({ "web_search_requests": "number", "web_fetch_requests": "number" }).or("null"),
  'service_tier': '\'standard\' | \'priority\' | \'batch\' | null',
  'cache_creation': type({ "ephemeral_1h_input_tokens": "number", "ephemeral_5m_input_tokens": "number" }).or("null"),
});
/* @__PURE__ */ export const Anon1ab6c33b3a4d95be = type("unknown");
/* @__PURE__ */ export const Anon1b1cb3ede23e8d05 = type({
  'id': 'string',
  'display_name?': 'string',
});
/* @__PURE__ */ export const Anon1b36f388d40e5168 = type({
  'pattern': 'string',
  'path?': 'string',
  'glob?': 'string',
  'output_mode?': '\'content\' | \'files_with_matches\' | \'count\'',
  'context?': "unknown",
  'type?': 'string',
  'head_limit?': "unknown",
  'offset?': "unknown",
  'multiline?': "unknown",
});
/* @__PURE__ */ export const Anon1bc2ecf97739cec4 = type("'approve' | 'block'");
/* @__PURE__ */ export const Anon1bc2ecf97739cec42 = type("'approve' | 'block'");
/* @__PURE__ */ export const Anon894ab42dfd4c5395 = type({
  'file_uuid': 'string',
  'file_name': 'string',
  'size': 'number',
  'is_image': 'boolean',
});
/* @__PURE__ */ export const Anon1bda117435186126 = type({
  'message': 'string',
  'attachments?': type(type("string").or(Anon894ab42dfd4c5395)).array(),
  'status': '\'normal\' | \'proactive\'',
});
/* @__PURE__ */ export const Anon1be5664faeb99c9f = type("unknown");
/* @__PURE__ */ export const Anon1c010437983e309f = type({
  'id': 'string',
  'display_name?': 'string | null',
  'description?': 'string | null',
});
/* @__PURE__ */ export const Anon1c09a68c171cd904 = type({
  'added': 'string[]',
  'removed': 'string[]',
  'errors': 'Record<string, string>',
});
/* @__PURE__ */ export const Anon1c1b1744c9888ab3 = type("'keep' | 'remove'");
/* @__PURE__ */ export const Anon1c52e934dfa92f66 = type({
  'entries': 'Record<string, string>',
});
/* @__PURE__ */ export const Anon1d76dae9aee143ad = type({
  'title?': 'string',
  'body': 'string',
});
/* @__PURE__ */ export const Anon1e4a490ce15e2b7b = type({
  'name': 'string',
  'email?': 'string',
  'url?': 'string',
});
/* @__PURE__ */ export const Anon4c644a649b1ddc3a = type("'user_temporary' | 'user_permanent' | 'user_reject'");
/* @__PURE__ */ export const Anon1e959406f478de09 = type({
  'behavior': '\'deny\'',
  'message': 'string',
  'interrupt?': 'boolean',
  'toolUseID?': 'string',
  'decisionClassification': Anon4c644a649b1ddc3a,
});
/* @__PURE__ */ export const Anon1f18b0ebcad02f99 = type({
  'serverName?': 'string',
  'serverCommand?': 'string[]',
  'serverUrl?': 'string',
});
/* @__PURE__ */ export const Anon1fd88f5e9ab81c96 = type({
  'name': 'string',
  'description?': 'string',
  'annotations?': { "readOnly?": "boolean", "destructive?": "boolean", "openWorld?": "boolean" },
});
/* @__PURE__ */ export const Anon21446da0d2e388e7 = type({
  'commit?': 'string',
  'pr?': 'string',
});
/* @__PURE__ */ export const Anon218f2f3bb33420cb = type({
  'allowWrite?': 'string[]',
  'denyWrite?': 'string[]',
  'denyRead?': 'string[]',
  'allowRead?': 'string[]',
  'allowManagedReadPathsOnly?': 'boolean',
});
/* @__PURE__ */ export const Anon21ab9f5207855c63 = type({
  'id?': "unknown",
  'enabled': 'boolean',
  'next_run_at': 'string',
  'cron_expression?': "unknown",
  'run_once_at?': "unknown",
});
/* @__PURE__ */ export const Anon22c86deaa768378b = type("'proceed' | 'confirm' | 'blocked'");
/* @__PURE__ */ export const Anon245ea643cf28e9e5 = type("unknown");
/* @__PURE__ */ export const Anon24e03db2f6215af7 = type("unknown");
/* @__PURE__ */ export const Anon255a527ffc36731d = type("unknown");
/* @__PURE__ */ export const CanUseToolRequest = type({
  'subtype': '\'can_use_tool\'',
  'tool_name': 'string',
  'input': 'Record<string, unknown>',
  'permission_suggestions?': AddRulesMessage.array(),
  'blocked_path?': 'string',
  'decision_reason?': 'string',
  'decision_reason_type?': 'string',
  'classifier_approvable?': 'boolean',
  'title?': 'string',
  'display_name?': 'string',
  'tool_use_id': 'string',
  'agent_id?': 'string',
  'description?': 'string',
});
/* @__PURE__ */ export const ElicitationRequest = type({
  'subtype': '\'elicitation\'',
  'mcp_server_name': 'string',
  'message': 'string',
  'mode?': '\'form\' | \'url\'',
  'url?': 'string',
  'elicitation_id?': 'string',
  'requested_schema?': 'Record<string, unknown>',
  'title?': 'string',
  'display_name?': 'string',
  'description?': 'string',
});
/* @__PURE__ */ export const AnonB4c0598943498051 = type("unknown");
/* @__PURE__ */ export const HookCallbackRequest = type({
  'subtype': '\'hook_callback\'',
  'callback_id': 'string',
  'input': AnonB4c0598943498051,
  'tool_use_id?': 'string',
});
/* @__PURE__ */ export const McpMessageRequest = type({
  'subtype': '\'mcp_message\'',
  'server_name': 'string',
  'message': 'Record<string, unknown>',
});
/* @__PURE__ */ export const OauthTokenRefreshRequest = type({
  'subtype': '\'oauth_token_refresh\'',
});
/* @__PURE__ */ export const RequestUserDialogRequest = type({
  'subtype': '\'request_user_dialog\'',
  'dialog_kind': 'string',
  'payload': 'Record<string, unknown>',
  'tool_use_id?': 'string',
});
/* @__PURE__ */ export const Anon25a3a57a1a0abe20 = CanUseToolRequest.or(ElicitationRequest).or(HookCallbackRequest).or(McpMessageRequest).or(OauthTokenRefreshRequest).or(RequestUserDialogRequest);
/* @__PURE__ */ export const Anon25a745954143e9b3 = type({
  'server?': 'string',
});
/* @__PURE__ */ export const Anon2603f1c0be36f64f = type("'summarized' | 'omitted'");
/* @__PURE__ */ export const Anon2603f1c0be36f64f2 = type("'summarized' | 'omitted'");
/* @__PURE__ */ export const Anon2606f1477d291d46 = type({
  'action': '\'list\' | \'get\' | \'create\' | \'update\' | \'run\'',
  'trigger_id?': 'string',
  'body?': 'Record<string, unknown>',
});
/* @__PURE__ */ export const Anon26726b2cd28e693e = type("unknown");
/* @__PURE__ */ export const Anon2675585f2ab80dd1 = type({
  'access_token?': 'string',
  'issued_token_type?': 'string',
  'expires_in?': "unknown",
  'scope?': 'string',
});
/* @__PURE__ */ export const Anon27556fcca90bba9f = type({
  'plan': 'string | null',
  'isAgent': 'boolean',
  'filePath?': 'string',
  'hasTaskTool?': 'boolean',
  'planWasEdited?': 'boolean',
  'awaitingLeaderApproval?': 'boolean',
  'requestId?': 'string',
});
/* @__PURE__ */ export const Anon276faa8489ebc7a6 = type("'personal' | 'team'");
/* @__PURE__ */ export const Anon277eb61db3101535 = type({
  'themes?': "unknown",
});
/* @__PURE__ */ export const Anon27c95d44756789b8 = type({
  'settings?': 'Record<string, unknown>',
});
/* @__PURE__ */ export const Anon28dd8803be3eff50 = type("'allow' | 'deny'");
/* @__PURE__ */ export const Anon28e5ec783a86d8a2 = type({
  'location': 'string',
});
/* @__PURE__ */ export const Anon290809ba2cfa59ff = type({
  'data': { "repository": type({ "pullRequest": type({ "reviewDecision": "string | null" }).or("null") }).or("null") },
});
/* @__PURE__ */ export const Anon2a2225de025a130e = type({
  'details?': "unknown",
});
/* @__PURE__ */ export const Anon2a249da0fd555316 = type({
  'delaySeconds': 'number',
  'reason': 'string',
  'prompt': 'string',
});
/* @__PURE__ */ export const Anon2a5bfa8932e7651c = type("'local' | 'user' | 'project'");
/* @__PURE__ */ export const Anon2a93753f4d0a4c9c = type({
  'title': 'string',
});
/* @__PURE__ */ export const Anon2b087e4bf67a10cb = type("'slash_command' | 'mcp_prompt'");
/* @__PURE__ */ export const Anon2b134ee3b289f9d8 = type("unknown");
/* @__PURE__ */ export const Anon2b4806aacaa71436 = type("'managed' | 'user' | 'project' | 'local'");
/* @__PURE__ */ export const Anon2b4c7eaae61939d3 = type({
  'path': 'string',
  'score?': 'number',
});
/* @__PURE__ */ export const Anon2b7d02e9a76686c7 = type({
  'hookEventName': '\'PostToolBatch\'',
  'additionalContext?': 'string',
});
/* @__PURE__ */ export const Anon2b7d02e9a76686c72 = type({
  'hookEventName': '\'PostToolBatch\'',
  'additionalContext?': 'string',
});
/* @__PURE__ */ export const Anon2bc20d0ca33b7ed8 = type("'disable'");
/* @__PURE__ */ export const Anon2c0ddfc035372ff6 = type("unknown");
/* @__PURE__ */ export const Anon2c713f269a9b7a63 = type({
  'source': '\'npm\'',
  'package?': "unknown",
  'version?': 'string',
  'registry?': 'string',
});
/* @__PURE__ */ export const Anon2ceffe4a1c762e56 = type("'Bash'");
/* @__PURE__ */ export const Anon2d15a8bbf460eb0c = type({
  'id': 'string',
});
/* @__PURE__ */ export const Anon2f57aa1d25d26650 = type({
  'matcher?': 'string',
  'hookCallbackIds': 'string[]',
  'timeout?': 'number',
});
/* @__PURE__ */ export const Anon2fbab4d08d4b6535 = type("'success' | 'error' | 'cancelled'");
/* @__PURE__ */ export const Anon2fc61ba4e89728b9 = type("'idle' | 'working' | 'waiting' | 'completed' | 'archived' | 'cancelled' | 'rejected'");
/* @__PURE__ */ export const Anon3088fcb0441bc9bf = type({
  'error?': "unknown",
});
/* @__PURE__ */ export const Anon309e4c0ccd722b73 = type({
  'server': 'string',
  'uri': 'string',
});
/* @__PURE__ */ export const Anon30b0cf2a294694bd = type({
  'message': 'string',
  'action_url': 'string | null',
  'reason?': 'string',
});
/* @__PURE__ */ export const Anon30c3aa961232a076 = type({
  'enabled?': 'boolean',
  'mode?': '\'hold\' | \'tap\'',
  'autoSubmit?': 'boolean',
});
/* @__PURE__ */ export const Anon3101dadf52478b34 = type("'utf-8' | 'base64'");
/* @__PURE__ */ export const Anon315c34ad1d1a1988 = type("unknown");
/* @__PURE__ */ export const Anon31eb81d1b704ad7e = type({
  'command': 'string',
  'args?': 'string[]',
  'argv0?': 'string',
});
/* @__PURE__ */ export const Anon3275548e2f14eba9 = type({
  'message': 'string',
  'attachments?': type({ "path": "string", "size": "number", "isImage": "boolean", "file_uuid?": "string" }).array(),
  'sentAt?': 'string',
});
/* @__PURE__ */ export const Anon32af2385fe3a9093 = type("unknown");
/* @__PURE__ */ export const Anon32c744e84b0ec6ef = type({
  'pid': 'number',
  'procStart?': 'string',
});
/* @__PURE__ */ export const Anon33a6d56abf0022db = type("unknown");
/* @__PURE__ */ export const Anon341ef219cb7a24e0 = type({
  'behavior': '\'allow\'',
  'updatedInput?': 'Record<string, unknown>',
  'updatedPermissions?': AddRulesMessage.array(),
});
/* @__PURE__ */ export const Anon341ef219cb7a24e02 = type({
  'behavior': '\'allow\'',
  'updatedInput?': 'Record<string, unknown>',
  'updatedPermissions?': AddRulesMessage3.array(),
});
/* @__PURE__ */ export const Anon3422037b4562b721 = type({
  'name?': "unknown",
  'description?': "unknown",
  'model?': "unknown",
  'tools?': "unknown",
  'disallowedTools?': "unknown",
  'color?': "unknown",
  'effort?': "unknown",
  'permissionMode?': "unknown",
  'mcpServers?': 'unknown',
  'hooks?': 'unknown',
  'maxTurns?': 'number | string | null',
  'skills?': "unknown",
  'initialPrompt?': "unknown",
  'memory?': "unknown",
  'background?': "unknown",
  'isolation?': "unknown",
});
/* @__PURE__ */ export const Anon34527d52c105737d = type({
  'query': 'string',
  'max_results?': "unknown",
});
/* @__PURE__ */ export const Anon347cdac91a92f206 = type({
  'filePath': 'string',
  'base64': 'string',
  'originalSize': 'number',
});
/* @__PURE__ */ export const BashCommandMessage = type({
  'type': '\'bash_command\'',
  'command': 'string',
  'cwd?': 'string',
  'uuid?': "unknown",
  'session_id?': 'string',
});
/* @__PURE__ */ export const ApplyFlagSettingsRequest = type({
  'subtype': '\'apply_flag_settings\'',
  'settings': 'Record<string, unknown>',
});
/* @__PURE__ */ export const BackgroundTasksRequest = type({
  'subtype': '\'background_tasks\'',
  'tool_use_id?': 'string',
});
/* @__PURE__ */ export const CancelAsyncMessageRequest = type({
  'subtype': '\'cancel_async_message\'',
  'message_uuid': 'string',
});
/* @__PURE__ */ export const FileSuggestionsRequest = type({
  'subtype': '\'file_suggestions\'',
  'query': 'string',
});
/* @__PURE__ */ export const GetBinaryVersionRequest = type({
  'subtype': '\'get_binary_version\'',
});
/* @__PURE__ */ export const GetContextUsageRequest = type({
  'subtype': '\'get_context_usage\'',
});
/* @__PURE__ */ export const GetSessionCostRequest = type({
  'subtype': '\'get_session_cost\'',
});
/* @__PURE__ */ export const GetSettingsRequest = type({
  'subtype': '\'get_settings\'',
});
/* @__PURE__ */ export const InitializeRequest = type({
  'subtype': '\'initialize\'',
  'hooks?': 'Record<string, unknown>',
  'sdkMcpServers?': 'string[]',
  'jsonSchema?': 'Record<string, unknown>',
  'systemPrompt?': 'string[]',
  'appendSystemPrompt?': 'string',
  'planModeInstructions?': 'string',
  'appendSubagentSystemPrompt?': 'string',
  'excludeDynamicSections?': 'boolean',
  'agents?': { "[string]": AgentDefinition },
  'title?': 'string',
  'skills?': 'string[]',
  'webSearchIsolationExemptMcpServers?': 'string[]',
  'promptSuggestions?': 'boolean',
  'agentProgressSummaries?': 'boolean',
  'forwardSubagentText?': 'boolean',
});
/* @__PURE__ */ export const InterruptRequest = type({
  'subtype': '\'interrupt\'',
});
/* @__PURE__ */ export const McpCallRequest = type({
  'subtype': '\'mcp_call\'',
  'tool': 'string',
  'arguments?': 'Record<string, unknown>',
});
/* @__PURE__ */ export const McpReconnectRequest = type({
  'subtype': '\'mcp_reconnect\'',
  'serverName': 'string',
});
/* @__PURE__ */ export const McpSetServersRequest = type({
  'subtype': '\'mcp_set_servers\'',
  'servers': { "[string]": Anon8702a4e99b43389f },
});
/* @__PURE__ */ export const McpStatusRequest = type({
  'subtype': '\'mcp_status\'',
});
/* @__PURE__ */ export const McpToggleRequest = type({
  'subtype': '\'mcp_toggle\'',
  'serverName': 'string',
  'enabled': 'boolean',
});
/* @__PURE__ */ export const MessageRatedRequest = type({
  'subtype': '\'message_rated\'',
  'messageUuid': 'string',
  'sentiment': '\'positive\' | \'negative\'',
  'surface?': '\'tool_use\' | \'assistant_text\'',
  'cleared?': 'boolean',
});
/* @__PURE__ */ export const ReadFileRequest = type({
  'subtype': '\'read_file\'',
  'path': 'string',
  'max_bytes?': 'number',
  'encoding?': '\'utf-8\' | \'base64\'',
});
/* @__PURE__ */ export const ReloadPluginsRequest = type({
  'subtype': '\'reload_plugins\'',
});
/* @__PURE__ */ export const RenameSessionRequest = type({
  'subtype': '\'rename_session\'',
  'title': 'string',
});
/* @__PURE__ */ export const RewindFilesRequest = type({
  'subtype': '\'rewind_files\'',
  'user_message_id': 'string',
  'dry_run?': 'boolean',
});
/* @__PURE__ */ export const SeedReadStateRequest = type({
  'subtype': '\'seed_read_state\'',
  'path': 'string',
  'mtime': 'number',
});
/* @__PURE__ */ export const SetColorRequest = type({
  'subtype': '\'set_color\'',
  'color': 'string',
});
/* @__PURE__ */ export const SetMaxThinkingTokensRequest = type({
  'subtype': '\'set_max_thinking_tokens\'',
  'max_thinking_tokens': 'number | null',
});
/* @__PURE__ */ export const SetModelRequest = type({
  'subtype': '\'set_model\'',
  'model?': 'string',
});
/* @__PURE__ */ export const SetPermissionModeRequest = type({
  'subtype': '\'set_permission_mode\'',
  'mode': PermissionMode,
  'ultraplan?': 'boolean',
});
/* @__PURE__ */ export const StopTaskRequest = type({
  'subtype': '\'stop_task\'',
  'task_id': 'string',
});
/* @__PURE__ */ export const SubmitFeedbackRequest = type({
  'subtype': '\'submit_feedback\'',
  'description': 'string',
  'surface?': '\'cli\' | \'ccd\' | \'ccw\' | \'sdk\'',
});
/* @__PURE__ */ export const Anon95948edbc99a90aa = ApplyFlagSettingsRequest.or(BackgroundTasksRequest).or(CanUseToolRequest).or(CancelAsyncMessageRequest).or(ElicitationRequest).or(FileSuggestionsRequest).or(GetBinaryVersionRequest).or(GetContextUsageRequest).or(GetSessionCostRequest).or(GetSettingsRequest).or(HookCallbackRequest).or(InitializeRequest).or(InterruptRequest).or(McpCallRequest).or(McpMessageRequest).or(McpReconnectRequest).or(McpSetServersRequest).or(McpStatusRequest).or(McpToggleRequest).or(MessageRatedRequest).or(OauthTokenRefreshRequest).or(ReadFileRequest).or(ReloadPluginsRequest).or(RenameSessionRequest).or(RequestUserDialogRequest).or(RewindFilesRequest).or(SeedReadStateRequest).or(SetColorRequest).or(SetMaxThinkingTokensRequest).or(SetModelRequest).or(SetPermissionModeRequest).or(StopTaskRequest).or(SubmitFeedbackRequest);
/* @__PURE__ */ export const ControlRequestMessage = type({
  'type': '\'control_request\'',
  'request_id': 'string',
  'request': Anon95948edbc99a90aa,
});
/* @__PURE__ */ export const ErrorRequest = type({
  'subtype': '\'error\'',
  'request_id': 'string',
  'error': 'string',
  'pending_permission_requests?': ControlRequestMessage.array(),
});
/* @__PURE__ */ export const SuccessRequest = type({
  'subtype': '\'success\'',
  'request_id': 'string',
  'response?': 'Record<string, unknown>',
});
/* @__PURE__ */ export const ControlResponseMessage = type({
  'type': '\'control_response\'',
  'response': SuccessRequest.or(ErrorRequest),
});
/* @__PURE__ */ export const KeepAliveMessage = type({
  'type': '\'keep_alive\'',
});
/* @__PURE__ */ export const UpdateEnvironmentVariablesMessage = type({
  'type': '\'update_environment_variables\'',
  'variables': 'Record<string, string>',
});
/* @__PURE__ */ export const Anon357a6219953de158 = BashCommandMessage.or(ControlRequestMessage).or(ControlResponseMessage).or(KeepAliveMessage).or(UpdateEnvironmentVariablesMessage);
/* @__PURE__ */ export const Anon35b89acec787dcf6 = type({
  'text': 'string',
});
/* @__PURE__ */ export const Anon36b2d76760b8a7e6 = type({
  'source': '\'userSettings\' | \'projectSettings\' | \'localSettings\' | \'flagSettings\' | \'policySettings\'',
  'settings': 'Record<string, unknown>',
});
/* @__PURE__ */ export const Anon36e788d4b1d6bb55 = type("unknown");
/* @__PURE__ */ export const Anon36e788d4b1d6bb552 = type("unknown");
/* @__PURE__ */ export const Anon37429474e97e640d = type("'low' | 'medium' | 'high' | 'xhigh' | 'max'");
/* @__PURE__ */ export const Anon3799375771f2f77c = type({
  'value': 'string',
  'displayName': 'string',
  'description': 'string',
  'supportsEffort?': 'boolean',
  'supportedEffortLevels?': '(\'low\' | \'medium\' | \'high\' | \'xhigh\' | \'max\')[]',
  'supportsAdaptiveThinking?': 'boolean',
  'supportsFastMode?': 'boolean',
  'supportsAutoMode?': 'boolean',
});
/* @__PURE__ */ export const Anon383219f25a81bbec = type({
  'notebook_path': 'string',
  'cell_id?': 'string',
  'new_source': 'string',
  'cell_type?': '\'code\' | \'markdown\'',
  'edit_mode?': '\'replace\' | \'insert\' | \'delete\'',
});
/* @__PURE__ */ export const Anon384880e809607c3b = type({
  'proto?': "unknown",
  'op': '\'attach\'',
  'short?': "unknown",
  'cols?': "unknown",
  'rows?': "unknown",
  'attachId?': 'string',
  'caps?': { "terminal": "string | null", "mux": "'tmux' | 'screen' | 'zellij' | null", "ssh": "boolean", "wheelFlood?": "boolean", "hyperlinks?": "boolean", "progressReporting?": "boolean", "wtSession?": "boolean", "isVscodeTerm?": "boolean" },
  'holdingFrame?': 'boolean',
});
/* @__PURE__ */ export const Anon446ce4dfba1ac210 = type({
  'name': 'string',
  'description': 'string',
  'argumentHint': 'string',
  'aliases?': 'string[]',
});
/* @__PURE__ */ export const Anon60618c0d9543e972 = type("'allow' | 'ask' | 'blocked'");
/* @__PURE__ */ export const ClaudeaiProxyMessage = type({
  'type': '\'claudeai-proxy\'',
  'url': 'string',
  'id': 'string',
  'alwaysLoad?': 'boolean',
  'toolPermissions?': { "[string]": Anon60618c0d9543e972 },
});
/* @__PURE__ */ export const Anon53a40f0a5a146c2f3 = Anon8702a4e99b43389f.or(ClaudeaiProxyMessage);
/* @__PURE__ */ export const Anon95859e43e360cf2e = type({
  'name': 'string',
  'status': '\'connected\' | \'failed\' | \'needs-auth\' | \'pending\' | \'disabled\'',
  'serverInfo?': { "name": "string", "version": "string" },
  'error?': 'string',
  'config?': Anon53a40f0a5a146c2f3,
  'scope?': 'string',
  'tools?': type({ "name": "string", "description?": "string", "annotations?": { "readOnly?": "boolean", "destructive?": "boolean", "openWorld?": "boolean" } }).array(),
  'capabilities?': { "experimental?": "Record<string, unknown>" },
});
/* @__PURE__ */ export const AnonC58539f1595a7adc = type({
  'name': 'string',
  'description': 'string',
  'model?': 'string',
});
/* @__PURE__ */ export const Anon391109048e96f947 = type({
  'commands': Anon446ce4dfba1ac210.array(),
  'agents': AnonC58539f1595a7adc.array(),
  'plugins': type({ "name": "string", "path": "string", "source?": "string" }).array(),
  'mcpServers': Anon95859e43e360cf2e.array(),
  'error_count': 'number',
});
/* @__PURE__ */ export const Anon391541fe5f40e8cd = type("'low' | 'medium' | 'high' | 'xhigh' | 'max'");
/* @__PURE__ */ export const Anon391541fe5f40e8cd2 = type("'low' | 'medium' | 'high' | 'xhigh' | 'max'");
/* @__PURE__ */ export const Anon39318660bf0c94d7 = type({
  'mode': '\'append\' | \'replace\'',
  'verbs': 'string[]',
});
/* @__PURE__ */ export const Anon39726a51dbceb281 = type({
  'allow?': 'string[]',
  'soft_deny?': 'string[]',
  'hard_deny?': 'string[]',
  'deny?': 'string[]',
  'environment?': 'string[]',
});
/* @__PURE__ */ export const Anon398d33538d5b5353 = type("unknown");
/* @__PURE__ */ export const Anon3a05df05cce88da1 = type({
  'skills?': "unknown",
});
/* @__PURE__ */ export const Anon3a579d9ea8b6da1d = type("unknown");
/* @__PURE__ */ export const Anon3a876cfc36c5271a = type({
  'proto?': "unknown",
  'op': '\'ensure-spare\'',
  'cwd': 'string',
});
/* @__PURE__ */ export const Anon3aa2cc20cd66276a = type({
  'mode': '\'prompt\'',
  'args': 'string[]',
});
/* @__PURE__ */ export const Anon3b0fdc479bc3a052 = type("unknown");
/* @__PURE__ */ export const Anon3bb6bceec92c15a8 = type({
  'source': '\'file\'',
  'path': 'string',
});
/* @__PURE__ */ export const Anon3bd226bd3257a6c7 = type("'hold' | 'tap'");
/* @__PURE__ */ export const Anon3c852a61b8d06040 = type({
  'context?': "unknown",
  'bindings?': "unknown",
});
/* @__PURE__ */ export const Anon3d208733cd8d7f38 = type({
  'syncedFrom': 'string',
});
/* @__PURE__ */ export const Anon3dd7cc36fc25c8f9 = type({
  'repository': type({ "pullRequest": type({ "reviewDecision": "string | null" }).or("null") }).or("null"),
});
/* @__PURE__ */ export const Anon3e5a7fc530762438 = type({
  'questions': type({ "question": "string", "options": type({ "label": "string", "description": "string" }).array() }).array(),
});
/* @__PURE__ */ export const Anon3ea5a5f547fd15b8 = type({
  'source': Anon0a150b08265309d1,
  'installLocation': 'string',
  'lastUpdated': 'string',
  'autoUpdate?': 'boolean',
});
/* @__PURE__ */ export const Anon3edc5b21ec1b2506 = type({
  'userId': 'string',
  'version': 'number',
  'lastModified': 'string',
  'checksum': 'string',
  'content?': "unknown",
});
/* @__PURE__ */ export const Anon3f226a9b2a2fb3c4 = type({
  'canRewind': 'boolean',
  'error?': 'string',
  'filesChanged?': 'string[]',
  'insertions?': 'number',
  'deletions?': 'number',
});
/* @__PURE__ */ export const Anon3f226a9b2a2fb3c42 = type({
  'canRewind': 'boolean',
  'error?': 'string',
  'filesChanged?': 'string[]',
  'insertions?': 'number',
  'deletions?': 'number',
});
/* @__PURE__ */ export const Anon3f801dbbb5e731ac = type({
  'source': '\'url\'',
  'url': 'string',
  'headers?': 'Record<string, string>',
});
/* @__PURE__ */ export const Anon3fc3a6d3e2780c03 = type("'created' | 'updated' | 'deleted' | 'has_existing' | 'unavailable'");
/* @__PURE__ */ export const Anon3fe237832a7e749f = type({
  'operation': '\'incomingCalls\'',
  'filePath': 'string',
  'line?': "unknown",
  'character?': "unknown",
});
/* @__PURE__ */ export const Anon402ece6011b0efe5 = type({});
/* @__PURE__ */ export const Anon402ece6011b0efe52 = type({});
/* @__PURE__ */ export const Anon402ece6011b0efe53 = type({});
/* @__PURE__ */ export const Anon402ece6011b0efe54 = type({});
/* @__PURE__ */ export const Anon402ece6011b0efe55 = type({});
/* @__PURE__ */ export const Anon40a808aba03ef5ae = type({
  'type?': "unknown",
});
/* @__PURE__ */ export const Anon40bed4d9165e8617 = type({});
/* @__PURE__ */ export const Anon41d84caa4621a3d1 = type("unknown");
/* @__PURE__ */ export const Anon41da4e47659be01f = type({
  'servers?': 'string[]',
});
/* @__PURE__ */ export const Anon4261f9beb1eea9e1 = type({
  'message': 'string',
  'status': '\'proactive\'',
});
/* @__PURE__ */ export const Anon42842d48b9b8c200 = type({
  'name': 'string',
  'path': 'string',
  'source?': 'string',
});
/* @__PURE__ */ export const SystemPostTurnSummary = type({
  'type': '\'system\'',
  'subtype': '\'post_turn_summary\'',
  'summarizes_uuid': 'string',
  'status_category': 'string',
  'status_detail': 'string',
  'needs_action': 'string',
  'uuid': 'string',
  'session_id': 'string',
});
/* @__PURE__ */ export const SystemTaskSummary = type({
  'type': '\'system\'',
  'subtype': '\'task_summary\'',
  'detail': 'string | null',
  'uuid': 'string',
  'session_id': 'string',
});
/* @__PURE__ */ export const TranscriptMirrorMessage = type({
  'type': '\'transcript_mirror\'',
  'filePath': 'string',
  'entries': 'unknown[]',
});
/* @__PURE__ */ export const Anon4289975386435f68 = Anon07ca1350d0879686.or(SystemPostTurnSummary).or(SystemTaskSummary).or(TranscriptMirrorMessage);
/* @__PURE__ */ export const Anon42b6c5321267d292 = type({
  'kind': '\'task-notification\'',
});
/* @__PURE__ */ export const Anon451a1f28b7d2c4db = type("unknown");
/* @__PURE__ */ export const Anon454ea7ec55b1af0a = type({
  'description?': 'string',
  'hooks': Anon33a6d56abf0022db,
});
/* @__PURE__ */ export const Anon455d341f4e716d49 = type({
  '$schema?': 'string',
  'name?': "unknown",
  'version?': 'string',
  'description?': 'string',
  'author?': Anon1e4a490ce15e2b7b,
  'homepage?': 'string',
  'repository?': 'string',
  'license?': 'string',
  'keywords?': 'string[]',
  'dependencies?': Anon0138240ae992a4c8.array(),
});
/* @__PURE__ */ export const Anon45decf976d81afb3 = type("unknown");
/* @__PURE__ */ export const Anon46ac3ada0c7b1e06 = type("'idle' | 'running' | 'requires_action'");
/* @__PURE__ */ export const Anon478cba16327530fe = type({
  'matcher?': 'string',
  'hooks?': "unknown",
});
/* @__PURE__ */ export const Anon48115320a134f110 = type({
  'action': '\'keep\' | \'remove\'',
  'originalCwd': 'string',
  'worktreePath': 'string',
  'worktreeBranch?': 'string',
  'tmuxSessionName?': 'string',
  'discardedFiles?': 'number',
  'discardedCommits?': 'number',
  'message': 'string',
});
/* @__PURE__ */ export const Anon487c7d5e38b89e19 = type({
  'state': 'string',
  'detail': 'string',
  'tempo?': '\'active\' | \'idle\' | \'blocked\'',
  'inFlight?': { "tasks": "number", "queued": "number", "kinds": "string[]" },
  'needs_you?': 'boolean',
  'needs?': 'string',
  'block?': { "questions": type({ "question": "string", "options": type({ "label": "string", "description": "string" }).array() }).array() },
  'suggestedReply?': 'string',
  'output?': "unknown",
  'children?': "unknown",
  'linkScanOffset': 'number',
  'linkScanPath?': 'string',
  'template': 'string',
  'routine?': 'string',
  'respawnFlags': 'string[]',
  'intent': 'string',
  'initialPrompt?': 'string',
  'name?': 'string',
  'nameSource?': '\'user\' | \'auto\'',
  'color?': 'string',
  'sessionId': 'string',
  'resumeSessionId?': 'string',
  'daemonShort?': 'string',
  'cliVersion?': 'string',
  'cwd': 'string',
  'createdAt': 'string',
  'updatedAt': 'string',
  'firstTerminalAt?': "unknown",
  'worktreePath?': 'string',
  'worktreeBranch?': 'string',
  'worktreeHookBased?': 'boolean',
  'originCwd?': 'string',
  'bridgeSessionId?': 'string',
  'bridgeSessionSeq?': 'number',
  'backend': '\'daemon\' | \'peer\'',
  'sock?': 'string',
  'pid?': 'number',
  'sortOrder?': 'number',
  'stateSortOrder?': 'number',
  'pinned?': 'boolean',
});
/* @__PURE__ */ export const Anon49057bd2b48294a4 = type("unknown");
/* @__PURE__ */ export const Anon4939b73612ae2a67 = type({
  'data': type({ "id": "string", "display_name?": "string | null", "description?": "string | null" }).array(),
});
/* @__PURE__ */ export const Anon4a2d962e7b8dcec1 = type({
  'key': 'string',
  'label': 'string',
  'description?': 'string',
});
/* @__PURE__ */ export const Anon4a72c831e33b6e69 = type({
  'location': 'string',
  'unit?': '\'celsius\' | \'fahrenheit\'',
});
/* @__PURE__ */ export const Anon4ab586cd5db3fabf = type("unknown");
/* @__PURE__ */ export const Anon4ad248f176b407e4 = type({
  'question': 'string',
  'options': type({ "label": "string", "description": "string" }).array(),
});
/* @__PURE__ */ export const Anon4b391ee71b4ae472 = type({
  'type?': 'string',
  'message?': 'string',
  'details?': { "error_code?": "string" },
});
/* @__PURE__ */ export const Anon4c339783249d8174 = type("unknown");
/* @__PURE__ */ export const Anon4ca3dfb8097e72a4 = type({
  'file_path': 'string',
  'offset?': "unknown",
  'limit?': "unknown",
  'pages?': 'string',
});
/* @__PURE__ */ export const Anon4cffddbec82ce2a4 = type("'keep' | 'remove'");
/* @__PURE__ */ export const Anon4d20b4f8cb500fb0 = type({
  'hookEventName': '\'WorktreeCreate\'',
  'worktreePath': 'string',
});
/* @__PURE__ */ export const Anon4de62b233e257b9c = type({
  'source': Anon0a150b08265309d1,
  'installLocation?': 'string',
  'autoUpdate?': 'boolean',
});
/* @__PURE__ */ export const Anon4e3f80f2dca4bca8 = type({
  'hook_event_name': '\'SessionStart\'',
  'source': '\'startup\' | \'resume\' | \'clear\' | \'compact\'',
  'agent_type?': 'string',
  'model?': 'string',
});
/* @__PURE__ */ export const Anon4e67374ed03b4855 = type({
  'proto?': "unknown",
  'op': '\'reply\'',
  'short?': "unknown",
  'text': 'string',
});
/* @__PURE__ */ export const Anon4edd40be4be5cfd7 = type("'startup' | 'resume' | 'clear' | 'compact'");
/* @__PURE__ */ export const Anon4fe176946cbba53a = type({
  'questions?': "unknown",
});
/* @__PURE__ */ export const Anon4ffed11602886665 = type({
  'name?': "unknown",
  'description?': "unknown",
  'model?': "unknown",
  'arguments?': "unknown",
  'effort?': "unknown",
  'shell?': "unknown",
  'version?': "unknown",
});
/* @__PURE__ */ export const Anon50c7576f5fe9cc74 = type({
  'total_tokens': 'number',
  'tool_uses': 'number',
  'duration_ms': 'number',
});
/* @__PURE__ */ export const Anon50d1c00f7a50843d = type("unknown");
/* @__PURE__ */ export const Anon50d47eb201a158e4 = type({
  'source': '\'unsupported\'',
});
/* @__PURE__ */ export const Anon518adfb7df3aa592 = type({
  'agentType': 'string',
  'source': 'string',
  'tokens': 'number',
});
/* @__PURE__ */ export const Anon527105bb51f992a5 = type("unknown");
/* @__PURE__ */ export const Anon52a363c55096c944 = type("unknown");
/* @__PURE__ */ export const AnonC4c40a46c8404e8d = type({
  'version': '2',
  'plugins?': "unknown",
});
/* @__PURE__ */ export const Anon53a40f0a5a146c2f2 = Anon08b4e8085ff79b43.or(AnonC4c40a46c8404e8d);
/* @__PURE__ */ export const Anon6227a95e43be17b8 = type({
  'hookEventName': '\'Notification\'',
  'additionalContext?': 'string',
});
/* @__PURE__ */ export const Anon73f6265bba627342 = type({
  'hookEventName': '\'Setup\'',
  'additionalContext?': 'string',
});
/* @__PURE__ */ export const AnonF93ec69ad889f641 = type("'allow' | 'deny' | 'ask' | 'defer'");
/* @__PURE__ */ export const Anon838960cc790ced16 = type({
  'hookEventName': '\'PreToolUse\'',
  'permissionDecision?': AnonF93ec69ad889f641,
  'permissionDecisionReason?': 'string',
  'updatedInput?': 'Record<string, unknown>',
  'additionalContext?': 'string',
});
/* @__PURE__ */ export const Anon880dfbaa52377a34 = type({
  'hookEventName': '\'FileChanged\'',
  'watchPaths?': 'string[]',
});
/* @__PURE__ */ export const Anon8e8f4c8eba0ebb34 = type({
  'hookEventName': '\'UserPromptSubmit\'',
  'additionalContext?': 'string',
  'sessionTitle?': 'string',
  'suppressOriginalPrompt?': 'boolean',
});
/* @__PURE__ */ export const Anon8fe41e991789a853 = type({
  'hookEventName': '\'SessionStart\'',
  'additionalContext?': 'string',
  'initialUserMessage?': 'string',
  'watchPaths?': 'string[]',
});
/* @__PURE__ */ export const Anon93e0e4c919548aaa = type({
  'hookEventName': '\'PostToolUse\'',
  'additionalContext?': 'string',
  'updatedToolOutput?': 'unknown',
  'updatedMCPToolOutput?': 'unknown',
});
/* @__PURE__ */ export const AnonB2b34fa4b0807d9c = type({
  'hookEventName': '\'ElicitationResult\'',
  'action?': '\'accept\' | \'decline\' | \'cancel\'',
  'content?': 'Record<string, unknown>',
});
/* @__PURE__ */ export const AnonB44597eb47d19fae = type({
  'hookEventName': '\'PermissionRequest\'',
  'decision': type({ "behavior": "'allow'", "updatedInput?": "Record<string, unknown>", "updatedPermissions?": AddRulesMessage.array() }).or({ "behavior": "'deny'", "message?": "string", "interrupt?": "boolean" }),
});
/* @__PURE__ */ export const AnonB6c8183e000e4e59 = type({
  'hookEventName': '\'Elicitation\'',
  'action?': '\'accept\' | \'decline\' | \'cancel\'',
  'content?': 'Record<string, unknown>',
});
/* @__PURE__ */ export const AnonC5b03b74a320c1d4 = type({
  'hookEventName': '\'SubagentStart\'',
  'additionalContext?': 'string',
});
/* @__PURE__ */ export const AnonD84db4f4fb354ccf = type({
  'hookEventName': '\'UserPromptExpansion\'',
  'additionalContext?': 'string',
});
/* @__PURE__ */ export const AnonEc88bda221054bc7 = type({
  'hookEventName': '\'PermissionDenied\'',
  'retry?': 'boolean',
});
/* @__PURE__ */ export const AnonF012ae85d892ebbc = type({
  'hookEventName': '\'PostToolUseFailure\'',
  'additionalContext?': 'string',
});
/* @__PURE__ */ export const AnonF734e61e83559e05 = type({
  'hookEventName': '\'CwdChanged\'',
  'watchPaths?': 'string[]',
});
/* @__PURE__ */ export const AnonA922235dca060d85 = type({
  'continue?': 'boolean',
  'suppressOutput?': 'boolean',
  'stopReason?': 'string',
  'decision?': '\'approve\' | \'block\'',
  'systemMessage?': 'string',
  'reason?': 'string',
  'hookSpecificOutput?': Anon838960cc790ced16.or(Anon8e8f4c8eba0ebb34).or(AnonD84db4f4fb354ccf).or(Anon8fe41e991789a853).or(Anon73f6265bba627342).or(AnonC5b03b74a320c1d4).or(Anon93e0e4c919548aaa).or(AnonF012ae85d892ebbc).or(Anon2b7d02e9a76686c7).or(AnonEc88bda221054bc7).or(Anon6227a95e43be17b8).or(AnonB44597eb47d19fae).or(AnonB6c8183e000e4e59).or(AnonB2b34fa4b0807d9c).or(AnonF734e61e83559e05).or(Anon880dfbaa52377a34).or(Anon4d20b4f8cb500fb0),
});
/* @__PURE__ */ export const Anon53a40f0a5a146c2f4 = Anon014680089a6c3b1c.or(AnonA922235dca060d85);
/* @__PURE__ */ export const Anon9f16486fd14da535 = type("unknown");
/* @__PURE__ */ export const AnonA6f9527b4fa26479 = type({
  'tool_name': 'string',
  'tool_use_id': 'string',
  'tool_input': 'Record<string, unknown>',
});
/* @__PURE__ */ export const AnonAd3564867470ec4c = type({
  'inputTokens': 'number',
  'outputTokens': 'number',
  'cacheReadInputTokens': 'number',
  'cacheCreationInputTokens': 'number',
  'webSearchRequests': 'number',
  'costUSD': 'number',
  'contextWindow': 'number',
  'maxOutputTokens': 'number',
});
/* @__PURE__ */ export const ResultMessage = type({
  'type': '\'result\'',
  'subtype': '\'error_during_execution\' | \'error_max_turns\' | \'error_max_budget_usd\' | \'error_max_structured_output_retries\'',
  'duration_ms': 'number',
  'duration_api_ms': 'number',
  'is_error': 'boolean',
  'num_turns': 'number',
  'stop_reason': 'string | null',
  'total_cost_usd': 'number',
  'usage': 'Record<string, unknown>',
  'modelUsage': { "[string]": AnonAd3564867470ec4c },
  'permission_denials': AnonA6f9527b4fa26479.array(),
  'errors': 'string[]',
  'terminal_reason?': 'string',
  'fast_mode_state?': Anon687df4bcd3dc44ff,
  'origin?': Anon9f16486fd14da535,
  'uuid': 'string',
  'session_id': 'string',
});
/* @__PURE__ */ export const Anon55ddd2e4708b5746 = type({
  'id': 'string',
  'name': 'string',
  'input': 'Record<string, unknown>',
});
/* @__PURE__ */ export const ResultSuccess = type({
  'type': '\'result\'',
  'subtype': '\'success\'',
  'duration_ms': 'number',
  'duration_api_ms': 'number',
  'is_error': 'boolean',
  'api_error_status?': 'number | null',
  'num_turns': 'number',
  'result': 'string',
  'stop_reason': 'string | null',
  'total_cost_usd': 'number',
  'usage': 'Record<string, unknown>',
  'modelUsage': { "[string]": AnonAd3564867470ec4c },
  'permission_denials': AnonA6f9527b4fa26479.array(),
  'structured_output?': 'unknown',
  'deferred_tool_use?': Anon55ddd2e4708b5746,
  'terminal_reason?': 'string',
  'fast_mode_state?': Anon687df4bcd3dc44ff,
  'origin?': Anon9f16486fd14da535,
  'uuid': 'string',
  'session_id': 'string',
});
/* @__PURE__ */ export const Anon53a40f0a5a146c2f5 = ResultMessage.or(ResultSuccess);
/* @__PURE__ */ export const Anon53a40f0a5a146c2f6 = type("unknown");
/* @__PURE__ */ export const AnonC1e85402264b9779 = type({
  'behavior': '\'allow\'',
  'updatedInput': 'Record<string, unknown>',
  'updatedPermissions?': "unknown",
  'toolUseID?': 'string',
  'decisionClassification': Anon4c644a649b1ddc3a,
});
/* @__PURE__ */ export const Anon53a40f0a5a146c2f7 = Anon1e959406f478de09.or(AnonC1e85402264b9779);
/* @__PURE__ */ export const Anon53b9a33cb5a1f1bb = type({
  'tool_name': 'string',
  'input': 'Record<string, unknown>',
  'tool_use_id?': 'string',
});
/* @__PURE__ */ export const Anon53bc9fe35413b1b8 = type({
  'operation': '\'goToDefinition\' | \'findReferences\' | \'hover\' | \'documentSymbol\' | \'workspaceSymbol\' | \'goToImplementation\' | \'prepareCallHierarchy\' | \'incomingCalls\' | \'outgoingCalls\'',
  'filePath': 'string',
  'line?': "unknown",
  'character?': "unknown",
});
/* @__PURE__ */ export const Anon53eb19ef682276be = type({
  'pullRequest': type({ "reviewDecision": "string | null" }).or("null"),
});
/* @__PURE__ */ export const Anon546d802f6a1d72dc = ApplyFlagSettingsRequest.or(BackgroundTasksRequest).or(CancelAsyncMessageRequest).or(FileSuggestionsRequest).or(GetBinaryVersionRequest).or(GetContextUsageRequest).or(GetSessionCostRequest).or(GetSettingsRequest).or(InitializeRequest).or(InterruptRequest).or(McpCallRequest).or(McpReconnectRequest).or(McpSetServersRequest).or(McpStatusRequest).or(McpToggleRequest).or(MessageRatedRequest).or(ReadFileRequest).or(ReloadPluginsRequest).or(RenameSessionRequest).or(RewindFilesRequest).or(SeedReadStateRequest).or(SetColorRequest).or(SetMaxThinkingTokensRequest).or(SetModelRequest).or(SetPermissionModeRequest).or(StopTaskRequest).or(SubmitFeedbackRequest);
/* @__PURE__ */ export const Anon5e47621d5ec20c83 = type({
  'tool': '\'Bash\'',
  'prompt': 'string',
});
/* @__PURE__ */ export const Anon54c8bd93787dd0e4 = type({
  'allowedPrompts?': Anon5e47621d5ec20c83.array(),
});
/* @__PURE__ */ export const Anon54e56f5c7f954363 = type({
  'proto?': "unknown",
  'op': '\'permission-response\'',
  'short?': "unknown",
  'requestId': 'string',
  'allow': 'boolean',
});
/* @__PURE__ */ export const Anon54fd8bf346b61a12 = type("unknown");
/* @__PURE__ */ export const Anon56153d665a519aa5 = type({
  'suggestions': type({ "path": "string", "score?": "number" }).array(),
});
/* @__PURE__ */ export const Anon568e8bb259d91a4a = type({
  'proto?': "unknown",
  'op': '\'yield\'',
});
/* @__PURE__ */ export const Anon56ac62326198c334 = type({
  'tasks?': "unknown",
});
/* @__PURE__ */ export const Anon58f5521285ba831e = type({
  'message': 'string',
});
/* @__PURE__ */ export const Anon58f99ff9ed638fba = type({
  'proto?': "unknown",
  'op': '\'kill\'',
  'short?': "unknown",
  'signal?': '\'SIGTERM\' | \'SIGKILL\'',
});
/* @__PURE__ */ export const Anon58fa413d87081552 = type({
  'serverName?': 'string',
  'serverCommand?': 'string[]',
  'serverUrl?': 'string',
});
/* @__PURE__ */ export const Anon5940f3e5f57212a8 = type("unknown");
/* @__PURE__ */ export const Anon59a224100ceaf754 = type({
  'code': 'string',
  'description?': 'string',
  'timeout?': 'number',
});
/* @__PURE__ */ export const Anon59d0fb42fd6a358b = type({
  'proto?': "unknown",
  'op': '\'subscribe\'',
  'short?': "unknown",
  'tail?': 'number',
});
/* @__PURE__ */ export const Anon5a21335f46cd0bcd = type("unknown");
/* @__PURE__ */ export const Anon5a33efbcbb7eadc0 = type({
  'id': 'string',
  'content': 'string',
});
/* @__PURE__ */ export const Anon5ac38dcec4506790 = type("unknown");
/* @__PURE__ */ export const Anon5c2c9226f0fe35bf = type({
  'query': 'string',
  'results?': "unknown",
  'durationSeconds': 'number',
});
/* @__PURE__ */ export const Anon5cb15f2dc15f1c55 = type({
  'hook_event_name': '\'ElicitationResult\'',
  'mcp_server_name': 'string',
  'elicitation_id?': 'string',
  'mode?': '\'form\' | \'url\'',
  'action': '\'accept\' | \'decline\' | \'cancel\'',
  'content?': 'Record<string, unknown>',
});
/* @__PURE__ */ export const Anon5cb522ffc12e6122 = type({
  'filename': 'string',
  'error': 'string',
});
/* @__PURE__ */ export const Anon5d55982f22a30eb6 = type({
  'name': 'string',
  'version': 'string',
});
/* @__PURE__ */ export const Anon5d9f72d434bd385c = type({
  'init_retry_max_attempts?': "unknown",
  'init_retry_base_delay_ms': 'number',
  'init_retry_jitter_fraction?': "unknown",
  'init_retry_max_delay_ms': 'number',
  'http_timeout_ms': 'number',
  'uuid_dedup_buffer_size?': "unknown",
  'heartbeat_interval_ms?': "unknown",
  'heartbeat_jitter_fraction?': "unknown",
  'token_refresh_buffer_ms?': "unknown",
  'teardown_archive_timeout_ms?': "unknown",
  'connect_timeout_ms?': "unknown",
  'min_version': 'string',
  'should_show_app_upgrade_message': 'boolean',
});
/* @__PURE__ */ export const Anon5da8f4bf3dab6284 = type({
  'method?': "unknown",
  'params': { "request_id": "string", "behavior": "'allow' | 'deny'" },
});
/* @__PURE__ */ export const Anon5dbe65dd64258306 = type({
  'prompt': 'string',
  'message': 'string',
  'options': type({ "key": "string", "label": "string", "description?": "string" }).array(),
});
/* @__PURE__ */ export const Anon5dc3753d3316841b = type("'low' | 'medium' | 'high' | 'immediate'");
/* @__PURE__ */ export const Anon5e00245bc85b633a = type({
  'name?': "unknown",
});
/* @__PURE__ */ export const Anon5f01d7bc6c132753 = type("'default' | 'verbose' | 'focus'");
/* @__PURE__ */ export const Anon5f0759fbd4cd93fb = type({
  'hook_event_name': '\'PostToolUseFailure\'',
  'tool_name': 'string',
  'tool_input': 'unknown',
  'tool_use_id': 'string',
  'error': 'string',
  'is_interrupt?': 'boolean',
  'duration_ms?': 'number',
});
/* @__PURE__ */ export const Anon5f084199739e5f44 = type({
  'hookEventName': '\'WorktreeCreate\'',
  'worktreePath': 'string',
});
/* @__PURE__ */ export const Anon5f529be66fc60b8f = type({
  'tasks?': "unknown",
  'maxConcurrent?': "unknown",
});
/* @__PURE__ */ export const Anon5f76bd8450c14ab0 = type("'normal' | 'proactive'");
/* @__PURE__ */ export const Anon5fa49d796ffd0d52 = type({
  'method': '\'selection_changed\'',
  'params': { "selection?": type({ "start": { "line": "number", "character": "number" }, "end": { "line": "number", "character": "number" } }).or("null"), "text?": "string", "filePath?": "string" },
});
/* @__PURE__ */ export const Anon600aaed86884ed33 = type({
  'task': { "id": "string", "subject": "string" },
});
/* @__PURE__ */ export const Anon6018815963955905 = type({
  'sessionId': 'string',
  'summary': 'string',
  'lastModified': 'number',
  'fileSize?': 'number',
  'customTitle?': 'string',
  'firstPrompt?': 'string',
  'gitBranch?': 'string',
  'cwd?': 'string',
  'tag?': 'string',
  'createdAt?': 'number',
});
/* @__PURE__ */ export const Anon603b8e936b805973 = type({
  'pattern': 'string',
  'path?': 'string',
});
/* @__PURE__ */ export const Anon61ebb09837db6396 = type({
  'proto?': "unknown",
  'op': '\'list\'',
});
/* @__PURE__ */ export const Anon6227a95e43be17b82 = type({
  'hookEventName': '\'Notification\'',
  'additionalContext?': 'string',
});
/* @__PURE__ */ export const Anon62b125a7965e086d = type("unknown");
/* @__PURE__ */ export const Anon633102cbc4b499bd = type("'user' | 'project' | 'local'");
/* @__PURE__ */ export const Anon634b7f7d37803d16 = type("'accept' | 'decline' | 'cancel'");
/* @__PURE__ */ export const Anon634b7f7d37803d162 = type("'accept' | 'decline' | 'cancel'");
/* @__PURE__ */ export const Anon634b7f7d37803d163 = type("'accept' | 'decline' | 'cancel'");
/* @__PURE__ */ export const Anon634b7f7d37803d164 = type("'accept' | 'decline' | 'cancel'");
/* @__PURE__ */ export const Anon63c698c1f25606b5 = type({
  'mcp_response': 'unknown',
});
/* @__PURE__ */ export const Anon6417065df9570b24 = type("'change' | 'add' | 'unlink'");
/* @__PURE__ */ export const Anon64f7622236ef2e24 = type("'create' | 'update'");
/* @__PURE__ */ export const Anon653cda8d95655d0d = type("unknown");
/* @__PURE__ */ export const Anon655ead53551aa4d1 = type("'standalone' | 'repl'");
/* @__PURE__ */ export const Anon657d71cce40c873f = type({
  'message': 'string',
  'task_id': 'string',
  'task_type': 'string',
  'command?': 'string',
});
/* @__PURE__ */ export const Anon664e90c3062ad00e = type({
  'intervalSeconds': 'number',
});
/* @__PURE__ */ export const Anon66c59088d91ec149 = type({
  'allowedDomains?': "unknown",
  'deniedDomains?': "unknown",
  'allowUnixSockets?': 'string[]',
  'allowAllUnixSockets?': 'boolean',
  'allowLocalBinding?': 'boolean',
  'allowMachLookup?': "unknown",
  'httpProxyPort?': "unknown",
  'socksProxyPort?': "unknown",
  'mitmProxy?': "unknown",
  'parentProxy?': "unknown",
});
/* @__PURE__ */ export const AnonA3eb0815f27f996c = type({
  'allowedDomains?': 'string[]',
  'deniedDomains?': 'string[]',
  'allowManagedDomainsOnly?': 'boolean',
  'allowUnixSockets?': 'string[]',
  'allowAllUnixSockets?': 'boolean',
  'allowLocalBinding?': 'boolean',
  'allowMachLookup?': "unknown",
  'httpProxyPort?': 'number',
  'socksProxyPort?': 'number',
});
/* @__PURE__ */ export const Anon6752a06ba5126448 = type({
  'enabled?': 'boolean',
  'failIfUnavailable?': 'boolean',
  'autoAllowBashIfSandboxed?': 'boolean',
  'allowUnsandboxedCommands?': 'boolean',
  'network': AnonA3eb0815f27f996c,
  'filesystem': Anon218f2f3bb33420cb,
  'ignoreViolations?': 'Record<string, string[]>',
  'enableWeakerNestedSandbox?': 'boolean',
  'enableWeakerNetworkIsolation?': 'boolean',
  'excludedCommands?': 'string[]',
  'ripgrep?': { "command": "string", "args?": "string[]" },
  'bwrapPath?': "unknown",
  'socatPath?': "unknown",
});
/* @__PURE__ */ export const Anon675b3e71bccc4348 = type({
  'proto?': "unknown",
  'op': '\'leases\'',
});
/* @__PURE__ */ export const Anon67a2109c2728ed5e = type("'code' | 'markdown'");
/* @__PURE__ */ export const Anon68c3ce3defa2d4e2 = type({});
/* @__PURE__ */ export const Anon68c3ce3defa2d4e22 = type({});
/* @__PURE__ */ export const Anon691269b3369014e2 = type("'replace' | 'insert' | 'delete'");
/* @__PURE__ */ export const Anon6913eb62bb7c15d7 = type({
  'prompt_response': 'string',
  'selected': 'string',
});
/* @__PURE__ */ export const Anon69606b70b477d76a = type({
  'outputStyles?': "unknown",
});
/* @__PURE__ */ export const AnonD73f663a602579a5 = type({
  'proto?': "unknown",
  'short': 'string',
  'nonce?': 'string',
  'sessionId': 'string',
  'createdAt': 'number',
  'source': '\'shell\' | \'slash\' | \'fleet\' | \'spare\' | \'respawn\'',
  'cwd': 'string',
  'launch?': "unknown",
  'env': 'Record<string, string>',
  'reattachEnv?': 'Record<string, string>',
  'worktree?': { "path": "string", "ownershipToken": "string" },
  'isolation': '\'none\' | \'worktree\'',
  'respawnFlags': 'string[]',
  'attachStallRespawns?': 'number',
  'agent?': 'string',
  'routine?': 'string',
  'seed?': { "intent": "string", "name?": "string" },
  'cols?': "unknown",
  'rows?': "unknown",
});
/* @__PURE__ */ export const Anon698c18ecea5093e9 = type({
  'proto?': "unknown",
  'op': '\'dispatch\'',
  'd': AnonD73f663a602579a5,
  'timeoutMs': 'number',
});
/* @__PURE__ */ export const Anon69c09350c1c689b6 = type("unknown");
/* @__PURE__ */ export const Anon6a1428514b1e29d0 = type({
  'head_uuid?': "unknown",
  'anchor_uuid?': "unknown",
  'tail_uuid?': "unknown",
});
/* @__PURE__ */ export const Anon6b0ed2aa1251b8e1 = type("'userSettings' | 'projectSettings' | 'localSettings' | 'flagSettings' | 'policySettings'");
/* @__PURE__ */ export const Anon6bbcf3a76254d5ab = type({
  'command': 'string',
  'args?': 'string[]',
});
/* @__PURE__ */ export const Anon6bf81c3d08b90b83 = type("unknown");
/* @__PURE__ */ export const Anon6cb614913db1ea25 = type("unknown");
/* @__PURE__ */ export const Anon6cea5f2355e50c11 = type("unknown");
/* @__PURE__ */ export const Anon6d03a595acfd3199 = type("'five_hour' | 'seven_day' | 'seven_day_opus' | 'seven_day_sonnet' | 'overage'");
/* @__PURE__ */ export const Anon6e706fa8e35c326e = type({
  'entries': 'Record<string, string>',
  'entryChecksums?': 'Record<string, string>',
  'deletedEntries?': 'Record<string, number>',
});
/* @__PURE__ */ export const Anon6e7e80cb15ddf3e4 = type("unknown");
/* @__PURE__ */ export const Anon6ec387df8c223447 = type("unknown");
/* @__PURE__ */ export const AnonB458843c7d5d8181 = type({
  'type': '\'http\' | \'streamable-http\'',
  'url': 'string',
  'headers?': 'Record<string, string>',
  'headersHelper?': 'string',
  'oauth?': AnonB946fa776c1903c4,
  'alwaysLoad?': 'boolean',
});
/* @__PURE__ */ export const SseIdeMessage = type({
  'type': '\'sse-ide\'',
  'url': 'string',
  'ideName': 'string',
  'ideRunningInWindows?': 'boolean',
  'alwaysLoad?': 'boolean',
});
/* @__PURE__ */ export const WsIdeMessage = type({
  'type': '\'ws-ide\'',
  'url': 'string',
  'ideName': 'string',
  'authToken?': 'string',
  'ideRunningInWindows?': 'boolean',
  'alwaysLoad?': 'boolean',
});
/* @__PURE__ */ export const WsMessage = type({
  'type': '\'ws\'',
  'url': 'string',
  'headers?': 'Record<string, string>',
  'headersHelper?': 'string',
  'alwaysLoad?': 'boolean',
});
/* @__PURE__ */ export const Anon6f5d7ed95df79316 = AnonB458843c7d5d8181.or(ClaudeaiProxyMessage).or(SdkMessage).or(SseMessage).or(SseIdeMessage).or(StdioMessage).or(WsMessage).or(WsIdeMessage);
/* @__PURE__ */ export const ControlCancelRequestMessage = type({
  'type': '\'control_cancel_request\'',
  'request_id': 'string',
});
/* @__PURE__ */ export const Anon6f5d7ed95df793162 = Anon07ca1350d0879686.or(ControlCancelRequestMessage).or(ControlRequestMessage).or(ControlResponseMessage).or(KeepAliveMessage).or(SystemPostTurnSummary).or(SystemTaskSummary).or(TranscriptMirrorMessage);
/* @__PURE__ */ export const Anon6f62218836cef373 = type("'worktree'");
/* @__PURE__ */ export const Anon6f8c02792ae8f172 = type("'pending' | 'running' | 'completed' | 'failed' | 'killed'");
/* @__PURE__ */ export const Anon6f916dbf171b6f52 = type("unknown");
/* @__PURE__ */ export const Anon70b04baea97fe049 = type({
  'key': 'string',
  'label': 'string',
  'description?': 'string',
});
/* @__PURE__ */ export const Anon716de6b10151ea8e = type({
  'marketplace': 'string',
  'plugin': 'string',
});
/* @__PURE__ */ export const Anon716de6b10151ea8e2 = type({
  'marketplace': 'string',
  'plugin': 'string',
});
/* @__PURE__ */ export const Anon717effeba3aec1fb = type({
  'hook_event_name': '\'PreCompact\'',
  'trigger': '\'manual\' | \'auto\'',
  'custom_instructions': 'string | null',
});
/* @__PURE__ */ export const Anon71c9a92dec290be8 = type({
  'taskId': 'string',
});
/* @__PURE__ */ export const Anon725de6af39ad4df1 = type({
  'restrictions': { "[string]": { "allowed": "boolean" } },
  'compliance_taints': 'string[]',
});
/* @__PURE__ */ export const Anon726cf7725172afda = type("'overage_not_provisioned' | 'org_level_disabled' | 'org_level_disabled_until' | 'out_of_credits' | 'seat_tier_level_disabled' | 'member_level_disabled' | 'seat_tier_zero_credit_limit' | 'group_zero_credit_limit' | 'member_zero_credit_limit' | 'org_service_level_disabled' | 'no_limits_configured' | 'fetch_error' | 'unknown'");
/* @__PURE__ */ export const Anon72895270736f4e15 = type("unknown");
/* @__PURE__ */ export const Anon72bae3a903ae0230 = type({
  'proto?': "unknown",
  'op': '\'resize\'',
  'short?': "unknown",
  'cols?': "unknown",
  'rows?': "unknown",
  'attachId?': 'string',
});
/* @__PURE__ */ export const Anon73ad9567d4a048a4 = type({
  'session_id': 'string',
  'transcript_path': 'string',
  'cwd': 'string',
  'permission_mode?': 'string',
  'agent_id?': 'string',
  'agent_type?': 'string',
  'effort?': { "level": "string" },
});
/* @__PURE__ */ export const Anon73bf81fbe673a0c8 = type({
  'hook_event_name': '\'Elicitation\'',
  'mcp_server_name': 'string',
  'message': 'string',
  'mode?': '\'form\' | \'url\'',
  'url?': 'string',
  'elicitation_id?': 'string',
  'requested_schema?': 'Record<string, unknown>',
});
/* @__PURE__ */ export const Anon73f6265bba6273422 = type({
  'hookEventName': '\'Setup\'',
  'additionalContext?': 'string',
});
/* @__PURE__ */ export const Anon73fe45b1ea1c1b8b = type({
  'hook_event_name': '\'SessionEnd\'',
  'reason?': "unknown",
});
/* @__PURE__ */ export const Anon74af258349174e86 = type({
  'mode?': '\'content\' | \'files_with_matches\' | \'count\'',
  'numFiles': 'number',
  'filenames': 'string[]',
  'content?': 'string',
  'numLines?': 'number',
  'numMatches?': 'number',
  'appliedLimit?': 'number',
  'appliedOffset?': 'number',
});
/* @__PURE__ */ export const AnonD461b363cdd73684 = type({
  'color': 'string',
  'isFilled': 'boolean',
  'categoryName': 'string',
  'tokens': 'number',
  'percentage': 'number',
  'squareFullness': 'number',
});
/* @__PURE__ */ export const AnonD510a8b918c0acbb = type({
  'name': 'string',
  'tokens': 'number',
  'color': 'string',
  'isDeferred?': 'boolean',
});
/* @__PURE__ */ export const Anon75363387bf0918a9 = type({
  'categories': AnonD510a8b918c0acbb.array(),
  'totalTokens': 'number',
  'maxTokens': 'number',
  'rawMaxTokens': 'number',
  'percentage': 'number',
  'gridRows': type(AnonD461b363cdd73684.array()).array(),
  'model': 'string',
  'memoryFiles': type({ "path": "string", "type": "string", "tokens": "number" }).array(),
  'mcpTools': type({ "name": "string", "serverName": "string", "tokens": "number", "isLoaded?": "boolean" }).array(),
  'deferredBuiltinTools?': type({ "name": "string", "tokens": "number", "isLoaded": "boolean" }).array(),
  'systemTools?': type({ "name": "string", "tokens": "number" }).array(),
  'systemPromptSections?': type({ "name": "string", "tokens": "number" }).array(),
  'agents': type({ "agentType": "string", "source": "string", "tokens": "number" }).array(),
  'slashCommands?': { "totalCommands": "number", "includedCommands": "number", "tokens": "number" },
  'skills?': { "totalSkills": "number", "includedSkills": "number", "tokens": "number", "skillFrontmatter": type({ "name": "string", "source": "string", "tokens": "number" }).array() },
  'autoCompactThreshold?': 'number',
  'isAutoCompactEnabled': 'boolean',
  'messageBreakdown?': { "toolCallTokens": "number", "toolResultTokens": "number", "attachmentTokens": "number", "assistantMessageTokens": "number", "userMessageTokens": "number", "redirectedContextTokens": "number", "unattributedTokens": "number", "toolCallsByType": type({ "name": "string", "callTokens": "number", "resultTokens": "number" }).array(), "attachmentsByType": type({ "name": "string", "tokens": "number" }).array() },
  'apiUsage': type({ "input_tokens": "number", "output_tokens": "number", "cache_creation_input_tokens": "number", "cache_read_input_tokens": "number" }).or("null"),
});
/* @__PURE__ */ export const Anon7555ade991282d8d = type({
  'path': 'string',
  'size': 'number',
  'isImage': 'boolean',
  'file_uuid?': 'string',
});
/* @__PURE__ */ export const Anon764972185753c5ae = type({
  'riskLevel': '\'LOW\' | \'MEDIUM\' | \'HIGH\'',
  'explanation': 'string',
  'reasoning': 'string',
  'risk': 'string',
});
/* @__PURE__ */ export const Anon768a4871a621c627 = type({
  'toolCallTokens': 'number',
  'toolResultTokens': 'number',
  'attachmentTokens': 'number',
  'assistantMessageTokens': 'number',
  'userMessageTokens': 'number',
  'redirectedContextTokens': 'number',
  'unattributedTokens': 'number',
  'toolCallsByType': type({ "name": "string", "callTokens": "number", "resultTokens": "number" }).array(),
  'attachmentsByType': type({ "name": "string", "tokens": "number" }).array(),
});
/* @__PURE__ */ export const Anon76f09d8e7ff6a7af = type("'worker' | 'leader'");
/* @__PURE__ */ export const Anon771ee6b071a6eb71 = type("'LOW' | 'MEDIUM' | 'HIGH'");
/* @__PURE__ */ export const Anon7747a1b91bf2c520 = type({
  'operation': '\'goToDefinition\' | \'findReferences\' | \'hover\' | \'documentSymbol\' | \'workspaceSymbol\' | \'goToImplementation\' | \'prepareCallHierarchy\' | \'incomingCalls\' | \'outgoingCalls\'',
  'result': 'string',
  'filePath': 'string',
  'resultCount?': "unknown",
  'fileCount?': "unknown",
});
/* @__PURE__ */ export const Anon7833c156bb44890c = type("unknown");
/* @__PURE__ */ export const Anon78772256fed67e27 = type({
  'uuid': 'string',
  'checksum': 'string',
  'settings': 'Record<string, unknown>',
});
/* @__PURE__ */ export const Anon78c94413aaeca991 = type("'user' | 'project' | 'local'");
/* @__PURE__ */ export const Anon79b8313ff967e8d5 = type({
  'applyPath?': 'string',
  'argv0?': 'string',
});
/* @__PURE__ */ export const Anon79c04e919784e42c = type("'fresh' | 'head'");
/* @__PURE__ */ export const Anon7a9e3e6b91afd7c7 = type({
  'hook_event_name': '\'FileChanged\'',
  'file_path': 'string',
  'event': '\'change\' | \'add\' | \'unlink\'',
});
/* @__PURE__ */ export const Anon7b280997c0b38c16 = type({
  'uri': 'string',
  'name': 'string',
  'mimeType?': 'string',
  'description?': 'string',
  'server': 'string',
});
/* @__PURE__ */ export const Anon9e0a37027d082b11 = type("'user_temporary' | 'user_permanent' | 'user_reject'");
/* @__PURE__ */ export const Anon7b8f960f657c4028 = type({
  'behavior': '\'allow\'',
  'updatedInput?': 'Record<string, unknown>',
  'updatedPermissions?': AddRulesMessage.array(),
  'toolUseID?': 'string',
  'decisionClassification?': Anon9e0a37027d082b11,
});
/* @__PURE__ */ export const Anon7c6aba71e1a9567a = type({
  'label': 'string',
  'description': 'string',
  'preview?': 'string',
});
/* @__PURE__ */ export const Anon7ccfadcc38da767f = type("unknown");
/* @__PURE__ */ export const Anon7ccfadcc38da767f2 = type("unknown");
/* @__PURE__ */ export const Anon7ccfadcc38da767f3 = type("unknown");
/* @__PURE__ */ export const Anon7ccfadcc38da767f4 = type("unknown");
/* @__PURE__ */ export const Anon7ccfadcc38da767f5 = type("unknown");
/* @__PURE__ */ export const Anon7ccfadcc38da767f6 = type("unknown");
/* @__PURE__ */ export const Anon7ccfadcc38da767f7 = type("unknown");
/* @__PURE__ */ export const Anon7ccfadcc38da767f8 = type("unknown");
/* @__PURE__ */ export const Anon7ccfadcc38da767f9 = type("unknown");
/* @__PURE__ */ export const AnonFa73253d53a27ad5 = type({
  'id': 'string',
  'max_input_tokens?': 'number',
  'max_tokens?': 'number',
});
/* @__PURE__ */ export const Anon7ced40f9ceaa2043 = type({
  'models': AnonFa73253d53a27ad5.array(),
  'timestamp': 'number',
});
/* @__PURE__ */ export const Anon7d6ffb06c9800fc0 = type({
  'name': 'string',
  'tokens': 'number',
  'isLoaded': 'boolean',
});
/* @__PURE__ */ export const Anon7d705765683e3946 = type({
  'input_tokens': 'number',
  'output_tokens': 'number',
  'cache_creation_input_tokens': 'number',
  'cache_read_input_tokens': 'number',
});
/* @__PURE__ */ export const Anon7d89b9aec6325430 = type({
  'access_token': 'string',
  'expires_in': 'number',
  'refresh_token?': 'string',
});
/* @__PURE__ */ export const Anon7d8d6ab541981641 = type("'pending' | 'in_progress' | 'completed'");
/* @__PURE__ */ export const Anon7e3b855e4669d932 = type({
  'tool_use_id': 'string',
  'content?': "unknown",
});
/* @__PURE__ */ export const Anon7e45b044bc052ddd = type({
  'mcpServers?': "unknown",
});
/* @__PURE__ */ export const Anon7e5055cdc3d1de45 = type({
  'number': 'number',
  'html_url': 'string',
  'draft': 'boolean',
});
/* @__PURE__ */ export const Anon7e908cc7a93719c1 = type({
  'model': 'string',
  'effort': '\'low\' | \'medium\' | \'high\' | \'xhigh\' | \'max\' | null',
});
/* @__PURE__ */ export const Anon7f17a340fe6cc748 = type({
  'action': '\'keep\' | \'remove\'',
  'discard_changes?': 'boolean',
});
/* @__PURE__ */ export const Anon7f91541612eefb1b = type({
  'enable_slash_command': 'boolean',
});
/* @__PURE__ */ export const Anon809f8007ab34478f = type({
  'input_tokens': 'number',
  'output_tokens': 'number',
  'prompt_cache_write_tokens': 'number',
  'prompt_cache_read_tokens': 'number',
  'web_search_requests?': 'number | null',
});
/* @__PURE__ */ export const Anon80dfef43f23e05e9 = type({
  'hookEventName': '\'FileChanged\'',
  'watchPaths?': "unknown",
});
/* @__PURE__ */ export const Anon8118a134cfa70ce7 = type({
  'operation': '\'goToImplementation\'',
  'filePath': 'string',
  'line?': "unknown",
  'character?': "unknown",
});
/* @__PURE__ */ export const Anon819317ceb42ca13f = type("'daemon' | 'peer'");
/* @__PURE__ */ export const Anon8195854a0d3e760a = type("unknown");
/* @__PURE__ */ export const Anon81aa2ad430cfb719 = type({
  'hookEventName': '\'SessionStart\'',
  'additionalContext?': 'string',
  'initialUserMessage?': 'string',
  'watchPaths?': "unknown",
});
/* @__PURE__ */ export const Anon8309e5f83e714308 = type("'local' | 'user' | 'project' | 'dynamic' | 'enterprise' | 'claudeai' | 'managed' | 'agent'");
/* @__PURE__ */ export const Anon834334cbcdef420f = type("unknown");
/* @__PURE__ */ export const Anon836a421e28b66929 = type("unknown");
/* @__PURE__ */ export const AnonF93ec69ad889f6412 = type("'allow' | 'deny' | 'ask' | 'defer'");
/* @__PURE__ */ export const Anon838960cc790ced162 = type({
  'hookEventName': '\'PreToolUse\'',
  'permissionDecision?': AnonF93ec69ad889f6412,
  'permissionDecisionReason?': 'string',
  'updatedInput?': 'Record<string, unknown>',
  'additionalContext?': 'string',
});
/* @__PURE__ */ export const Anon83b5d3b8c77c7bad = type({
  'name': 'string',
  'email': 'string',
  'plan': 'string',
  'interests': 'string[]',
  'demo_requested': 'boolean',
});
/* @__PURE__ */ export const Anon84209d6090a7e3f4 = type({
  'command': 'string',
  'timeout?': "unknown",
  'description?': 'string',
  'run_in_background?': "unknown",
  'dangerouslyDisableSandbox?': "unknown",
});
/* @__PURE__ */ export const Anon84ea4cf4701d3433 = type("'worktree'");
/* @__PURE__ */ export const Anon85b8ecd6cf928b0b = type({
  '$schema?': 'string',
});
/* @__PURE__ */ export const Anon862753631acf541f = type({
  'enabled': 'boolean',
  'timeoutMs?': "unknown",
  'throttleMs?': "unknown",
  'summaryLineThreshold?': "unknown",
});
/* @__PURE__ */ export const Anon8632c448bac14587 = type("'config_off' | 'user_present' | 'no_transport'");
/* @__PURE__ */ export const Anon866dab148292807d = type({
  'version': 'string',
  'installedAt': 'string',
  'lastUpdated?': 'string',
  'installPath': 'string',
  'gitCommitSha?': 'string',
  'resolvedVersion?': 'string',
  'auto?': 'boolean',
});
/* @__PURE__ */ export const Anon8725f277a61e3e71 = type({
  'behavior': '\'completed\' | \'cancelled\'',
  'result?': 'unknown',
});
/* @__PURE__ */ export const Anon8741dc4ed2af4a43 = type("unknown");
/* @__PURE__ */ export const Anon877b27a89b35ea09 = type({
  'hookEventName': '\'UserPromptSubmit\'',
  'additionalContext?': 'string',
  'sessionTitle?': "unknown",
  'suppressOriginalPrompt?': "unknown",
});
/* @__PURE__ */ export const Anon87853e03408cd7f3 = type({
  'trigger': '\'manual\' | \'auto\'',
  'pre_tokens': 'number',
  'post_tokens?': 'number',
  'duration_ms?': 'number',
  'preserved_segment?': "unknown",
});
/* @__PURE__ */ export const Anon8799a9d23e82b50b = type({
  'pid': 'number',
  'procStart?': 'string',
  'sessionId': 'string',
  'rendezvousSock': 'string',
  'ptySock?': 'string',
  'messagingSock?': 'string',
  'cliVersion?': 'string',
  'startedAt': 'number',
  'attempt': 'number',
  'cwd': 'string',
  'worktreePath?': 'string',
  'dispatch': AnonD73f663a602579a5,
  'pendingRespawn?': '\'upgrade\'',
  'decModes?': 'number[]',
});
/* @__PURE__ */ export const Anon87cbe0ce1daa18ce = type("unknown");
/* @__PURE__ */ export const Anon87f234d6cc6758f4 = type({
  'name': 'string',
  'command': 'string',
  'description': 'string',
  'when?': "unknown",
});
/* @__PURE__ */ export const Anon8845c818dc541e76 = type({
  'name': 'string',
  'path': 'string',
  'source?': 'string',
});
/* @__PURE__ */ export const Anon884c167bb35596f3 = type("unknown");
/* @__PURE__ */ export const Anon8891d3015f2e111b = type({
  'monitors?': "unknown",
});
/* @__PURE__ */ export const Anon88ec83abfde38ed3 = type("'form' | 'url'");
/* @__PURE__ */ export const Anon88ec83abfde38ed32 = type("'form' | 'url'");
/* @__PURE__ */ export const Anon88ec83abfde38ed33 = type("'form' | 'url'");
/* @__PURE__ */ export const Anon892124a7808b7a4e = type({
  'model': 'string',
  'name': 'string',
  'description': 'string',
});
/* @__PURE__ */ export const Anon892bd913dd3f7874 = type({
  'pluginRoot?': 'string',
  'version?': 'string',
  'description?': 'string',
});
/* @__PURE__ */ export const Anon89adb7b851d15bca = type("'connected' | 'failed' | 'needs-auth' | 'pending' | 'disabled'");
/* @__PURE__ */ export const Anon89e78eab64ccbb3b = type({
  'durationMs': 'number',
  'numFiles': 'number',
  'filenames': 'string[]',
  'truncated': 'boolean',
});
/* @__PURE__ */ export const Anon8a56a47da300a350 = type("unknown");
/* @__PURE__ */ export const Anon8a6f0af439aee3ae = type({
  'message': 'string',
  'pushSent?': 'boolean',
  'localSent?': 'boolean',
  'disabledReason?': '\'config_off\' | \'user_present\' | \'no_transport\'',
  'idleSec?': 'number',
  'hasFocus?': 'boolean',
  'sentAt?': 'string',
});
/* @__PURE__ */ export const Anon8a7b6f28f2ff492e = type({
  'hook_event_name': '\'SubagentStart\'',
  'agent_id': 'string',
  'agent_type': 'string',
});
/* @__PURE__ */ export const Anon8a83f78c2bc2d17a = type({
  'start': { "line": "number", "character": "number" },
  'end': { "line": "number", "character": "number" },
});
/* @__PURE__ */ export const Anon8b847075704cfb82 = type({
  'code': 'string',
  'result': 'unknown',
  'stdout': 'string',
  'stderr': 'string',
  'error?': 'string',
  'registeredTools?': 'string[]',
  'images?': type({ "base64": "string", "mediaType": "string" }).array(),
  'documents?': type({ "base64": "string" }).array(),
});
/* @__PURE__ */ export const Anon8b87e81e29824a08 = type({
  'results': 'string',
});
/* @__PURE__ */ export const Anon8d54153f78bb403e = type({
  'mcpServers': Anon95859e43e360cf2e.array(),
});
/* @__PURE__ */ export const Anon8dee96c0b7c01007 = type({});
/* @__PURE__ */ export const Anon8ed37be09b3c3c57 = type("'goToDefinition' | 'findReferences' | 'hover' | 'documentSymbol' | 'workspaceSymbol' | 'goToImplementation' | 'prepareCallHierarchy' | 'incomingCalls' | 'outgoingCalls'");
/* @__PURE__ */ export const Anon8ee2aeecd8a42fb8 = type({
  'channels?': "unknown",
});
/* @__PURE__ */ export const Anon8ee7a9eeb77cc5b1 = type("'first-wins' | 'merge'");
/* @__PURE__ */ export const Anon8f31f1da642e880f = type({
  'device_code': 'string',
  'user_code': 'string',
  'verification_uri': 'string',
  'verification_uri_complete?': 'string',
  'expires_in': 'number',
  'interval?': 'number',
});
/* @__PURE__ */ export const Anon9046604417bd1c33 = type({
  'scope': Anon2b4806aacaa71436,
  'projectPath?': 'string',
  'installPath': 'string',
  'version?': 'string',
  'installedAt?': 'string',
  'lastUpdated?': 'string',
  'gitCommitSha?': 'string',
  'resolvedVersion?': 'string',
  'auto?': 'boolean',
});
/* @__PURE__ */ export const Anon907c25b0ca75d586 = type({
  'cron': 'string',
  'prompt': 'string',
  'recurring?': "unknown",
  'durable?': "unknown",
});
/* @__PURE__ */ export const Anon90b5f298a41f17db = type({
  'client_data?': 'Record<string, unknown> | null',
  'additional_model_options?': "unknown",
  'additional_model_costs?': "unknown",
  'oauth_account?': "unknown",
});
/* @__PURE__ */ export const Anon91ec8c717506ae0a = type({
  'symlinkDirectories?': 'string[]',
  'sparsePaths?': 'string[]',
  'baseRef?': '\'fresh\' | \'head\'',
});
/* @__PURE__ */ export const Anon924bbdf2b48ed68e = type({
  'hook_event_name': '\'WorktreeCreate\'',
  'name': 'string',
});
/* @__PURE__ */ export const Anon925432f2d72a8619 = type({
  'hook_event_name': '\'SubagentStop\'',
  'stop_hook_active': 'boolean',
  'agent_id': 'string',
  'agent_transcript_path': 'string',
  'agent_type': 'string',
  'last_assistant_message?': 'string',
});
/* @__PURE__ */ export const Anon9265460a13783a98 = type("unknown");
/* @__PURE__ */ export const Anon929096e3ce7c6143 = type({
  'pid': 'number',
  'sessionId': 'string',
  'cwd?': 'string',
  'startedAt': 'number',
  'version?': 'string',
  'kind': '\'interactive\' | \'bg\' | \'daemon\' | \'daemon-worker\'',
});
/* @__PURE__ */ export const Anon92f30a573367b790 = type({
  'ephemeral_1h_input_tokens': 'number',
  'ephemeral_5m_input_tokens': 'number',
});
/* @__PURE__ */ export const Anon93d41bbe0914a5cc = type("unknown");
/* @__PURE__ */ export const Anon9664e455646904a4 = type({
  'filePath': 'string',
  'originalSize': 'number',
  'count': 'number',
  'outputDir': 'string',
});
/* @__PURE__ */ export const Anon968358201351c581 = type({
  'query': 'string',
  'allowed_domains?': 'string[]',
  'blocked_domains?': 'string[]',
});
/* @__PURE__ */ export const Anon9699254317c1c13b = type("unknown");
/* @__PURE__ */ export const Anon96d04b3a80336948 = type("'claudeai' | 'console'");
/* @__PURE__ */ export const Anon97ae7cbeb485a5e9 = type({
  'stdout': 'string',
  'stderr': 'string',
  'interrupted': 'boolean',
  'returnCodeInterpretation?': 'string',
  'isImage?': 'boolean',
  'persistedOutputPath?': 'string',
  'persistedOutputSize?': 'number',
  'backgroundTaskId?': 'string',
  'backgroundedByUser?': 'boolean',
  'assistantAutoBackgrounded?': 'boolean',
});
/* @__PURE__ */ export const Anon97b4af2ba72a1f01 = type("'celsius' | 'fahrenheit'");
/* @__PURE__ */ export const Anon97e37b8b35582bc7 = type({
  'baseUrl': 'string',
  'fetchedAt': 'number',
  'models': Anon1b1cb3ede23e8d05.array(),
});
/* @__PURE__ */ export const Anon981ea30cfb7366cb = type({
  'to': 'string',
  'summary?': 'string',
  'message?': "unknown",
});
/* @__PURE__ */ export const Anon991c7b2cb2021e46 = type({
  'tool_name': 'string',
  'tool_input': 'unknown',
  'tool_use_id': 'string',
  'tool_response?': 'unknown',
});
/* @__PURE__ */ export const Anon9950d689a05aea85 = type({
  'contents': type({ "uri": "string", "mimeType?": "string", "text?": "string", "blobSavedTo?": "string" }).array(),
});
/* @__PURE__ */ export const Anon998847ab90df6cf1 = type("'shell' | 'slash' | 'fleet' | 'spare' | 'respawn'");
/* @__PURE__ */ export const Anon9a4361590e486960 = type("unknown");
/* @__PURE__ */ export const Anon9a4e76f174201999 = type({
  'file_uuid': 'string',
});
/* @__PURE__ */ export const Anon9a50038541ead6a0 = type({
  'hook_event_name': '\'ConfigChange\'',
  'source?': "unknown",
  'file_path?': 'string',
});
/* @__PURE__ */ export const Anon9a8d70cac1f738a5 = type({
  'proto?': "unknown",
  'op': '\'nudge\'',
});
/* @__PURE__ */ export const Anon9a9ba1bd1d038165 = type({
  'hook_event_name': '\'TeammateIdle\'',
  'teammate_name': 'string',
  'team_name': 'string',
});
/* @__PURE__ */ export const Anon9b4276cce03738e4 = type("unknown");
/* @__PURE__ */ export const Anon9badfdd3881e6ec3 = type("unknown");
/* @__PURE__ */ export const Anon9c3ce6942efe5897 = type({
  'cancelled': 'boolean',
});
/* @__PURE__ */ export const Anon9c47002ba95f6266 = type({
  'path': 'string',
  'ownershipToken': 'string',
});
/* @__PURE__ */ export const Anon9c6eaa5cb9c3b807 = type("unknown");
/* @__PURE__ */ export const Anon9c77c0ac2ea53cb5 = type("unknown");
/* @__PURE__ */ export const Anon9eec036fc40b2145 = type({
  'name': 'string',
  'status': 'string',
});
/* @__PURE__ */ export const Anon9f0c34b67c691ca6 = type({
  'file_path': 'string',
  'content': 'string',
});
/* @__PURE__ */ export const Anon9f36a59b26ae9d70 = type({
  'experimental?': "unknown",
});
/* @__PURE__ */ export const Anon9f4779d797028ee3 = type("'init' | 'maintenance'");
/* @__PURE__ */ export const Anon9f48a19b19f324bb = type("'manual' | 'auto'");
/* @__PURE__ */ export const Anon9f48a19b19f324bb2 = type("'manual' | 'auto'");
/* @__PURE__ */ export const Anon9f48a19b19f324bb3 = type("'manual' | 'auto'");
/* @__PURE__ */ export const Anon9f6903e793abb552 = type({
  'mode': '\'check\' | \'update\' | \'create\' | \'delete\'',
  'short_code?': 'string',
});
/* @__PURE__ */ export const AnonE3b66872a09a7406 = type({
  'file?': 'string',
  'path': 'string',
  'message': 'string',
});
/* @__PURE__ */ export const AnonA031b9bc23a96414 = type({
  'effective': 'Record<string, unknown>',
  'sources': type({ "source": "'userSettings' | 'projectSettings' | 'localSettings' | 'flagSettings' | 'policySettings'", "settings": "Record<string, unknown>" }).array(),
  'applied?': { "model": "string", "effort": "'low' | 'medium' | 'high' | 'xhigh' | 'max' | null" },
  'errors?': AnonE3b66872a09a7406.array(),
});
/* @__PURE__ */ export const AnonA07fa418900ae98f = Anon6f5d7ed95df79316;
/* @__PURE__ */ export const AnonA0d5f87bee72916f = type("'transient' | 'ask'");
/* @__PURE__ */ export const AnonA1d59957eff7582d = type({
  'path': 'string',
  'type': 'string',
  'tokens': 'number',
});
/* @__PURE__ */ export const AnonA1d71ff4f5f34de4 = type({
  'request_id': 'string',
  'behavior': '\'allow\' | \'deny\'',
});
/* @__PURE__ */ export const AnonA22670dcc65a2d15 = type({
  'id': 'string',
  'name': 'string',
  'sshHost': 'string',
  'sshPort?': 'number',
  'sshIdentityFile?': 'string',
  'startDirectory?': 'string',
});
/* @__PURE__ */ export const AnonA22beaf05fc76afb = type("'latest' | 'stable' | 'rc'");
/* @__PURE__ */ export const AnonA2c6a7821fe7ffde = type("unknown");
/* @__PURE__ */ export const AnonA43e72a6b0f5ed46 = type("'error_during_execution' | 'error_max_turns' | 'error_max_budget_usd' | 'error_max_structured_output_retries'");
/* @__PURE__ */ export const AnonA460554daf28033a = type({
  'hook_event_name': '\'PostToolBatch\'',
  'tool_calls': Anon991c7b2cb2021e46.array(),
});
/* @__PURE__ */ export const AnonA473735f9f4a87d2 = type("'completed' | 'cancelled'");
/* @__PURE__ */ export const AnonA48dc4689b55814d = type({
  'error_code': '\'team_memory_too_many_entries\'',
  'max_entries?': "unknown",
  'received_entries?': "unknown",
});
/* @__PURE__ */ export const AnonA4bd9bb69a1a32a3 = type("unknown");
/* @__PURE__ */ export const AnonA4ed354c3f04e8eb = type({
  'allow?': "unknown",
  'deny?': "unknown",
  'ask?': "unknown",
  'defaultMode?': "unknown",
  'disableBypassPermissionsMode?': '\'disable\'',
  'additionalDirectories?': 'string[]',
});
/* @__PURE__ */ export const AnonA517f9f10bc8f237 = type({
  'systemHash': 'number',
  'toolsHash': 'number',
  'cacheControlHash': 'number',
  'toolNames': 'string[]',
  'perToolHashes': 'Record<string, number>',
  'perBlockHashes': 'number[]',
  'perBlockLengths': 'number[]',
  'systemCharCount': 'number',
  'model': 'string',
  'fastMode': 'boolean',
  'globalCacheStrategy': 'string',
  'betas': 'string[]',
  'autoModeActive': 'boolean',
  'isUsingOverage': 'boolean',
  'is1hCacheTTL': 'boolean',
  'queryDepth?': 'number',
  'cachedMCEnabled': 'boolean',
  'cacheDiagnosis': 'boolean',
  'effortValue': 'string',
  'extraBodyHash': 'number',
  'callCount': 'number',
  'prevCacheReadTokens': 'number | null',
  'cacheDeletionsPending': 'boolean',
  'messageHashes': 'number[]',
});
/* @__PURE__ */ export const AnonA60bf646de489df9 = type({
  'proto?': "unknown",
  'op': '\'ping\'',
});
/* @__PURE__ */ export const AnonA6d3baaba3999053 = type("'always_allow' | 'always_ask' | 'always_deny'");
/* @__PURE__ */ export const AnonA745220994894c98 = type("'goToDefinition' | 'findReferences' | 'hover' | 'documentSymbol' | 'workspaceSymbol' | 'goToImplementation' | 'prepareCallHierarchy' | 'incomingCalls' | 'outgoingCalls'");
/* @__PURE__ */ export const AnonA78c1ad00624e9a6 = type({
  'totalSkills': 'number',
  'includedSkills': 'number',
  'tokens': 'number',
  'skillFrontmatter': type({ "name": "string", "source": "string", "tokens": "number" }).array(),
});
/* @__PURE__ */ export const AnonA87dc31eae5f9160 = type({
  'version': 'string',
  'buildTime?': 'string',
});
/* @__PURE__ */ export const AnonA88535d50dd03a5d = type({
  'agents?': "unknown",
});
/* @__PURE__ */ export const AnonA8e029e9ab6e1d6c = type({
  'name': 'string',
  'tokens': 'number',
});
/* @__PURE__ */ export const AnonA8e029e9ab6e1d6c2 = type({
  'name': 'string',
  'tokens': 'number',
});
/* @__PURE__ */ export const AnonA8e029e9ab6e1d6c3 = type({
  'name': 'string',
  'tokens': 'number',
});
/* @__PURE__ */ export const AnonA904a7140d4e3f19 = type("'modified' | 'added'");
/* @__PURE__ */ export const AnonA9494256fdd94b28 = type({
  'source?': 'string',
});
/* @__PURE__ */ export const AnonAa19a271ab6ca0d0 = type("unknown");
/* @__PURE__ */ export const AnonAa7dfda9467c113e = type("'select' | 'synthesize'");
/* @__PURE__ */ export const AnonAb800c60d329e0ae = type({
  'todos?': "unknown",
});
/* @__PURE__ */ export const AnonAbdaf197dd063dc7 = type({
  'email?': 'string',
  'organization?': 'string',
  'subscriptionType?': 'string',
  'tokenSource?': 'string',
  'apiKeySource?': 'string',
  'apiProvider?': '\'firstParty\' | \'bedrock\' | \'vertex\' | \'foundry\' | \'anthropicAws\' | \'mantle\' | \'gateway\'',
});
/* @__PURE__ */ export const AnonAc857dd94c9d6208 = type("unknown");
/* @__PURE__ */ export const AnonAd0a953e3161e739 = type({
  'line': 'number',
  'character': 'number',
});
/* @__PURE__ */ export const AnonAd0a953e3161e7392 = type({
  'line': 'number',
  'character': 'number',
});
/* @__PURE__ */ export const AnonAd576eff7f9f8a24 = type("'user' | 'auto'");
/* @__PURE__ */ export const AnonAd9ccd154f764a42 = type("'success' | 'failed'");
/* @__PURE__ */ export const AnonAe26d2d801e78561 = type({
  'name': 'string',
  'serverName': 'string',
  'tokens': 'number',
  'isLoaded?': 'boolean',
});
/* @__PURE__ */ export const AnonAe38f96eaf1695ad = type({
  'proto?': "unknown",
  'supervisorPid': 'number',
  'updatedAt': 'number',
  'workers': { "[string]": Anon8799a9d23e82b50b },
});
/* @__PURE__ */ export const AnonAe58b8bfd0cc6529 = type({
  'ok': 'boolean',
  'reason?': "unknown",
});
/* @__PURE__ */ export const AnonAe66b503fc34cd6c = type({
  'name': 'string',
  'source': 'string',
  'tokens': 'number',
});
/* @__PURE__ */ export const AnonAe875b5d1adc5b72 = type("unknown");
/* @__PURE__ */ export const AnonAf1279aab5a04220 = type({
  'source': '\'url\'',
  'url': 'string',
  'ref?': 'string',
  'sha?': "unknown",
});
/* @__PURE__ */ export const AnonAf394ce155c1f3b8 = type({
  'id': 'string',
  'href': 'string',
  'kind?': '\'pr\' | \'frame\'',
});
/* @__PURE__ */ export const AnonAf60f1a0bf030375 = type({
  'sessionId': 'string',
  'pid': 'number',
  'procStart?': 'string',
  'acquiredAt': 'number',
});
/* @__PURE__ */ export const AnonAf77d54ff485a431 = type("unknown");
/* @__PURE__ */ export const AnonAf797e0f88a2de2e = type("unknown");
/* @__PURE__ */ export const AnonAf797e0f88a2de2e2 = type("unknown");
/* @__PURE__ */ export const AnonAf7ed41466688cbe = type({
  'denyRead?': "unknown",
  'allowRead?': "unknown",
  'allowWrite?': "unknown",
  'denyWrite?': "unknown",
  'allowGitConfig?': 'boolean',
});
/* @__PURE__ */ export const AnonAfe7f304b48cfb35 = type({
  'hook_event_name': '\'UserPromptExpansion\'',
  'expansion_type': '\'slash_command\' | \'mcp_prompt\'',
  'command_name': 'string',
  'command_args': 'string',
  'command_source?': 'string',
  'prompt': 'string',
});
/* @__PURE__ */ export const AnonB077d2e395247890 = type({
  'mode': '\'resume\'',
  'sessionId': 'string',
  'fork': 'boolean',
  'flagArgs': 'string[]',
});
/* @__PURE__ */ export const AnonB0e15622ef0ea51c = type("unknown");
/* @__PURE__ */ export const AnonB14eca7e8eca3825 = type("unknown");
/* @__PURE__ */ export const AnonB1e0fa5bacf08539 = type({
  'action': '\'proceed\' | \'confirm\' | \'blocked\'',
  'billing_note?': 'string | null',
  'confirm?': type({ "title?": "string", "body": "string" }).or("null"),
  'blocked?': type({ "message": "string", "action_url": "string | null", "reason?": "string" }).or("null"),
});
/* @__PURE__ */ export const AnonB25ae6a2bc0a45d9 = type({
  '$schema?': 'string',
  '$docs?': 'string',
  'bindings': Anon3c852a61b8d06040.array(),
});
/* @__PURE__ */ export const AnonB39b4d370f355ec4 = type({
  'base64': 'string',
  'type?': "unknown",
  'originalSize': 'number',
  'dimensions?': { "originalWidth?": "number", "originalHeight?": "number", "displayWidth?": "number", "displayHeight?": "number" },
});
/* @__PURE__ */ export const AnonB42f2d0e9ab0c2ca = type({
  'source': '\'git-subdir\'',
  'url': 'string',
  'path': 'string',
  'ref?': 'string',
  'sha?': "unknown",
});
/* @__PURE__ */ export const AnonB44597eb47d19fae2 = type({
  'hookEventName': '\'PermissionRequest\'',
  'decision': type({ "behavior": "'allow'", "updatedInput?": "Record<string, unknown>", "updatedPermissions?": AddRulesMessage3.array() }).or({ "behavior": "'deny'", "message?": "string", "interrupt?": "boolean" }),
});
/* @__PURE__ */ export const AnonB485e702cccaadbd = type({
  'hookEventName': '\'PostToolUse\'',
  'additionalContext?': 'string',
  'updatedToolOutput?': "unknown",
  'updatedMCPToolOutput?': "unknown",
});
/* @__PURE__ */ export const AnonB48b26d66c36b27d = type({
  'accessToken': 'string | null',
});
/* @__PURE__ */ export const AnonB4ba309e59cd534e = type({
  'session_id': 'string',
  'ws_url': 'string',
  'work_dir?': 'string',
});
/* @__PURE__ */ export const AnonB58b83bf7352a8fd = type({
  'name': 'string',
  'owner': { "login": "string" },
});
/* @__PURE__ */ export const AnonB5cf8b2792f67b65 = type({
  'excludeDefault?': 'boolean',
  'tips': 'string[]',
});
/* @__PURE__ */ export const AnonB6137e26534b275b = type("'string' | 'number' | 'boolean' | 'directory' | 'file'");
/* @__PURE__ */ export const AnonB6849d00f7d713c3 = type("unknown");
/* @__PURE__ */ export const AnonEa11f8dcd96cf80d = type({
  'name?': "unknown",
  'source': Anon9c77c0ac2ea53cb5,
  'description?': 'string',
  'version?': 'string',
  'strict?': 'boolean',
});
/* @__PURE__ */ export const AnonB75f2226f390cc55 = type({
  'source': '\'settings\'',
  'name?': "unknown",
  'plugins': AnonEa11f8dcd96cf80d.array(),
  'owner?': Anon1e4a490ce15e2b7b,
});
/* @__PURE__ */ export const AnonB80643c32f2e085d = type({
  'hook_event_name': '\'PostCompact\'',
  'trigger': '\'manual\' | \'auto\'',
  'compact_summary': 'string',
});
/* @__PURE__ */ export const AnonB82ce861e4e382cf = type("unknown");
/* @__PURE__ */ export const AnonB82ce861e4e382cf2 = type("unknown");
/* @__PURE__ */ export const AnonB89e60bebfe8976d = type({
  'poll_interval_ms_not_at_capacity': 'number',
  'poll_interval_ms_at_capacity?': "unknown",
  'non_exclusive_heartbeat_interval_ms': 'number',
  'multisession_poll_interval_ms_not_at_capacity': 'number',
  'multisession_poll_interval_ms_partial_capacity': 'number',
  'multisession_poll_interval_ms_at_capacity?': "unknown",
  'reclaim_older_than_ms': 'number',
  'session_keepalive_interval_v2_ms': 'number',
});
/* @__PURE__ */ export const AnonB9caf80f4ed71130 = type({
  'socketPath': 'string',
  'domains?': "unknown",
});
/* @__PURE__ */ export const AnonB9dade04586b5dbb = type({
  'method': '\'notifications/claude/channel\'',
  'params': { "content": "string", "meta?": "Record<string, string>" },
});
/* @__PURE__ */ export const AnonBa0d4a24a74fe7f9 = type({
  'state?': 'string | null',
  'detail?': 'string | null',
  'tempo?': 'string | null',
  'needs?': 'string | null',
  'output?': 'Record<string, unknown> | null',
});
/* @__PURE__ */ export const AnonBabe0d5f53455e07 = type({
  'type': '\'string\' | \'number\' | \'boolean\' | \'directory\' | \'file\'',
  'title': 'string',
  'description': 'string',
  'required?': 'boolean',
  'default?': 'string | number | boolean | string[]',
  'multiple?': 'boolean',
  'sensitive?': 'boolean',
  'min?': 'number',
  'max?': 'number',
});
/* @__PURE__ */ export const AnonBb3066b35bc298eb = type("'SIGTERM' | 'SIGKILL'");
/* @__PURE__ */ export const AnonBb9c1e3357adb8f1 = type({
  'title': 'string',
  'branch': 'string',
});
/* @__PURE__ */ export const AnonBc401895554907f0 = type("'standard' | 'priority' | 'batch'");
/* @__PURE__ */ export const AnonBc491226028190d8 = type({
  'subject': 'string',
  'description': 'string',
  'activeForm?': 'string',
  'metadata?': 'Record<string, unknown>',
});
/* @__PURE__ */ export const AnonBcb6856c29ca59af = type("'bash' | 'powershell'");
/* @__PURE__ */ export const AnonBd03fe7dda364b50 = type({
  'hookEventName': '\'ElicitationResult\'',
  'action?': '\'accept\' | \'decline\' | \'cancel\'',
  'content?': 'Record<string, unknown>',
});
/* @__PURE__ */ export const AnonBda61de6c4544052 = type({
  'experimental?': 'Record<string, unknown>',
});
/* @__PURE__ */ export const AnonBde3cff081c24051 = type("'default' | 'fullscreen'");
/* @__PURE__ */ export const AnonBde503265cc9759e = type("'cli' | 'ccd' | 'ccw' | 'sdk'");
/* @__PURE__ */ export const AnonBdef7051e20e4082 = type({
  'source': '\'pathPattern\'',
  'pathPattern': 'string',
});
/* @__PURE__ */ export const AnonBe42f02f0e4d22bc = type("unknown");
/* @__PURE__ */ export const AnonBe5512dfc9ff488f = type({
  'hook_event_name': '\'CwdChanged\'',
  'old_cwd': 'string',
  'new_cwd': 'string',
});
/* @__PURE__ */ export const AnonBec251405e42d33f = type({
  'level': 'string',
});
/* @__PURE__ */ export const AnonBec9a4f6c3f37d01 = type("unknown");
/* @__PURE__ */ export const AnonBf10f145c448d3a4 = type("'pending' | 'approved' | 'rejected'");
/* @__PURE__ */ export const AnonBf20fe144b3c1b2c = type({
  'hookEventName': '\'Elicitation\'',
  'action?': '\'accept\' | \'decline\' | \'cancel\'',
  'content?': 'Record<string, unknown>',
});
/* @__PURE__ */ export const AnonBf57fe7458652c92 = type({
  'filePath': 'string',
  'cells': 'unknown[]',
});
/* @__PURE__ */ export const AnonBf6731c96a51632d = type({
  'userConfig?': "unknown",
});
/* @__PURE__ */ export const AnonBf752e65f4f656fe = type({
  'hook_event_name': '\'StopFailure\'',
  'error': Anon17a7e6c7301ae98c,
  'error_details?': 'string',
  'last_assistant_message?': 'string',
});
/* @__PURE__ */ export const AnonBfbc654b4a1ccbf0 = type("unknown");
/* @__PURE__ */ export const AnonBfbc654b4a1ccbf02 = type("unknown");
/* @__PURE__ */ export const AnonBfd661995bb3b199 = type("'disable'");
/* @__PURE__ */ export const AnonC0a29b1eca416d8b = type("'low' | 'medium' | 'high' | 'xhigh'");
/* @__PURE__ */ export const AnonC10fefe14f6fb461 = type({
  'ready': 'boolean',
  'connected': 'string[]',
  'failed': 'string[]',
  'stillPending': 'string[]',
  'needsAuth': 'string[]',
  'disabled': 'string[]',
  'unknown': 'string[]',
});
/* @__PURE__ */ export const AnonC17690c95fca5da9 = type("unknown");
/* @__PURE__ */ export const AnonC1f5aa452dca844b = type({
  'hook_event_name': '\'PermissionDenied\'',
  'tool_name': 'string',
  'tool_input': 'unknown',
  'tool_use_id': 'string',
  'reason': 'string',
});
/* @__PURE__ */ export const AnonC212779e1b8673f7 = type({
  'name?': "unknown",
  'path?': 'string',
});
/* @__PURE__ */ export const AnonC26c0675c8addfc7 = type("unknown");
/* @__PURE__ */ export const AnonC26cec9e38b35034 = type({
  'readCount': 'number',
  'searchCount': 'number',
  'bashCount': 'number',
  'editFileCount': 'number',
  'linesAdded': 'number',
  'linesRemoved': 'number',
  'otherToolCount': 'number',
});
/* @__PURE__ */ export const AnonC36f8dac8897c092 = type({
  'callback_url': 'string',
});
/* @__PURE__ */ export const AnonC3920e6f662a77ed = type({
  'content': 'string',
  'meta?': 'Record<string, string>',
});
/* @__PURE__ */ export const AnonC3a97c9e91746d07 = type("'code' | 'markdown'");
/* @__PURE__ */ export const AnonC42f41f13b6b01e9 = type({
  'proto?': "unknown",
  'op': '\'lease\'',
  'client?': { "label": "string", "cwd": "string", "pid": "number" },
});
/* @__PURE__ */ export const AnonC4402a263accc3c5 = type("unknown");
/* @__PURE__ */ export const AnonC4c6b17dc4e10eec = type({
  'uri': 'string',
  'mimeType?': 'string',
  'text?': 'string',
  'blobSavedTo?': 'string',
});
/* @__PURE__ */ export const AnonC50b7fc44fbc8573 = type({
  'network?': "unknown",
  'filesystem?': "unknown",
  'ignoreViolations?': "unknown",
  'enableWeakerNestedSandbox?': 'boolean',
  'enableWeakerNetworkIsolation?': 'boolean',
  'ripgrep?': "unknown",
  'mandatoryDenySearchDepth?': "unknown",
  'allowPty?': 'boolean',
  'seccomp?': "unknown",
  'bwrapPath?': "unknown",
  'socatPath?': "unknown",
});
/* @__PURE__ */ export const AnonC58fd9a634665d50 = type("unknown");
/* @__PURE__ */ export const AnonC5b03b74a320c1d42 = type({
  'hookEventName': '\'SubagentStart\'',
  'additionalContext?': 'string',
});
/* @__PURE__ */ export const AnonC6262176f713486e = type({
  'mcpServers?': 'Record<string, Record<string, string | number | boolean | string[]>>',
  'options?': 'Record<string, string | number | boolean | string[]>',
});
/* @__PURE__ */ export const AnonC67725903dd8d123 = type({
  'name?': "unknown",
  'marketplace?': "unknown",
});
/* @__PURE__ */ export const AnonC6f077d8ac34f79d = type({
  'name': 'string',
  'callTokens': 'number',
  'resultTokens': 'number',
});
/* @__PURE__ */ export const AnonC71ecb84173852be = type("'positive' | 'negative'");
/* @__PURE__ */ export const AnonC74d7f346efa0154 = type({
  'source': '\'github\'',
  'repo': 'string',
  'ref?': 'string',
  'path?': 'string',
  'sparsePaths?': 'string[]',
});
/* @__PURE__ */ export const AnonC77a7067a4d5b676 = type({
  'reviewDecision': 'string | null',
});
/* @__PURE__ */ export const AnonC784c9580709dafb = type({
  'task?': "unknown",
});
/* @__PURE__ */ export const AnonC7e646798a39b70b = type({
  'from': 'string',
  'to': 'string',
});
/* @__PURE__ */ export const AnonC7ee2080bff30b83 = type("'inline' | 'fork'");
/* @__PURE__ */ export const AnonC81b977e337a57f4 = type("'append' | 'replace'");
/* @__PURE__ */ export const AnonC81c094b6abb4691 = type({
  'new_source': 'string',
  'cell_id?': 'string',
  'cell_type': '\'code\' | \'markdown\'',
  'language': 'string',
  'edit_mode': 'string',
  'error?': 'string',
  'notebook_path': 'string',
  'original_file': 'string',
  'updated_file': 'string',
});
/* @__PURE__ */ export const AnonC9313a41096b1c02 = type({
  'source?': Anon53a40f0a5a146c2f,
  'content?': 'string',
  'description?': 'string',
  'argumentHint?': 'string',
  'model?': 'string',
  'allowedTools?': 'string[]',
});
/* @__PURE__ */ export const AnonC9cf89eeb3eb4500 = type({
  'readOnly?': 'boolean',
  'destructive?': 'boolean',
  'openWorld?': 'boolean',
});
/* @__PURE__ */ export const AnonCa4d4efb9bdcd814 = type("'tool_use' | 'assistant_text'");
/* @__PURE__ */ export const AnonCa5efb510a0bc936 = type({
  'filePath': 'string',
  'lineStart?': 'number',
  'lineEnd?': 'number',
});
/* @__PURE__ */ export const AnonCa63f4fbe5030e2b = type({
  'id': 'string',
  'subject': 'string',
});
/* @__PURE__ */ export const AnonCaae10a6b45c63e6 = type("unknown");
/* @__PURE__ */ export const AnonCae0b9e9f78d24fb = type({
  'oldTodos?': "unknown",
  'newTodos?': "unknown",
});
/* @__PURE__ */ export const AnonCb175fd91e5c521b = type("'allowed' | 'allowed_warning' | 'rejected'");
/* @__PURE__ */ export const AnonCcb9deb0d395e728 = type({
  'added': 'string[]',
  'removed': 'string[]',
  'errors': 'Record<string, string>',
});
/* @__PURE__ */ export const AnonCce3a2219edb70dd = type({});
/* @__PURE__ */ export const AnonCce3a2219edb70dd2 = type({});
/* @__PURE__ */ export const AnonCce3a2219edb70dd3 = type({});
/* @__PURE__ */ export const AnonCce3a2219edb70dd4 = type({});
/* @__PURE__ */ export const AnonCd2babfe0ed7a7f0 = type({
  'questions': Anon1076740198fcfca9.array(),
  'answers': 'Record<string, string>',
  'annotations?': "unknown",
});
/* @__PURE__ */ export const AnonCdadb02be8653dc4 = type("unknown");
/* @__PURE__ */ export const AnonCdd6f5f92ea3a23a = type({
  'auto?': 'string',
  'team?': 'string',
});
/* @__PURE__ */ export const AnonCe877fbe641f796d = type({
  'hook_event_name': '\'Setup\'',
  'trigger': '\'init\' | \'maintenance\'',
});
/* @__PURE__ */ export const AnonCea5f924433ec040 = type("unknown");
/* @__PURE__ */ export const AnonCea623d6c94b39fc = type("unknown");
/* @__PURE__ */ export const AnonCf327d081edf070e = type({
  'taskId': 'string',
  'timeoutMs': 'number',
  'persistent?': 'boolean',
});
/* @__PURE__ */ export const AnonCf5f140847b1eeac = type({
  'method?': "unknown",
  'params': { "filePath": "string", "lineStart?": "number", "lineEnd?": "number" },
});
/* @__PURE__ */ export const AnonD0c27eaca83194ae = type("unknown");
/* @__PURE__ */ export const DisabledMessage = type({
  'type': '\'disabled\'',
});
/* @__PURE__ */ export const EnabledMessage = type({
  'type': '\'enabled\'',
  'budgetTokens?': 'number',
  'display?': '\'summarized\' | \'omitted\'',
});
/* @__PURE__ */ export const AnonD1de51868b6d65c1 = AdaptiveMessage.or(DisabledMessage).or(EnabledMessage);
/* @__PURE__ */ export const AnonD1f1ce578c373749 = type({
  'proto?': "unknown",
  'op': '\'respawn-stale\'',
  'short?': "unknown",
});
/* @__PURE__ */ export const AnonD2b1f06f152d1cc8 = type({
  'name': 'string',
  'owner': { "login": "string" },
  'default_branch?': 'string',
});
/* @__PURE__ */ export const AnonD2cffce8cfe24a02 = type({
  'filePath': 'string',
  'newContent': 'string',
});
/* @__PURE__ */ export const AnonD3cde3ee3990d5d8 = type({
  'mcpServers': { "[string]": Anon6f5d7ed95df79316 },
});
/* @__PURE__ */ export const AnonD4346e818d6dd2c4 = type({
  'content': 'unknown',
  'structuredContent?': 'Record<string, unknown>',
  '_meta?': 'Record<string, unknown>',
});
/* @__PURE__ */ export const AnonD612f6195d23f095 = type({
  'http?': 'string',
  'https?': 'string',
  'noProxy?': 'string',
});
/* @__PURE__ */ export const AnonD63b469e0a2b7718 = type({
  'id': 'string',
  'subject': 'string',
  'description': 'string',
  'activeForm?': 'string',
  'owner?': 'string',
  'status?': "unknown",
  'blocks': 'string[]',
  'blockedBy': 'string[]',
  'metadata?': 'Record<string, unknown>',
});
/* @__PURE__ */ export const AnonD7c9415fb5c6485a = type("unknown");
/* @__PURE__ */ export const AnonD7c9415fb5c6485a2 = type("unknown");
/* @__PURE__ */ export const AnonD7c9415fb5c6485a3 = type("unknown");
/* @__PURE__ */ export const AnonD7c9415fb5c6485a4 = type("unknown");
/* @__PURE__ */ export const AnonD8487e55f3fdd3a1 = type({
  'kind': '\'coordinator\'',
});
/* @__PURE__ */ export const AnonD84db4f4fb354ccf2 = type({
  'hookEventName': '\'UserPromptExpansion\'',
  'additionalContext?': 'string',
});
/* @__PURE__ */ export const AnonD978fdde110d9fd1 = type("unknown");
/* @__PURE__ */ export const AnonD983ce61d32b0397 = type({
  'projectKey': 'string',
  'sessionId': 'string',
  'subpath?': 'string',
});
/* @__PURE__ */ export const AnonDa8dc49463f911c3 = type({
  'source': '\'directory\'',
  'path': 'string',
});
/* @__PURE__ */ export const AnonDb35a451f3e145de = type("unknown");
/* @__PURE__ */ export const AnonDbaff3e8b7080332 = type({
  'id': 'string',
  'cron': 'string',
  'prompt': 'string',
  'directory': 'string',
  'enabled': 'boolean',
  'permissionMode?': "unknown",
  'model?': 'string',
  'runTimeoutMinutes': 'number',
  'maxQueued?': "unknown",
});
/* @__PURE__ */ export const AnonDbdd2c014b504414 = type({
  'status?': '\'pending\' | \'running\' | \'completed\' | \'failed\' | \'killed\'',
  'description?': 'string',
  'end_time?': 'number',
  'total_paused_ms?': 'number',
  'error?': 'string',
  'is_backgrounded?': 'boolean',
});
/* @__PURE__ */ export const AnonDc1a3dc823217674 = type({
  'server': 'string',
  'displayName?': 'string',
  'userConfig?': { "[string]": AnonBabe0d5f53455e07 },
});
/* @__PURE__ */ export const AnonDc4c4e4039c0a75c = type({
  'file_uuid': 'string',
  'file_name': 'string',
  'is_image?': 'boolean | null',
});
/* @__PURE__ */ export const AnonDc5c87c2a21ca5d0 = type("unknown");
/* @__PURE__ */ export const AnonDc837a6273141628 = type({
  'name': 'string',
  'permission_policy': '\'always_allow\' | \'always_ask\' | \'always_deny\'',
});
/* @__PURE__ */ export const AnonDca1aee7f0276592 = type({
  'hook_event_name': '\'UserPromptSubmit\'',
  'prompt': 'string',
  'session_title?': 'string',
});
/* @__PURE__ */ export const AnonDccb1928b4ab074d = type("'tmux' | 'screen' | 'zellij'");
/* @__PURE__ */ export const AnonDd057744e6978ee0 = type({
  'continue?': "unknown",
  'suppressOutput?': "unknown",
  'stopReason?': "unknown",
  'decision?': '\'approve\' | \'block\'',
  'reason?': "unknown",
  'systemMessage?': "unknown",
  'hookSpecificOutput?': "unknown",
});
/* @__PURE__ */ export const AnonDd900b6584cb8f8f = type({
  'name?': "unknown",
  'description?': "unknown",
});
/* @__PURE__ */ export const AnonDdf35553f04aa356 = type({
  'managedSettings?': 'unknown',
  'claudeMd?': 'string',
  'appendSystemPrompt?': 'string',
});
/* @__PURE__ */ export const AnonDe860206bbc8a37d = type({
  'recurringFrac?': "unknown",
  'recurringCapMs?': "unknown",
  'oneShotMaxMs?': "unknown",
  'oneShotFloorMs?': "unknown",
  'oneShotMinuteMod?': "unknown",
  'recurringMaxAgeMs?': "unknown",
  'cacheLeadMs?': "unknown",
});
/* @__PURE__ */ export const AnonDf02624258caa211 = type("unknown");
/* @__PURE__ */ export const AnonDf0c869129a4645a = type({
  'filePath': 'string',
  'oldString': 'string',
  'newString': 'string',
  'originalFile': 'string | null',
  'structuredPatch': Anon213b7f97920a9965.array(),
  'userModified': 'boolean',
  'replaceAll': 'boolean',
  'gitDiff?': Anon919fa7099f916637,
});
/* @__PURE__ */ export const AnonDf25b41234462d69 = type({
  'organizationId': 'string',
  'repo': 'string',
  'version': 'number',
  'lastModified': 'string',
  'checksum': 'string',
  'content': Anon6e706fa8e35c326e,
});
/* @__PURE__ */ export const AnonDfdcd977c1a5495e = type("'sonnet' | 'opus' | 'haiku'");
/* @__PURE__ */ export const AnonE0061e96ada35723 = type("'pr' | 'frame'");
/* @__PURE__ */ export const AnonE02c4bacc10c0905 = type({
  'thinking': 'string',
  'shouldBlock': 'boolean',
  'reason': 'string',
});
/* @__PURE__ */ export const AnonE04fa7a316494825 = type({
  'command': 'string',
  'timeout?': "unknown",
  'description?': 'string',
  'run_in_background?': "unknown",
  'dangerouslyDisableSandbox?': "unknown",
  '_simulatedSedEdit?': { "filePath": "string", "newContent": "string" },
});
/* @__PURE__ */ export const AnonE0bdf43c27b04fa4 = type({
  'id': 'string',
  'subject': 'string',
  'status?': "unknown",
  'owner?': 'string',
  'blockedBy': 'string[]',
});
/* @__PURE__ */ export const AnonE0c2ffb175a5d0fb = type({
  'behavior': '\'deny\'',
  'message': 'string',
  'interrupt?': 'boolean',
  'toolUseID?': 'string',
  'decisionClassification?': Anon9e0a37027d082b11,
});
/* @__PURE__ */ export const AnonE0cf900e045dfa5d = type({
  'hookEventName': '\'CwdChanged\'',
  'watchPaths?': "unknown",
});
/* @__PURE__ */ export const AnonE11e5acb673dd31a = type({
  'feedback_id': 'string | null',
  'unavailable_reason?': 'string',
  'is_zdr_org?': 'boolean',
  'failure_reason?': 'string',
  'status_code?': 'number',
  'ccshare_url?': 'string',
});
/* @__PURE__ */ export const AnonE1376ef0362b81ed = type({
  'description': 'string',
  'prompt': 'string',
  'subagent_type?': 'string',
  'model?': '\'sonnet\' | \'opus\' | \'haiku\'',
  'run_in_background?': 'boolean',
});
/* @__PURE__ */ export const AnonE14b2c8c09444bf6 = type({
  'hook_event_name': '\'PostToolUse\'',
  'tool_name': 'string',
  'tool_input': 'unknown',
  'tool_response': 'unknown',
  'tool_use_id': 'string',
  'duration_ms?': 'number',
});
/* @__PURE__ */ export const AnonE209d2c2efaf895b = type("unknown");
/* @__PURE__ */ export const AnonE21ecc26d6950f1c = type({
  'description': 'string',
  'tools?': 'string[]',
  'disallowedTools?': 'string[]',
  'prompt': 'string',
  'model?': "unknown",
  'effort?': "unknown",
  'permissionMode?': "unknown",
  'mcpServers?': AnonA07fa418900ae98f.array(),
  'hooks?': Anon33a6d56abf0022db,
  'maxTurns?': "unknown",
  'skills?': 'string[]',
  'initialPrompt?': 'string',
  'memory?': '\'user\' | \'project\' | \'local\'',
  'background?': 'boolean',
  'isolation?': '\'worktree\'',
});
/* @__PURE__ */ export const AnonE24909a7c18cf3fc = type({
  'q': 'string',
  'collapsed?': 'string[]',
  'ts': 'number',
});
/* @__PURE__ */ export const AnonE25b3575cdb70a4a = type({
  'status': 'number',
  'json': 'string',
  'summary?': 'string',
});
/* @__PURE__ */ export const AnonE37ca2d57509a1d5 = type({
  'updatedAt': 'string',
});
/* @__PURE__ */ export const AnonE39d13007108ff6c = type("unknown");
/* @__PURE__ */ export const AnonE51274e9c3168201 = type({
  'session_id': 'string',
  'ws_url': 'string',
  'work_dir?': 'string',
  'session_key?': 'string',
});
/* @__PURE__ */ export const AnonE5a9e64393491164 = type("unknown");
/* @__PURE__ */ export const AnonE5f0ba3a030447b4 = type({
  'web_search_requests': 'number',
  'web_fetch_requests': 'number',
});
/* @__PURE__ */ export const AnonE5f8376780a17887 = type({
  'hook_event_name': '\'TaskCompleted\'',
  'task_id': 'string',
  'task_subject': 'string',
  'task_description?': 'string',
  'teammate_name?': 'string',
  'team_name?': 'string',
});
/* @__PURE__ */ export const AnonE60dd4f597043280 = type({
  'filePath': 'string',
});
/* @__PURE__ */ export const AnonE681ef316887767c = type({
  'url': 'string',
  'prompt': 'string',
});
/* @__PURE__ */ export const AnonE6d5908986145180 = type({
  'plugin': 'string',
  'type': 'string',
  'message': 'string',
});
/* @__PURE__ */ export const AnonE7e1cd27649599c5 = type("'stdio' | 'sse' | 'sse-ide' | 'http' | 'ws' | 'sdk'");
/* @__PURE__ */ export const AnonE7e79d9473572c9b = type("unknown");
/* @__PURE__ */ export const AnonE7e79d9473572c9b10 = type("unknown");
/* @__PURE__ */ export const AnonE7e79d9473572c9b2 = type("unknown");
/* @__PURE__ */ export const AnonE7e79d9473572c9b3 = type("unknown");
/* @__PURE__ */ export const AnonE7e79d9473572c9b4 = type("unknown");
/* @__PURE__ */ export const AnonE7e79d9473572c9b5 = type("unknown");
/* @__PURE__ */ export const AnonE7e79d9473572c9b6 = type("unknown");
/* @__PURE__ */ export const AnonE7e79d9473572c9b7 = type("unknown");
/* @__PURE__ */ export const AnonE7e79d9473572c9b8 = type("unknown");
/* @__PURE__ */ export const AnonE7e79d9473572c9b9 = type("unknown");
/* @__PURE__ */ export const AnonE9ab9e77435f5c91 = Anon9e0a37027d082b11.or(Anon9e0a37027d082b11).or(AddRulesMessage);
/* @__PURE__ */ export const AnonE9bafa092b1a84c0 = type("unknown");
/* @__PURE__ */ export const AnonEaf4e3a0a37a55a6 = type("'now' | 'next' | 'later'");
/* @__PURE__ */ export const AnonEb5ce46f85477660 = type({
  'hook_event_name': '\'Notification\'',
  'message': 'string',
  'title?': 'string',
  'notification_type': 'string',
});
/* @__PURE__ */ export const AnonEbd1f8060c58c270 = type("unknown");
/* @__PURE__ */ export const AnonEc051bcbbcefee7a = type({
  'type': 'string',
});
/* @__PURE__ */ export const AnonEc051bcbbcefee7a2 = type({
  'type': 'string',
});
/* @__PURE__ */ export const AnonEc2adbe2e76a6fd1 = type({
  'proto?': "unknown",
  'op': '\'shutdown\'',
  'reapWorkers?': 'boolean',
});
/* @__PURE__ */ export const AnonEc7449cf1a5e9c61 = type({
  'stdout': 'string',
  'stderr': 'string',
  'rawOutputPath?': 'string',
  'interrupted': 'boolean',
  'isImage?': 'boolean',
  'backgroundTaskId?': 'string',
  'backgroundedByUser?': 'boolean',
  'assistantAutoBackgrounded?': 'boolean',
  'dangerouslyDisableSandbox?': 'boolean',
  'returnCodeInterpretation?': 'string',
  'noOutputExpected?': 'boolean',
  'structuredContent?': 'unknown[]',
  'persistedOutputPath?': 'string',
  'persistedOutputSize?': 'number',
  'staleReadFileStateHint?': 'string',
  'ghRateLimitHint?': 'string',
});
/* @__PURE__ */ export const AnonEc88bda221054bc72 = type({
  'hookEventName': '\'PermissionDenied\'',
  'retry?': 'boolean',
});
/* @__PURE__ */ export const AnonEc8fbc3a4df22803 = type("'spawnTeam' | 'cleanup'");
/* @__PURE__ */ export const AnonEca25b4a4b5b6c9a = type({
  'proto?': "unknown",
  'op': '\'await-ack\'',
  'short?': "unknown",
  'nonce?': "unknown",
  'timeoutMs': 'number',
});
/* @__PURE__ */ export const AnonEcd02eb033821952 = type("unknown");
/* @__PURE__ */ export const AnonEcf5a2a8f588ba47 = type({
  'skill': 'string',
  'args?': 'string',
});
/* @__PURE__ */ export const AnonEd2d4e2576cc1c40 = type({
  'team_name': 'string',
  'description?': 'string',
  'agent_type?': 'string',
});
/* @__PURE__ */ export const AnonEd486017c746e816 = type({
  'allow?': 'string[]',
  'soft_deny?': 'string[]',
  'hard_deny?': 'string[]',
  'environment?': 'string[]',
});
/* @__PURE__ */ export const AnonEd7f052e30ab6e30 = type("unknown");
/* @__PURE__ */ export const AnonEe57dbce022c749f = type("unknown");
/* @__PURE__ */ export const AnonEe57dbce022c749f10 = type("unknown");
/* @__PURE__ */ export const AnonEe57dbce022c749f2 = type("unknown");
/* @__PURE__ */ export const AnonEe57dbce022c749f3 = type("unknown");
/* @__PURE__ */ export const AnonEe57dbce022c749f4 = type("unknown");
/* @__PURE__ */ export const AnonEe57dbce022c749f5 = type("unknown");
/* @__PURE__ */ export const AnonEe57dbce022c749f6 = type("unknown");
/* @__PURE__ */ export const AnonEe57dbce022c749f7 = type("unknown");
/* @__PURE__ */ export const AnonEe57dbce022c749f8 = type("unknown");
/* @__PURE__ */ export const AnonEe57dbce022c749f9 = type("unknown");
/* @__PURE__ */ export const AnonEf1482a224cfd097 = type("unknown");
/* @__PURE__ */ export const AnonEf7cf2bbdb3d1a88 = type({
  'bytes': 'number',
  'code': 'number',
  'codeText': 'string',
  'result': 'string',
  'durationMs': 'number',
  'url': 'string',
});
/* @__PURE__ */ export const AnonEfc27434e33c1652 = type({
  'method': '\'log_event\'',
  'params?': "unknown",
});
/* @__PURE__ */ export const AnonEfc27434e33c16522 = type({
  'method': '\'log_event\'',
  'params?': "unknown",
});
/* @__PURE__ */ export const AnonEff793ad7c0d1dd2 = type("unknown");
/* @__PURE__ */ export const AnonF012ae85d892ebbc2 = type({
  'hookEventName': '\'PostToolUseFailure\'',
  'additionalContext?': 'string',
});
/* @__PURE__ */ export const AnonF018debc4f5bd2ee = type({
  'operation': '\'spawnTeam\' | \'cleanup\'',
  'agent_type?': 'string',
  'team_name?': 'string',
  'description?': 'string',
});
/* @__PURE__ */ export const AnonF088f4da3c5476e2 = type({
  'dir': 'string',
  'name?': 'string',
  'userIdleMinutes': 'number',
  'cronHorizonMinutes': 'number',
});
/* @__PURE__ */ export const AnonF1881b32100d8dfa = type({
  'success': 'boolean',
  'taskId': 'string',
  'updatedFields': 'string[]',
  'error?': 'string',
  'statusChange?': { "from": "string", "to": "string" },
});
/* @__PURE__ */ export const AnonF1d9a5d4c8be11d2 = type("'on' | 'name-only' | 'user-invocable-only' | 'off'");
/* @__PURE__ */ export const AnonF2d3e22be8bdbde5 = type({
  'sessionId': 'string',
  'environmentId': 'string',
  'source': '\'standalone\' | \'repl\'',
});
/* @__PURE__ */ export const AnonF2fe337be2ec3f1e = type({
  'lspServers?': "unknown",
});
/* @__PURE__ */ export const AnonF30b60c6af590788 = type({
  'hook_event_name': '\'InstructionsLoaded\'',
  'file_path': 'string',
  'memory_type?': "unknown",
  'load_reason?': "unknown",
  'globs?': 'string[]',
  'trigger_file_path?': 'string',
  'parent_file_path?': 'string',
});
/* @__PURE__ */ export const AnonF389d38d1a1a46fe = type({
  'hooks?': "unknown",
});
/* @__PURE__ */ export const AnonF3957431915cef24 = type({
  'command': 'string',
});
/* @__PURE__ */ export const AnonF3d46ed04eec04b8 = type({
  'context': 'string',
  'bindings?': "unknown",
});
/* @__PURE__ */ export const AnonF3d69a965b9e170d = type({
  'behavior': '\'deny\'',
  'message?': 'string',
  'interrupt?': 'boolean',
});
/* @__PURE__ */ export const AnonF3d69a965b9e170d2 = type({
  'behavior': '\'deny\'',
  'message?': 'string',
  'interrupt?': 'boolean',
});
/* @__PURE__ */ export const AnonF3f2fa359b4647d3 = type("'content' | 'files_with_matches' | 'count'");
/* @__PURE__ */ export const AnonF43563b149552c52 = type({
  'taskId': 'string',
  'subject?': 'string',
  'description?': 'string',
  'activeForm?': 'string',
  'status?': "unknown",
  'addBlocks?': 'string[]',
  'addBlockedBy?': 'string[]',
  'owner?': 'string',
  'metadata?': 'Record<string, unknown>',
});
/* @__PURE__ */ export const AnonF489d5d70475cfe5 = type({
  'worktreePath': 'string',
  'worktreeBranch?': 'string',
  'message': 'string',
});
/* @__PURE__ */ export const AnonF542516f400a5d66 = type({
  'contents': 'string',
  'absPath': 'string',
  'truncated?': 'boolean',
  'encoding?': '\'base64\'',
});
/* @__PURE__ */ export const AnonF55363cb67749361 = type("'check' | 'update' | 'create' | 'delete'");
/* @__PURE__ */ export const AnonF5666ca702993bbc = type({
  'hook_event_name': '\'WorktreeRemove\'',
  'worktree_path': 'string',
});
/* @__PURE__ */ export const AnonF5badb2065dcf0fd = type({
  'hook_event_name': '\'TaskCreated\'',
  'task_id': 'string',
  'task_subject': 'string',
  'task_description?': 'string',
  'teammate_name?': 'string',
  'team_name?': 'string',
});
/* @__PURE__ */ export const AnonF5e1aeb738f8f47a = type({
  'jobs': type({ "id": "string", "cron": "string", "humanSchedule": "string", "prompt": "string", "recurring?": "boolean", "durable?": "boolean" }).array(),
});
/* @__PURE__ */ export const AnonF5fb921536f60940 = type("unknown");
/* @__PURE__ */ export const AnonF66fd9d1af74fee1 = type({
  'total_tokens': 'number',
  'tool_uses': 'number',
  'duration_ms': 'number',
});
/* @__PURE__ */ export const AnonF69b97ebaf51c4de = type({
  'prompt': 'string',
  'message': 'string',
  'options': Anon70b04baea97fe049.array(),
});
/* @__PURE__ */ export const AnonF7753c18cc173744 = type({
  'commands?': "unknown",
});
/* @__PURE__ */ export const AnonF85c664bcc687fe5 = type({
  'issuer': 'string',
  'clientId': 'string',
  'callbackPort?': "unknown",
});
/* @__PURE__ */ export const AnonFa81b9c196bd53a7 = type({
  'id': 'string',
  'title': 'string',
  'description': 'string',
  'status': '\'idle\' | \'working\' | \'waiting\' | \'completed\' | \'archived\' | \'cancelled\' | \'rejected\'',
  'repo': type({ "name": "string", "owner": { "login": "string" }, "default_branch?": "string" }).or("null"),
  'turns': 'string[]',
  'created_at': 'string',
  'updated_at': 'string',
});
/* @__PURE__ */ export const AnonFb53f864f7cccdda = type({
  'commands': Anon446ce4dfba1ac210.array(),
  'agents': AnonC58539f1595a7adc.array(),
  'output_style': 'string',
  'available_output_styles': 'string[]',
  'models': Anon3799375771f2f77c.array(),
  'account': AnonAbdaf197dd063dc7,
  'pid?': 'number',
  'fast_mode_state?': Anon687df4bcd3dc44ff,
});
/* @__PURE__ */ export const AnonFb54af67c6bea771 = type("'list' | 'get' | 'create' | 'update' | 'run'");
/* @__PURE__ */ export const AnonFb5c4ee211dab5dd = type({
  'sub?': 'string',
  'email?': 'string',
  'groups?': 'string[]',
});
/* @__PURE__ */ export const AnonFb86a8833ad9ba10 = type({
  'selection?': type({ "start": { "line": "number", "character": "number" }, "end": { "line": "number", "character": "number" } }).or("null"),
  'text?': 'string',
  'filePath?': 'string',
});
/* @__PURE__ */ export const AnonFbeb8cc5ff7cff6e = type({
  'label': 'string',
  'description': 'string',
});
/* @__PURE__ */ export const AnonFc08454289f649da = type({
  'scheduledFor': 'number',
  'clampedDelaySeconds': 'number',
  'wasClamped': 'boolean',
});
/* @__PURE__ */ export const AnonFc6456591dd318e3 = type("unknown");
/* @__PURE__ */ export const AnonFd477dd8861a0edb = type("'user' | 'project' | 'local'");
/* @__PURE__ */ export const AnonFde6cf3db8b3d9e4 = type("'accept' | 'decline' | 'cancel'");
/* @__PURE__ */ export const AnonFde6cf3db8b3d9e42 = type("'accept' | 'decline' | 'cancel'");
/* @__PURE__ */ export const AnonFe10cc79270d351c = type({
  'allowed': 'boolean',
});
/* @__PURE__ */ export const AnonFe83a3a30d7d55ef = type({
  'source': '\'git\'',
  'url': 'string',
  'ref?': 'string',
  'path?': 'string',
  'sparsePaths?': 'string[]',
});
/* @__PURE__ */ export const AnonFecf74043ed90b3e = type({
  'status': '\'created\' | \'updated\' | \'deleted\' | \'has_existing\' | \'unavailable\'',
  'share_url?': 'string',
  'short_code?': 'string',
  'message': 'string',
});
/* @__PURE__ */ export const AnonFee5edeeacc76a8f = type({
  'id': 'string',
  'workerId': 'string',
  'workerName': 'string',
  'workerColor?': 'string',
  'teamName': 'string',
  'toolName': 'string',
  'toolUseId': 'string',
  'description': 'string',
  'input': 'Record<string, unknown>',
  'permissionSuggestions': 'unknown[]',
  'status': '\'pending\' | \'approved\' | \'rejected\'',
  'resolvedBy?': '\'worker\' | \'leader\'',
  'resolvedAt?': 'number',
  'feedback?': 'string',
  'updatedInput?': 'Record<string, unknown>',
  'permissionUpdates?': 'unknown[]',
  'createdAt': 'number',
});
/* @__PURE__ */ export const AnonFf581af267c9e8fb = type("unknown");
/* @__PURE__ */ export const AnonFf60ce6646410905 = type({
  '$schema?': 'string',
  'name?': "unknown",
  'version?': 'string',
  'description?': 'string',
  'owner': Anon1e4a490ce15e2b7b,
  'plugins': 'unknown[]',
  'forceRemoveDeletedPlugins?': 'boolean',
  'metadata?': { "pluginRoot?": "string", "version?": "string", "description?": "string" },
  'allowCrossMarketplaceDependenciesOn?': 'string[]',
});
/* @__PURE__ */ export const AnonFfaf17e992ae5172 = type("unknown");
/* @__PURE__ */ export const Base64Message = type({
  'method': '\'notifications/message\'',
  'params': { "prompt": "string", "image?": { "type": "'base64'", "media_type": "'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'", "data": "string" }, "tabId?": "number" },
});
/* @__PURE__ */ export const Base64Message2 = type({
  'prompt': 'string',
  'image?': { "type": "'base64'", "media_type": "'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'", "data": "string" },
  'tabId?': 'number',
});
/* @__PURE__ */ export const Base64Message3 = type({
  'type': '\'base64\'',
  'media_type': '\'image/jpeg\' | \'image/png\' | \'image/gif\' | \'image/webp\'',
  'data': 'string',
});
/* @__PURE__ */ export const ClaudeaiProxyMessage2 = type({
  'type': '\'claudeai-proxy\'',
  'url': 'string',
  'id': 'string',
});
/* @__PURE__ */ export const CommandMessage = type({
  'type': '\'command\'',
  'command': 'string',
  'args?': 'string[]',
  'if?': "unknown",
  'shell?': "unknown",
  'timeout?': 'number',
  'statusMessage?': 'string',
  'once?': 'boolean',
  'async?': 'boolean',
  'asyncRewake?': 'boolean',
  'rewakeMessage?': 'string',
  'rewakeSummary?': 'string',
});
/* @__PURE__ */ export const CommandMessage2 = type({
  '$schema?': "unknown",
  'apiKeyHelper?': 'string',
  'proxyAuthHelper?': 'string',
  'awsCredentialExport?': 'string',
  'awsAuthRefresh?': 'string',
  'gcpAuthRefresh?': 'string',
  'policyHelper?': Anon13c8729b6b01f422,
  'fileSuggestion?': { "type": "'command'", "command": "string" },
  'respectGitignore?': 'boolean',
  'cleanupPeriodDays?': "unknown",
  'skillListingMaxDescChars?': "unknown",
  'skillListingBudgetFraction?': "unknown",
  'wslInheritsWindowsSettings?': 'boolean',
  'env?': AnonE9bafa092b1a84c0,
  'attribution?': { "commit?": "string", "pr?": "string" },
  'includeCoAuthoredBy?': 'boolean',
  'includeGitInstructions?': 'boolean',
  'permissions?': "unknown",
  'model?': 'string',
  'availableModels?': 'string[]',
  'modelOverrides?': 'Record<string, string>',
  'enableAllProjectMcpServers?': 'boolean',
  'enabledMcpjsonServers?': 'string[]',
  'disabledMcpjsonServers?': 'string[]',
  'skillOverrides?': 'Record<string, \'on\' | \'name-only\' | \'user-invocable-only\' | \'off\'>',
  'allowedMcpServers?': Anon1f18b0ebcad02f99.array(),
  'deniedMcpServers?': Anon58fa413d87081552.array(),
  'hooks?': Anon33a6d56abf0022db,
  'worktree?': { "symlinkDirectories?": "string[]", "sparsePaths?": "string[]", "baseRef?": "'fresh' | 'head'" },
  'disableAllHooks?': 'boolean',
  'disableAgentView?': 'boolean',
  'disableRemoteControl?': 'boolean',
  'disableSkillShellExecution?': 'boolean',
  'defaultShell?': '\'bash\' | \'powershell\'',
  'allowManagedHooksOnly?': 'boolean',
  'allowedHttpHookUrls?': 'string[]',
  'httpHookAllowedEnvVars?': 'string[]',
  'allowManagedPermissionRulesOnly?': 'boolean',
  'allowManagedMcpServersOnly?': 'boolean',
  'strictPluginOnlyCustomization?': "unknown",
  'statusLine?': "unknown",
  'prUrlTemplate?': 'string',
  'subagentStatusLine?': { "type": "'command'", "command": "string" },
  'enabledPlugins?': 'Record<string, string[] | boolean | undefined>',
  'extraKnownMarketplaces?': "unknown",
  'strictKnownMarketplaces?': Anon0a150b08265309d1.array(),
  'blockedMarketplaces?': Anon0a150b08265309d1.array(),
  'forceLoginMethod?': '\'claudeai\' | \'console\'',
  'parentSettingsBehavior?': '\'first-wins\' | \'merge\'',
  'forceLoginOrgUUID?': 'string | string[]',
  'forceRemoteSettingsRefresh?': 'boolean',
  'otelHeadersHelper?': 'string',
  'outputStyle?': 'string',
  'viewMode?': "unknown",
  'language?': 'string',
  'skipWebFetchPreflight?': 'boolean',
  'sandbox?': Anon6752a06ba5126448,
  'feedbackSurveyRate?': "unknown",
  'spinnerTipsEnabled?': 'boolean',
  'spinnerVerbs?': { "mode": "'append' | 'replace'", "verbs": "string[]" },
  'spinnerTipsOverride?': { "excludeDefault?": "boolean", "tips": "string[]" },
  'syntaxHighlightingDisabled?': 'boolean',
  'terminalTitleFromRename?': 'boolean',
  'alwaysThinkingEnabled?': 'boolean',
  'effortLevel?': "unknown",
  'autoCompactWindow?': "unknown",
  'advisorModel?': 'string',
  'fastMode?': 'boolean',
  'fastModePerSessionOptIn?': 'boolean',
  'promptSuggestionEnabled?': 'boolean',
  'awaySummaryEnabled?': 'boolean',
  'showClearContextOnPlanAccept?': 'boolean',
  'agent?': 'string',
  'companyAnnouncements?': 'string[]',
  'pluginConfigs?': { "[string]": { "mcpServers?": "Record<string, Record<string, string | number | boolean | string[]>>", "options?": "Record<string, string | number | boolean | string[]>" } },
  'remote?': { "defaultEnvironmentId?": "string" },
  'autoUpdatesChannel?': '\'latest\' | \'stable\' | \'rc\'',
  'minimumVersion?': 'string',
  'plansDirectory?': 'string',
  'tui?': '\'default\' | \'fullscreen\'',
  'voice?': { "enabled?": "boolean", "mode?": "'hold' | 'tap'", "autoSubmit?": "boolean" },
  'channelsEnabled?': 'boolean',
  'allowedChannelPlugins?': type({ "marketplace": "string", "plugin": "string" }).array(),
  'prefersReducedMotion?': 'boolean',
  'doneMeansMerged?': 'boolean',
  'autoMemoryEnabled?': 'boolean',
  'autoMemoryDirectory?': 'string',
  'autoDreamEnabled?': 'boolean',
  'showThinkingSummaries?': 'boolean',
  'skipDangerousModePermissionPrompt?': 'boolean',
  'disableAutoMode?': '\'disable\'',
  'sshConfigs?': type({ "id": "string", "name": "string", "sshHost": "string", "sshPort?": "number", "sshIdentityFile?": "string", "startDirectory?": "string" }).array(),
  'claudeMd?': 'string',
  'claudeMdExcludes?': 'string[]',
  'pluginTrustMessage?': 'string',
  'theme?': "unknown",
  'editorMode?': "unknown",
  'verbose?': 'boolean',
  'preferredNotifChannel?': "unknown",
  'autoCompactEnabled?': 'boolean',
  'autoScrollEnabled?': 'boolean',
  'fileCheckpointingEnabled?': 'boolean',
  'showTurnDuration?': 'boolean',
  'showMessageTimestamps?': 'boolean',
  'terminalProgressBarEnabled?': 'boolean',
  'todoFeatureEnabled?': 'boolean',
  'teammateMode?': "unknown",
  'remoteControlAtStartup?': 'boolean',
  'isolatePeerMachines?': 'boolean',
  'daemonColdStart?': '\'transient\' | \'ask\'',
  'autoUploadSessions?': 'boolean',
  'inputNeededNotifEnabled?': 'boolean',
  'agentPushNotifEnabled?': 'boolean',
});
/* @__PURE__ */ export const CommandMessage3 = type({
  'type': '\'command\'',
  'command': 'string',
});
/* @__PURE__ */ export const CommandMessage4 = type({
  'type': '\'command\'',
  'command': 'string',
  'padding?': 'number',
  'refreshInterval?': "unknown",
  'hideVimModeIndicator?': 'boolean',
});
/* @__PURE__ */ export const CommandMessage5 = type({
  'type': '\'command\'',
  'command': 'string',
});
/* @__PURE__ */ export const FileUnchangedMessage = type({
  'type': '\'file_unchanged\'',
  'file': { "filePath": "string" },
});
/* @__PURE__ */ export const HttpMessage2 = type({
  'type': '\'http\'',
  'url': 'string',
  'headers?': 'Record<string, string>',
  'tools?': AnonDc837a6273141628.array(),
  'alwaysLoad?': 'boolean',
});
/* @__PURE__ */ export const ImageMessage = type({
  'type': '\'image\'',
  'file?': "unknown",
});
/* @__PURE__ */ export const JsonSchemaMessage = type({
  'type': '\'json_schema\'',
  'schema': 'Record<string, unknown>',
});
/* @__PURE__ */ export const LocalMessage = type({
  'type': '\'local\'',
  'path': 'string',
});
/* @__PURE__ */ export const McpToolMessage = type({
  'type': '\'mcp_tool\'',
  'server': 'string',
  'tool': 'string',
  'input?': 'Record<string, unknown>',
  'if?': "unknown",
  'timeout?': 'number',
  'statusMessage?': 'string',
  'once?': 'boolean',
});
/* @__PURE__ */ export const ModeSetRequestMessage = type({
  'type': '\'mode_set_request\'',
  'mode': PermissionMode,
  'from': 'string',
});
/* @__PURE__ */ export const NotebookMessage = type({
  'type': '\'notebook\'',
  'file': { "filePath": "string", "cells": "unknown[]" },
});
/* @__PURE__ */ export const PartsMessage = type({
  'type': '\'parts\'',
  'file': { "filePath": "string", "originalSize": "number", "count": "number", "outputDir": "string" },
});
/* @__PURE__ */ export const PdfMessage = type({
  'type': '\'pdf\'',
  'file': { "filePath": "string", "base64": "string", "originalSize": "number" },
});
/* @__PURE__ */ export const PlanApprovalRequestMessage = type({
  'type': '\'plan_approval_request\'',
  'from': 'string',
  'timestamp': 'string',
  'planFilePath': 'string',
  'planContent': 'string',
  'requestId': 'string',
});
/* @__PURE__ */ export const PlanApprovalResponseMessage = type({
  'type': '\'plan_approval_response\'',
  'requestId': 'string',
  'approved': 'boolean',
  'feedback?': 'string',
  'timestamp': 'string',
  'permissionMode?': PermissionMode,
});
/* @__PURE__ */ export const PlanApprovalResponseMessage2 = type({
  'type': '\'plan_approval_response\'',
  'request_id': 'string',
  'approve': 'boolean',
  'feedback?': 'string',
});
/* @__PURE__ */ export const PromptMessage = type({
  'type': '\'prompt\'',
  'prompt': 'string',
  'if?': "unknown",
  'timeout?': 'number',
  'model?': 'string',
  'continueOnBlock?': 'boolean',
  'statusMessage?': 'string',
  'once?': 'boolean',
});
/* @__PURE__ */ export const RemoveDirectoriesMessage = type({
  'type': '\'removeDirectories\'',
  'directories': 'string[]',
  'destination': AnonE6078ccda89f99b9,
});
/* @__PURE__ */ export const RemoveDirectoriesMessage2 = type({
  'type': '\'removeDirectories\'',
  'directories': 'string[]',
  'destination': AnonE6078ccda89f99b92,
});
/* @__PURE__ */ export const RemoveRulesMessage = type({
  'type': '\'removeRules\'',
  'rules': AnonE5fc16036a421b22.array(),
  'behavior': Anon4ee62dc4a79353e4,
  'destination': AnonE6078ccda89f99b9,
});
/* @__PURE__ */ export const RemoveRulesMessage2 = type({
  'type': '\'removeRules\'',
  'rules': AnonE5fc16036a421b222.array(),
  'behavior': Anon4ee62dc4a79353e42,
  'destination': AnonE6078ccda89f99b92,
});
/* @__PURE__ */ export const ReplaceRulesMessage = type({
  'type': '\'replaceRules\'',
  'rules': AnonE5fc16036a421b22.array(),
  'behavior': Anon4ee62dc4a79353e4,
  'destination': AnonE6078ccda89f99b9,
});
/* @__PURE__ */ export const ReplaceRulesMessage2 = type({
  'type': '\'replaceRules\'',
  'rules': AnonE5fc16036a421b222.array(),
  'behavior': Anon4ee62dc4a79353e42,
  'destination': AnonE6078ccda89f99b92,
});
/* @__PURE__ */ export const SdkMessage2 = type({
  'type': '\'sdk\'',
  'name': 'string',
});
/* @__PURE__ */ export const SetModeMessage = type({
  'type': '\'setMode\'',
  'mode': PermissionMode,
  'destination': AnonE6078ccda89f99b9,
});
/* @__PURE__ */ export const SetModeMessage2 = type({
  'type': '\'setMode\'',
  'mode': PermissionMode,
  'destination': AnonE6078ccda89f99b92,
});
/* @__PURE__ */ export const ShutdownApprovedMessage = type({
  'type': '\'shutdown_approved\'',
  'requestId': 'string',
  'from': 'string',
  'timestamp': 'string',
  'paneId?': 'string',
  'backendType?': 'string',
});
/* @__PURE__ */ export const ShutdownRejectedMessage = type({
  'type': '\'shutdown_rejected\'',
  'requestId': 'string',
  'from': 'string',
  'reason': 'string',
  'timestamp': 'string',
});
/* @__PURE__ */ export const ShutdownRequestMessage = type({
  'type': '\'shutdown_request\'',
  'requestId': 'string',
  'from': 'string',
  'reason?': 'string',
  'timestamp': 'string',
});
/* @__PURE__ */ export const ShutdownRequestMessage2 = type("unknown");
/* @__PURE__ */ export const ShutdownRequestMessage3 = type({
  'type': '\'shutdown_request\'',
  'reason?': 'string',
});
/* @__PURE__ */ export const ShutdownResponseMessage = type({
  'type': '\'shutdown_response\'',
  'request_id': 'string',
  'approve': 'boolean',
  'reason?': 'string',
});
/* @__PURE__ */ export const SseMessage2 = type({
  'type': '\'sse\'',
  'url': 'string',
  'headers?': 'Record<string, string>',
  'tools?': AnonDc837a6273141628.array(),
  'alwaysLoad?': 'boolean',
});
/* @__PURE__ */ export const StdioMessage2 = type({
  'type?': '\'stdio\'',
  'command': 'string',
  'args?': 'string[]',
  'env?': 'Record<string, string>',
  'alwaysLoad?': 'boolean',
});
/* @__PURE__ */ export const TextMessage = type({
  'agentId': 'string',
  'agentType?': 'string',
  'content': type({ "type": "'text'", "text": "string" }).array(),
  'totalToolUseCount': 'number',
  'totalDurationMs': 'number',
  'totalTokens': 'number',
  'usage': { "input_tokens": "number", "output_tokens": "number", "cache_creation_input_tokens": "number | null", "cache_read_input_tokens": "number | null", "server_tool_use": type({ "web_search_requests": "number", "web_fetch_requests": "number" }).or("null"), "service_tier": "'standard' | 'priority' | 'batch' | null", "cache_creation": type({ "ephemeral_1h_input_tokens": "number", "ephemeral_5m_input_tokens": "number" }).or("null") },
  'toolStats?': { "readCount": "number", "searchCount": "number", "bashCount": "number", "editFileCount": "number", "linesAdded": "number", "linesRemoved": "number", "otherToolCount": "number" },
});
/* @__PURE__ */ export const TextMessage2 = type({
  'type': '\'text\'',
  'text': 'string',
});
/* @__PURE__ */ export const TextMessage3 = type("unknown");
/* @__PURE__ */ export const TextMessage4 = type({
  'type': '\'text\'',
  'file': { "filePath": "string", "content": "string", "numLines": "number", "startLine": "number", "totalLines": "number" },
});
/* @__PURE__ */ export const UserMessage = type({
  'type': '\'user\'',
  'message': 'Record<string, unknown>',
  'parent_tool_use_id': 'string | null',
  'isSynthetic?': 'boolean',
  'tool_use_result?': 'unknown',
  'priority?': '\'now\' | \'next\' | \'later\'',
  'origin?': Anon9f16486fd14da535,
  'client_platform?': 'string',
  'shouldQuery?': 'boolean',
  'timestamp?': 'string',
});
