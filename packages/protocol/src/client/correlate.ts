/**
 * `RequestIdCorrelator` — map outbound `control_request.request_id` →
 * promise resolvers for inbound `control_response`.
 *
 * `ClaudeClient`'s intent methods each generate a request_id, register a
 * pending entry here, write the wire frame, and return the resulting
 * promise. When the matching `control_response/success` arrives the
 * promise resolves with the response payload; `control_response/error`
 * rejects with an `Error` carrying the binary's message.
 *
 * Each pending entry has its own timer; the default is 30s but can be
 * overridden per request. Cleanup runs on resolve/reject/timeout.
 */

export interface Pending<T = unknown> {
  resolve: (value: T) => void;
  reject: (err: Error) => void;
  subtype: string;
  timer: ReturnType<typeof setTimeout>;
}

export class RequestIdCorrelator {
  private readonly pending = new Map<string, Pending>();

  /** Register a pending request, returning the promise the caller awaits. */
  register<T = unknown>(
    requestId: string,
    subtype: string,
    timeoutMs: number,
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId);
        reject(
          new Error(
            `ClaudeClient: timeout waiting for ${subtype} response (request_id=${requestId})`,
          ),
        );
      }, timeoutMs);
      this.pending.set(requestId, {
        resolve: resolve as (value: unknown) => void,
        reject,
        subtype,
        timer,
      });
    });
  }

  /**
   * Try to resolve a pending entry from an inbound frame. Returns true if
   * the frame matched a pending request.
   */
  tryResolve(frame: unknown): boolean {
    if (!frame || typeof frame !== "object") return false;
    const f = frame as { type?: unknown; response?: unknown };
    if (f.type !== "control_response") return false;
    const resp = f.response;
    if (!resp || typeof resp !== "object") return false;
    const r = resp as { request_id?: unknown; subtype?: unknown; error?: unknown; response?: unknown };
    const id = typeof r.request_id === "string" ? r.request_id : null;
    if (!id) return false;
    const pending = this.pending.get(id);
    if (!pending) return false;
    this.pending.delete(id);
    clearTimeout(pending.timer);
    if (r.subtype === "success") {
      // Forward the inner `response` payload (or the whole response object if
      // no nested payload), so callers get a useful return value.
      pending.resolve(r.response ?? null);
    } else if (r.subtype === "error") {
      const msg = typeof r.error === "string" ? r.error : "control_response/error";
      pending.reject(new Error(`ClaudeClient: ${pending.subtype} → error: ${msg}`));
    } else {
      pending.resolve(resp);
    }
    return true;
  }

  /** Reject all pending entries — used during teardown. */
  rejectAll(err: Error): void {
    for (const [id, p] of this.pending) {
      clearTimeout(p.timer);
      p.reject(err);
      this.pending.delete(id);
    }
  }

  get size(): number {
    return this.pending.size;
  }
}
