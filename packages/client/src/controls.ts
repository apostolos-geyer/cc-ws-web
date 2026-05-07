import {
  isControlResponse,
  makeRequestId,
  type OutboundControlRequestSubtype,
  type InboundFrame,
} from "./protocol";
import type { WsClient } from "./ws";

// Callers that need request_id/subtype use .wrapper; most just read .inner
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
  ingest: (frame: InboundFrame) => boolean;
  // Bridge kills the claude child on respawn, so in-flight requests would
  // otherwise hang against a dead pipe until timeoutMs fires
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
    // Real binary may put request_id on outer envelope OR inside response
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
