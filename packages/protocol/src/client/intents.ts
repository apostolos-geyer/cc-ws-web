/**
 * Intent-level outbound frame builders.
 *
 * Each function takes the high-level operation arguments and a generated
 * `request_id`, returns the wire frame the binary expects. `ClaudeClient`
 * threads the result through `transport.send`.
 *
 * Wire envelope for every control_request:
 *   { type: "control_request", request_id, request: { subtype, ...payload } }
 *
 * Non-control frames (user messages, bash commands, end-session) are
 * built here too — they all live "outbound from the consumer" and share a
 * dispatch shape.
 */

export function buildControlRequest(
  requestId: string,
  subtype: string,
  payload: Record<string, unknown> = {},
): unknown {
  return {
    type: "control_request",
    request_id: requestId,
    request: { subtype, ...payload },
  };
}

export function buildUserMessage(text: string): unknown {
  // Matches the integration-test runner's user_message step shape.
  return {
    type: "user",
    message: { role: "user", content: text },
  };
}

export function buildBashCommandMessage(command: string): unknown {
  // From generated schemas: BashCommandMessage = { type: "bash_command", ...
  // }. The leaked controlSchemas show the field is `command`.
  return {
    type: "bash_command",
    command,
  };
}
