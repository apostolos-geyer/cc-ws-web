// Control-request layer. Tracks every outbound control_request by request_id
// and resolves a Promise when its matching control_response arrives. Higher
// layers (session.ts) compose this for set_permission_mode / set_model /
// get_settings / file_suggestions / interrupt / end_session.

import {
  isControlResponse,
  makeRequestId,
  type OutboundControlRequestSubtype,
  type InboundFrame,
} from "./protocol";
import type { WsClient } from "./ws";

// The wrapper carries the canonical control_response payload (we hand
// both back so callers that need the request_id or subtype can dig in;
// most just read .inner).
export type ControlResponseResult = {
  inner: unknown;
  wrapper: { subtype: "success"; request_id: string; response?: unknown };
};

type Resolver = {
  resolve: (response: ControlResponseResult) => void;
  reject: (error: string) => void;
  timeoutId: ReturnType<typeof setTimeout>;
};

export type ControlsClient = {
  request: (
    request: OutboundControlRequestSubtype,
    opts?: { timeoutMs?: number },
  ) => Promise<ControlResponseResult>;
  // For frames we DIDN'T initiate (can_use_tool comes IN as control_request).
  // Returns true if the frame was handled (we matched it to an in-flight
  // request).
  ingest: (frame: InboundFrame) => boolean;
  // Reject every in-flight request with `reason`. Called from session
  // respawn/disconnect — the bridge kills the old claude child the
  // moment we send respawn, so any outstanding control_request would
  // otherwise hang against a dead pipe until its timeoutMs fires.
  abortAll: (reason: string) => void;
};

export function createControlsClient(ws: WsClient): ControlsClient {
  const inflight = new Map<string, Resolver>();

  function request(
    body: OutboundControlRequestSubtype,
    opts: { timeoutMs?: number } = {},
  ): Promise<ControlResponseResult> {
    const requestId = makeRequestId();
    const timeoutMs = opts.timeoutMs ?? 30_000;
    return new Promise<ControlResponseResult>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        if (!inflight.has(requestId)) return;
        inflight.delete(requestId);
        reject(`timed out after ${timeoutMs}ms`);
      }, timeoutMs);
      inflight.set(requestId, { resolve, reject, timeoutId });
      ws.send({
        type: "control_request",
        request_id: requestId,
        request: body,
      });
    });
  }

  function ingest(frame: InboundFrame): boolean {
    if (!isControlResponse(frame)) return false;
    // Real binary wire format may put request_id either at the outer
    // envelope OR inside response. Check both before giving up.
    const id = frame.response.request_id ?? frame.request_id;
    if (!id) return false;
    const r = inflight.get(id);
    if (!r) return false;
    inflight.delete(id);
    clearTimeout(r.timeoutId);
    if (frame.response.subtype === "success") {
      r.resolve({ inner: frame.response.response, wrapper: frame.response });
    } else {
      r.reject(frame.response.error ?? "unknown error");
    }
    return true;
  }

  function abortAll(reason: string) {
    for (const [id, r] of inflight) {
      clearTimeout(r.timeoutId);
      r.reject(reason);
      inflight.delete(id);
    }
  }

  return { request, ingest, abortAll };
}
