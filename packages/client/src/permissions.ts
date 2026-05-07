// With --permission-prompt-tool=stdio the binary sends inbound
// control_request{subtype:"can_use_tool"} and waits for a nested
// control_response. If onCanUseTool is provided it wins; the queue
// is then transient and callers should not consume it from UI.

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
  id: string;
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
  // After respawn/disconnect the issuing claude is dead, so replies
  // would go nowhere; queue is stale UI clutter
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
      Promise.resolve(opts.onCanUseTool(entry))
        .then((decision) => reply(entry.id, decision, entry.input))
        .catch((err) => {
          console.error("[permissions] onCanUseTool threw", err);
          reply(entry.id, { behavior: "deny", message: "handler error" }, entry.input);
        });
    } else {
      pendingPermissions.set([...pendingPermissions.get(), entry]);
    }
    return true;
  }

  function clearQueue() {
    pendingPermissions.set([]);
  }

  return { pendingPermissions, ingest, respond, clearQueue };
}
