/**
 * `permissions.ts` — the `can_use_tool` callback flow.
 *
 * When the binary asks the consumer whether a tool can run, it sends a
 * `control_request` whose payload subtype is `can_use_tool`. `ClaudeClient`
 * forwards the payload to a user-configured callback, awaits the verdict,
 * and writes a `control_response/success` back over the transport with the
 * verdict shape: `{ behavior: "allow", updatedInput } | { behavior: "deny",
 * message }`.
 *
 * The callback is async-aware — a UI that needs to prompt the user can
 * return a deferred verdict via a promise that resolves later. The
 * client correlates by `request_id` so multiple in-flight permission
 * requests don't collide.
 */

export type PermissionVerdict =
  | { behavior: "allow"; updatedInput?: unknown }
  | { behavior: "deny"; message: string };

export type PermissionCallback = (
  request: unknown,
) => Promise<PermissionVerdict> | PermissionVerdict;

export interface CanUseToolFrame {
  type: "control_request";
  request_id: string;
  request: { subtype: "can_use_tool"; [k: string]: unknown };
}

export function isCanUseToolFrame(frame: unknown): frame is CanUseToolFrame {
  if (!frame || typeof frame !== "object") return false;
  const f = frame as { type?: unknown; request_id?: unknown; request?: unknown };
  if (f.type !== "control_request") return false;
  if (typeof f.request_id !== "string") return false;
  const req = f.request;
  if (!req || typeof req !== "object") return false;
  return (req as { subtype?: unknown }).subtype === "can_use_tool";
}

export function buildPermissionResponseFrame(
  requestId: string,
  verdict: PermissionVerdict,
): unknown {
  // The wire shape mirrors `control_response/success` with `response` carrying
  // the verdict body. The binary's controlSchemas expect this shape (see
  // canonical's `SuccessRequest.response: Record<string, unknown>`).
  return {
    type: "control_response",
    response: {
      subtype: "success",
      request_id: requestId,
      response: verdict,
    },
  };
}
