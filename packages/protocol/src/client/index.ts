/**
 * `ClaudeClient` — consumer-side principal.
 *
 * Wraps any `Transport`. Translates intent-level operations
 * (`setPermissionMode("plan")`, `interrupt()`, `sendUserMessage(text)`)
 * into typed outbound frames; correlates `request_id`s back to promises;
 * tracks session state, message history, task state, and pending
 * permission requests.
 *
 * `ClaudeClient` does NOT validate inbound frames — it trusts whatever
 * the transport delivers (the binary-side `ClaudeProcess` is what owns
 * validation when both principals exist). It DOES synchronously update
 * `ClientState` from inbound frames and resolve correlated promises.
 *
 * Universal: zero runtime-specific references (no spawn, no streams).
 */

import type { Frame, Transport } from "../transport/index";
import { RequestIdCorrelator } from "./correlate";
import { StateHolder, type ClientState } from "./state";
import {
  isCanUseToolFrame,
  buildPermissionResponseFrame,
  type PermissionCallback,
} from "./permissions";
import {
  buildControlRequest,
  buildUserMessage,
  buildBashCommandMessage,
} from "./intents";
import { makeRequestId } from "../shared/request-id";

export type { ClientState } from "./state";
export type { PermissionVerdict, PermissionCallback } from "./permissions";

export interface ClaudeClientOptions {
  onPermissionRequest?: PermissionCallback;
  /** Default 30000ms. */
  requestTimeoutMs?: number;
}

export class ClaudeClient {
  private readonly transport: Transport;
  private readonly correlator = new RequestIdCorrelator();
  private readonly state = new StateHolder();
  private readonly frameHandlers = new Set<(f: Frame) => void>();
  private permissionCallback: PermissionCallback | null;
  private readonly requestTimeoutMs: number;
  private unsubTransport: (() => void) | null = null;

  constructor(transport: Transport, opts: ClaudeClientOptions = {}) {
    this.transport = transport;
    this.permissionCallback = opts.onPermissionRequest ?? null;
    this.requestTimeoutMs = opts.requestTimeoutMs ?? 30_000;
    this.unsubTransport = transport.onFrame((frame) => this.handleInbound(frame));
  }

  // ============================================================ Intents

  setPermissionMode(mode: string): Promise<void> {
    return this.intent("set_permission_mode", { mode }).then(() => {
      this.state.recordIntent("set_permission_mode", mode);
    });
  }

  setModel(model: string): Promise<void> {
    return this.intent("set_model", { model }).then(() => {
      this.state.recordIntent("set_model", model);
    });
  }

  setMaxThinkingTokens(maxThinkingTokens: number): Promise<void> {
    return this.intent("set_max_thinking_tokens", {
      max_thinking_tokens: maxThinkingTokens,
    }).then(() => undefined);
  }

  interrupt(): Promise<void> {
    return this.intent("interrupt").then(() => undefined);
  }

  getSettings(): Promise<unknown> {
    return this.intent("get_settings");
  }

  getContextUsage(): Promise<unknown> {
    return this.intent("get_context_usage");
  }

  getSessionCost(): Promise<unknown> {
    return this.intent("get_session_cost");
  }

  getBinaryVersion(): Promise<unknown> {
    return this.intent("get_binary_version");
  }

  fileSuggestions(query: string): Promise<unknown> {
    return this.intent("file_suggestions", { query });
  }

  mcpStatus(): Promise<unknown> {
    return this.intent("mcp_status");
  }

  reloadPlugins(): Promise<void> {
    return this.intent("reload_plugins").then(() => undefined);
  }

  applyFlagSettings(): Promise<void> {
    return this.intent("apply_flag_settings").then(() => undefined);
  }

  seedReadState(): Promise<void> {
    return this.intent("seed_read_state").then(() => undefined);
  }

  /**
   * Send a free-form user message. Fire-and-forget — the binary's reply
   * stream is observed via `onFrame` / `getSnapshot()`.
   */
  async sendUserMessage(text: string): Promise<void> {
    const frame = buildUserMessage(text);
    await this.transport.send(frame);
    this.state.recordUserMessage(frame);
  }

  /** Send a bash command frame to the binary. */
  async bashCommand(command: string): Promise<void> {
    await this.transport.send(buildBashCommandMessage(command));
  }

  /** Send `end_session` and resolve when its ack lands. */
  endSession(): Promise<void> {
    return this.intent("end_session").then(() => {
      this.state.markEnded();
    });
  }

  // ===================================================== Frame access

  onFrame(handler: (frame: Frame) => void): () => void {
    this.frameHandlers.add(handler);
    return () => {
      this.frameHandlers.delete(handler);
    };
  }

  // ======================================================== State

  getSnapshot(): ClientState {
    return this.state.getSnapshot();
  }

  onStateChange(cb: (snap: ClientState) => void): () => void {
    return this.state.subscribe(cb);
  }

  /** Register / replace the permission-request callback at runtime. */
  setPermissionCallback(cb: PermissionCallback | null): void {
    this.permissionCallback = cb;
  }

  /** Tear down — unsubscribes from the transport and rejects pending intents. */
  async dispose(): Promise<void> {
    if (this.unsubTransport) {
      this.unsubTransport();
      this.unsubTransport = null;
    }
    this.correlator.rejectAll(new Error("ClaudeClient: disposed"));
  }

  // ====================================================== Internals

  private intent(subtype: string, payload: Record<string, unknown> = {}): Promise<unknown> {
    const requestId = makeRequestId();
    const promise = this.correlator.register(requestId, subtype, this.requestTimeoutMs);
    const frame = buildControlRequest(requestId, subtype, payload);
    // Send AFTER registering — if the transport mirrors synchronously
    // (inMemoryPair) the response could arrive inside `send` and we need the
    // correlator entry already in place.
    this.transport.send(frame).catch((err: Error) => {
      this.correlator.rejectAll(err);
    });
    return promise;
  }

  private handleInbound(frame: Frame): void {
    // 1. Permission-request short-circuit: if this is a can_use_tool, hand
    //    off to the callback and post the response asynchronously.
    if (isCanUseToolFrame(frame)) {
      // Record in state immediately so a snapshot reflects the pending request.
      this.state.applyInbound(frame);
      const rid = frame.request_id;
      const cb = this.permissionCallback;
      if (cb) {
        Promise.resolve(cb(frame.request))
          .then((verdict) => {
            const response = buildPermissionResponseFrame(rid, verdict);
            return this.transport.send(response);
          })
          .then(() => {
            this.state.resolvePermissionRequest(rid);
          })
          .catch((err) => {
            // Surface as a denial — fail-closed when the callback throws.
            const response = buildPermissionResponseFrame(rid, {
              behavior: "deny",
              message: `permission callback threw: ${String(err)}`,
            });
            this.transport.send(response).catch(() => undefined);
            this.state.resolvePermissionRequest(rid);
          });
      }
      // Still notify user handlers so they can see the raw frame.
      for (const h of [...this.frameHandlers]) {
        try {
          h(frame);
        } catch {
          // user handler errors are isolated
        }
      }
      return;
    }

    // 2. Correlate any control_response.
    this.correlator.tryResolve(frame);

    // 3. State updates.
    this.state.applyInbound(frame);

    // 4. Fan out to user handlers.
    for (const h of [...this.frameHandlers]) {
      try {
        h(frame);
      } catch {
        // user handler errors are isolated
      }
    }
  }
}
