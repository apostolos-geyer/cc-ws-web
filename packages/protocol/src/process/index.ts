/**
 * `ClaudeProcess` — binary-side principal.
 *
 * Wraps any `Transport` with the Claude Code stream-json protocol-level
 * state machine + frame validation. Universal: zero runtime-specific
 * references — spawning a real binary is a transport-layer concern (see
 * `@cc-ws-server`'s `spawnTransport`).
 *
 * To "respawn", the caller `await proc.end()`s and constructs a new
 * `ClaudeProcess` with a fresh transport. No `respawn()` method on the
 * class — keeping lifecycle linear lets us assert state-machine
 * invariants and makes testing simpler.
 *
 * API:
 *   - `start()`  — sends `initialize`, awaits the `control_response/success`
 *                  ack, transitions to `ready`, warms validators.
 *   - `end()`    — sends `end_session`, awaits ack, transitions to `ended`,
 *                  closes the transport.
 *   - `send(f)`  — passes through to the transport (validates in strict mode).
 *   - `onFrame(h)` — handlers fire AFTER per-tier validation; rejected
 *                  frames increment `framesRejected` and never reach `h`.
 *   - `getState()` / `onStateChange(cb)` — lifecycle observability.
 *   - `onMetrics(cb)` — periodic snapshot of validation counters.
 */

import type { Frame, Transport } from "../transport/index";
import {
  validateFrame,
  warmupValidators,
  type ValidationMode,
} from "./validate";
import { LifecycleHolder, type ProcessState } from "./lifecycle";
import { makeRequestId } from "../shared/request-id";

export type { ProcessState } from "./lifecycle";
export { LineParser, frameToLine, parseLine } from "./framing";

export interface ClaudeProcessOptions {
  validation?: ValidationMode;
  /** Default false: stream_event frames bypass field validation. */
  validateStreamEvents?: boolean;
  /** Default 30000ms. How long to wait for `initialize` / `end_session` acks. */
  startTimeoutMs?: number;
  endTimeoutMs?: number;
}

export interface MetricsSnapshot {
  framesValidated: number;
  framesPassed: number;
  framesRejected: number;
  validationMicrosP50: number;
  validationMicrosP99: number;
}

export class ClaudeProcess {
  private readonly transport: Transport;
  private readonly mode: ValidationMode;
  private readonly validateStreamEvents: boolean;
  private readonly startTimeoutMs: number;
  private readonly endTimeoutMs: number;
  private readonly lifecycle = new LifecycleHolder();
  private readonly frameHandlers = new Set<(f: Frame) => void>();
  private readonly metricsSubscribers = new Set<{
    cb: (snap: MetricsSnapshot) => void;
    timer: ReturnType<typeof setInterval>;
  }>();

  // Pending control_request correlation — keyed by request_id. ClaudeProcess
  // tracks only the requests it generates itself (initialize, end_session).
  private readonly pending = new Map<
    string,
    { resolve: (frame: unknown) => void; reject: (e: Error) => void; subtype: string }
  >();

  // Metrics counters.
  private framesValidated = 0;
  private framesPassed = 0;
  private framesRejected = 0;
  private readonly samples: number[] = [];
  private static readonly MAX_SAMPLES = 1024;

  private unsubTransport: (() => void) | null = null;

  constructor(transport: Transport, opts: ClaudeProcessOptions = {}) {
    this.transport = transport;
    this.mode = opts.validation ?? "discriminator";
    this.validateStreamEvents = opts.validateStreamEvents ?? false;
    this.startTimeoutMs = opts.startTimeoutMs ?? 30_000;
    this.endTimeoutMs = opts.endTimeoutMs ?? 30_000;

    this.unsubTransport = transport.onFrame((frame) => this.handleInbound(frame));
  }

  // ------------------------------------------------------------------- I/O

  /**
   * Send `initialize`, await `control_response/success`, transition to
   * `ready`, warm validators.
   */
  async start(): Promise<void> {
    if (this.lifecycle.state !== "idle") {
      throw new Error(`ClaudeProcess.start: state must be idle, got ${this.lifecycle.state}`);
    }
    // Warm validators synchronously before the first frame lands.
    warmupValidators();
    const reqId = makeRequestId();
    const ack = this.expect(reqId, "initialize", this.startTimeoutMs);
    await this.transport.send({
      type: "control_request",
      request_id: reqId,
      request: { subtype: "initialize" },
    });
    await ack;
    this.lifecycle.set("ready");
  }

  /**
   * Send `end_session`, await ack, transition to `ended`, close transport.
   */
  async end(): Promise<void> {
    if (this.lifecycle.state === "ended") return;
    if (this.lifecycle.state === "ending") {
      // Already ending — wait for state to flip.
      await new Promise<void>((resolve) => {
        const unsub = this.lifecycle.subscribe((s) => {
          if (s === "ended") {
            unsub();
            resolve();
          }
        });
      });
      return;
    }
    // Pre-flight: if we never started, just close.
    if (this.lifecycle.state === "idle") {
      this.lifecycle.set("ended");
      await this.transport.close();
      return;
    }
    this.lifecycle.set("ending");
    const reqId = makeRequestId();
    const ack = this.expect(reqId, "end_session", this.endTimeoutMs);
    try {
      await this.transport.send({
        type: "control_request",
        request_id: reqId,
        request: { subtype: "end_session" },
      });
      // Best-effort: some binaries close before sending the ack. Race the
      // ack against transport close.
      await Promise.race([
        ack,
        new Promise<void>((r) => setTimeout(() => r(), this.endTimeoutMs)),
      ]);
    } catch {
      // ignore — we're tearing down anyway
    }
    this.lifecycle.set("ended");
    await this.transport.close();
    if (this.unsubTransport) {
      this.unsubTransport();
      this.unsubTransport = null;
    }
    for (const m of [...this.metricsSubscribers]) clearInterval(m.timer);
    this.metricsSubscribers.clear();
  }

