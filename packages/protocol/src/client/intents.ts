/**
 * Intent-level outbound frame builders.
 *
 * Each function takes the high-level operation arguments and a generated
 * `request_id`, returns the wire frame the binary expects. `ClaudeClient`
 * threads the result through `transport.send`.
 *
 * Wire envelope for every control_request:
 *   { type: "control_request", request_id, request: { subtype, ...payload } }
 */

import type { UserContentBlock } from "./frames";

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

export function buildUserMessage(
  text: string | UserContentBlock[],
): unknown {
  return {
    type: "user",
    message: { role: "user", content: text },
  };
}

export function buildBashCommandMessage(command: string): unknown {
  return {
    type: "bash_command",
    command,
  };
}
