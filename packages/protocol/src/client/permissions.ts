/**
 * `permissions.ts` — `can_use_tool` callback flow + UI-shape aggregation.
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
 *
 * The aggregator also surfaces `PendingPermission[]` — a UI-friendly
 * shape with the toolName / input flattened out — for consumers that
 * want to render the queue directly (e.g. when no `onCanUseTool` callback
 * is wired, the queue serves as the UI state).
 */

import { isControlRequest, type CanUseToolRequest, type InboundFrame } from "./frames";

// ---------- verdict / callback (transport-level) ----------

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
  return {
    type: "control_response",
    response: {
      subtype: "success",
      request_id: requestId,
      response: verdict,
    },
  };
}

// ---------- UI-shape decision + aggregator ----------

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

export interface PermissionsSnapshot {
  pendingPermissions: PendingPermission[];
}

export interface PermissionsAggregator {
  getSnapshot(): PermissionsSnapshot;
  /** Ingest an inbound frame; returns true if it was a can_use_tool. */
  ingest(frame: InboundFrame): boolean;
  /** Resolve a queued request with a UI verdict. */
  respond(id: string, decision: PermissionDecision): void;
  /** Drop everything in the queue (used on respawn/disconnect). */
  clearQueue(): void;
}

export interface PermissionsAggregatorOptions {
  /** Called to write the `control_response` back over the wire. */
  send(frame: unknown): void | Promise<void>;
  /** If provided, the queue is transient — the callback decides and we don't surface anything. */
  onCanUseTool?: OnCanUseTool;
  onChange?: (snap: PermissionsSnapshot) => void;
}

export function createPermissionsAggregator(
  opts: PermissionsAggregatorOptions,
): PermissionsAggregator {
  const onChange = opts.onChange ?? (() => {});
  let pendingPermissions: PendingPermission[] = [];

  function emit() {
    onChange({ pendingPermissions });
  }

  function reply(id: string, decision: PermissionDecision, originalInput: unknown) {
    const inner =
      decision.behavior === "allow"
        ? { behavior: "allow" as const, updatedInput: decision.updatedInput ?? originalInput ?? {} }
        : { behavior: "deny" as const, message: decision.message ?? "Denied by user" };
    void Promise.resolve(
      opts.send({
        type: "control_response",
        response: {
          subtype: "success",
          request_id: id,
          response: inner,
        },
      }),
    ).catch(() => undefined);
  }

  function respond(id: string, decision: PermissionDecision) {
    const entry = pendingPermissions.find((p) => p.id === id);
    if (!entry) return;
    pendingPermissions = pendingPermissions.filter((p) => p.id !== id);
    reply(id, decision, entry.input);
    emit();
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
          // eslint-disable-next-line no-console
          console.error("[permissions] onCanUseTool threw", err);
          reply(entry.id, { behavior: "deny", message: "handler error" }, entry.input);
        });
    } else {
      pendingPermissions = [...pendingPermissions, entry];
      emit();
    }
    return true;
  }

  function clearQueue() {
    if (pendingPermissions.length === 0) return;
    pendingPermissions = [];
    emit();
  }

  return {
    getSnapshot: () => ({ pendingPermissions }),
    ingest,
    respond,
    clearQueue,
  };
}