  /**
   * Send a frame through the transport. In `strict` mode the frame is
   * validated before being passed to the transport; rejections throw.
   */
  async send(frame: Frame): Promise<void> {
    if (this.mode === "strict") {
      const r = validateFrame(frame, {
        mode: this.mode,
        validateStreamEvents: this.validateStreamEvents,
      });
      if (!r.ok) {
        throw new Error(`ClaudeProcess.send: outbound frame rejected — ${r.reason}`);
      }
    }
    await this.transport.send(frame);
  }

  /** Register an inbound-frame handler. Returns an unsubscribe fn. */
  onFrame(handler: (frame: Frame) => void): () => void {
    this.frameHandlers.add(handler);
    return () => {
      this.frameHandlers.delete(handler);
    };
  }

  // ---------------------------------------------------------------- state

  getState(): ProcessState {
    return this.lifecycle.state;
  }

  onStateChange(cb: (state: ProcessState) => void): () => void {
    return this.lifecycle.subscribe(cb);
  }

  // -------------------------------------------------------------- metrics

  onMetrics(
    cb: (snap: MetricsSnapshot) => void,
    intervalMs = 1000,
  ): () => void {
    const sub = {
      cb,
      timer: setInterval(() => cb(this.snapshotMetrics()), intervalMs),
    };
    this.metricsSubscribers.add(sub);
    return () => {
      clearInterval(sub.timer);
      this.metricsSubscribers.delete(sub);
    };
  }

  /** Synchronous metrics snapshot — handy for tests. */
  snapshotMetrics(): MetricsSnapshot {
    const sorted = [...this.samples].sort((a, b) => a - b);
    const p50 = percentile(sorted, 50);
    const p99 = percentile(sorted, 99);
    return {
      framesValidated: this.framesValidated,
      framesPassed: this.framesPassed,
      framesRejected: this.framesRejected,
      validationMicrosP50: p50,
      validationMicrosP99: p99,
    };
  }

  // ----------------------------------------------------------- internals

  private handleInbound(frame: Frame): void {
    this.framesValidated += 1;
    const r = validateFrame(frame, {
      mode: this.mode,
      validateStreamEvents: this.validateStreamEvents,
    });
    if (r.micros > 0) {
      this.samples.push(r.micros);
      if (this.samples.length > ClaudeProcess.MAX_SAMPLES) {
        this.samples.shift();
      }
    }
    if (!r.ok) {
      this.framesRejected += 1;
      return;
    }
    this.framesPassed += 1;

    // Resolve any pending control_request correlation BEFORE invoking user
    // handlers — so a handler can safely call `end()` from inside.
    this.tryResolvePending(frame);

    for (const h of [...this.frameHandlers]) {
      try {
        h(frame);
      } catch {
        // User handler throws are isolated — never propagate into the
        // transport's dispatch loop.
      }
    }
  }

  private expect(
    requestId: string,
    subtype: string,
    timeoutMs: number,
  ): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const to = setTimeout(() => {
        this.pending.delete(requestId);
        reject(
          new Error(
            `ClaudeProcess: timeout waiting for ${subtype} ack (request_id=${requestId})`,
          ),
        );
      }, timeoutMs);
      this.pending.set(requestId, {
        subtype,
        resolve: (f) => {
          clearTimeout(to);
          resolve(f);
        },
        reject: (e) => {
          clearTimeout(to);
          reject(e);
        },
      });
    });
  }

  private tryResolvePending(frame: Frame): void {
    if (!frame || typeof frame !== "object") return;
    const f = frame as { type?: unknown; response?: unknown };
    if (f.type !== "control_response") return;
    const resp = f.response;
    if (!resp || typeof resp !== "object") return;
    const r = resp as { request_id?: unknown; subtype?: unknown; error?: unknown };
    const id = typeof r.request_id === "string" ? r.request_id : null;
    if (!id) return;
    const pending = this.pending.get(id);
    if (!pending) return;
    this.pending.delete(id);
    if (r.subtype === "success") {
      pending.resolve(frame);
    } else if (r.subtype === "error") {
      const msg = typeof r.error === "string" ? r.error : "control_response/error";
      pending.reject(new Error(`ClaudeProcess: ${pending.subtype} → error: ${msg}`));
    } else {
      pending.resolve(frame);
    }
  }
}

function percentile(sortedAsc: number[], p: number): number {
  if (sortedAsc.length === 0) return 0;
  const idx = Math.min(sortedAsc.length - 1, Math.floor((p / 100) * sortedAsc.length));
  return sortedAsc[idx];
}
