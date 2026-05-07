// can_use_tool gate. The binary sends INBOUND control_request frames with
// subtype:"can_use_tool" when --permission-prompt-tool=stdio is set. We must
// reply with a CanUseToolResponseFrame (nested envelope) carrying either an
// allow or a deny.
//
// Two consumer surfaces share the same machinery:
//   1. promise callback — pass `onCanUseTool` to createCcSession; we resolve
//      it for each request and dispatch the result.
//   2. queue + respondToPermission — subscribe to the `pendingPermissions`
//      atom, render UI, call respondToPermission(id, decision).
// If `onCanUseTool` is provided it wins; the queue is then transient and
// callers should not consume it from UI.

import { atom, type WritableAtom } from "nanostores";
import {
  isControlRequest,
  type CanUseToolRequest,
  type InboundFrame,
} from "./protocol";
import type { WsClient } from "./ws";

export type PermissionDecision =
  | { behavior: "allow"; updatedInput?: unknown }
  | { behavior: "deny"; message?: string };

export type PendingPermission = {
  id: string;          // request_id we'll reply to
  toolName: string;
  input: unknown;
  raw: CanUseToolRequest;
};

export type OnCanUseTool = (
  req: PendingPermission,
) => Promise<PermissionDecision> | PermissionDecision;

export type PermissionsController = {
  pendingPermissions: WritableAtom<PendingPermission[]>;
  ingest: (frame: InboundFrame) => boolean;
  respond: (id: string, decision: PermissionDecision) => void;
  // Drop every queued can_use_tool request without replying. Called by
  // session respawn/disconnect — the issuing claude is dead, so any reply
  // would go nowhere; the queue is stale UI clutter.
  clearQueue: () => void;
};

export function createPermissionsController(opts: {
  ws: WsClient;
  onCanUseTool?: OnCanUseTool;
}): PermissionsController {
  const pendingPermissions = atom<PendingPermission[]>([]);

  function reply(id: string, decision: PermissionDecision, originalInput: unknown) {
    const inner =
      decision.behavior === "allow"
        ? { behavior: "allow" as const, updatedInput: decision.updatedInput ?? originalInput ?? {} }
        : { behavior: "deny" as const, message: decision.message ?? "Denied by user" };
    opts.ws.send({
      type: "control_response",
      response: {
        subtype: "success",
        request_id: id,
        response: inner,
      },
    });
  }

  function respond(id: string, decision: PermissionDecision) {
    const queue = pendingPermissions.get();
    const entry = queue.find((p) => p.id === id);
    if (!entry) return;
    pendingPermissions.set(queue.filter((p) => p.id !== id));
    reply(id, decision, entry.input);
  }

  function ingest(frame: InboundFrame): boolean {
    if (!isControlRequest(frame) || frame.request.subtype !== "can_use_tool") return false;
    const cr = frame as CanUseToolRequest;
    const entry: PendingPermission = {
      id: cr.request_id,
      toolName: cr.request.tool_name ?? "?",
      input: cr.request.input ?? {},
      raw: cr,
    };
    if (opts.onCanUseTool) {
      // Promise-style: resolve immediately, never enqueue.
      Promise.resolve(opts.onCanUseTool(entry))
        .then((decision) => reply(entry.id, decision, entry.input))
        .catch((err) => {
          console.error("[permissions] onCanUseTool threw", err);
          reply(entry.id, { behavior: "deny", message: "handler error" }, entry.input);
        });
    } else {
      // Queue-style: append for the consumer to handle via respond().
      pendingPermissions.set([...pendingPermissions.get(), entry]);
    }
    return true;
  }

  function clearQueue() {
    pendingPermissions.set([]);
  }

  return { pendingPermissions, ingest, respond, clearQueue };
}
