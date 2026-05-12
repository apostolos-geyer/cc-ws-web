/**
 * `ClaudeClient` — consumer-side principal.
 *
 * Wraps any `Transport`. Translates intent-level operations
 * (`setPermissionMode("plan")`, `interrupt()`, `sendUserMessage(text)`)
 * into typed outbound frames; correlates `request_id`s back to promises;
 * tracks session state, message history, task state, shell entries, hook
 * events, and pending permission requests via an embedded `StateHolder`.
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
  type OnCanUseTool,
  type PendingPermission,
  type PermissionCallback,
  type PermissionDecision,
} from "./permissions";
import {
  buildControlRequest,
  buildUserMessage,
  buildBashCommandMessage,
} from "./intents";
import { makeRequestId } from "../shared/request-id";
import type { InboundFrame, UserContentBlock } from "./frames";
import type { MessageEntry } from "./messages";

export type {
  ClientState,
  SessionState,
  InitData,
} from "./state";
export type {
  PermissionVerdict,
  PermissionCallback,
  PermissionDecision,
  PendingPermission,
  OnCanUseTool,
} from "./permissions";
export type {
  MessageEntry,
  LocalUserEntry,
  FrameEntry,
  StreamingEntry,
  InFlightMessage,
  StreamingBlock,
  TextBlock,
  ToolUseBlock,
  ThinkingBlock,
} from "./messages";
export type {
  TaskEntry,
  TaskStatus,
  TaskUsage,
} from "./tasks";
export type {
  ShellEntry,
  ShellSource,
  BashFrame,
} from "./shell";
export type {
  HookEntry,
  HookSubtype,
} from "./hooks";

export interface ClaudeClientOptions {
  /** Low-level callback (raw frame payload). */
  onPermissionRequest?: PermissionCallback;
  /** Higher-level UI callback (PendingPermission entry with toolName/input flattened). */
  onCanUseTool?: OnCanUseTool;
  /** Default 30000ms. */
  requestTimeoutMs?: number;
  /** Test seam — defaults to `Date.now()`. */
  now?: () => number;
  /** Test seam — defaults to `crypto.randomUUID()`. */
  newId?: () => string;
}

export class ClaudeClient {
  private readonly transport: Transport;
  private readonly correlator = new RequestIdCorrelator();
  private readonly stateHolder: StateHolder;
  private readonly frameHandlers = new Set<(f: Frame) => void>();
  private permissionCallback: PermissionCallback | null;
  private readonly requestTimeoutMs: number;
  private unsubTransport: (() => void) | null = null;

  constructor(transport: Transport, opts: ClaudeClientOptions = {}) {
    this.transport = transport;
    this.permissionCallback = opts.onPermissionRequest ?? null;
    this.requestTimeoutMs = opts.requestTimeoutMs ?? 30_000;

    this.stateHolder = new StateHolder({
      transport,
      onCanUseTool: opts.onCanUseTool,
      now: opts.now,
      newId: opts.newId,
    });
    // Wire shell follow-up to sendUserMessage on the client itself.
    this.stateHolder.setSendUserMessage((text) => {
      void this.sendUserMessage(text);
    });
    this.unsubTransport = transport.onFrame((frame) => this.handleInbound(frame));
  }

  // ============================================================ Intents

  setPermissionMode(mode: string): Promise<void> {
    this.stateHolder.beginModeChange(mode);
    return this.intent("set_permission_mode", { mode })
      .then(() => {
        this.stateHolder.resolveModeChange(mode);
      })
      .catch((err: Error) => {
        this.stateHolder.failModeChange(err.message);
        throw err;
      });
  }

  setModel(model: string): Promise<void> {
    this.stateHolder.beginModelChange(model);
    return this.intent("set_model", { model })
      .then(() => {
        this.stateHolder.resolveModelChange(model);
      })
      .catch((err: Error) => {
        this.stateHolder.failModelChange(err.message);
        throw err;
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

  /** Cancel a specific task without ending the current turn. */
  stopTask(taskId: string): Promise<void> {
    return this.intent("stop_task", { task_id: taskId }).then(() => undefined);
  }

  /**
   * Send a free-form user message. Fire-and-forget — the binary's reply
   * stream is observed via `onFrame` / `getSnapshot()`.
   *
   * Drains any pending bash-context XML from the shell aggregator and
   * prepends it to the outbound payload.
   */
  async sendUserMessage(text: string | UserContentBlock[] = ""): Promise<void> {
    if (typeof text === "string") {
      const trimmed = text.trim();
      if (!trimmed && !this.stateHolder.shell.hasPending()) return;
      const payload = this.stateHolder.shell.drainPending(text);
      this.stateHolder.pushLocalUserMessage(text);
      const frame = buildUserMessage(payload);
      await this.transport.send(frame);
      this.stateHolder.recordUserMessage(frame);
      return;
    }
    // structured content — no drain semantics
    const frame = buildUserMessage(text);
    await this.transport.send(frame);
    this.stateHolder.recordUserMessage(frame);
  }

  /** Send a bash command frame to the binary. */
  async bashCommand(command: string): Promise<void> {
    await this.transport.send(buildBashCommandMessage(command));
  }

  /** Buffer a bash exchange to be prepended to the next user message. */
  sendShellContext(command: string, followUp?: string): void {
    this.stateHolder.shell.sendShellContext(command, followUp);
  }

  /** Fire-and-forget bash; output goes to ShellEntry only. */
  sendBashSideChannel(command: string): void {
    this.stateHolder.shell.sendBashSideChannel(command);
  }

  /** Remove a ShellEntry from the active list. */
  dismissShellEntry(id: string): void {
    this.stateHolder.shell.dismissShellEntry(id);
  }

  /** UI hook to resolve a queued permission request. */
  respondToPermission(id: string, decision: PermissionDecision): void {
    this.stateHolder.respondToPermission(id, decision);
  }

  /** Send `end_session` and resolve when its ack lands. */
  endSession(): Promise<void> {
    return this.intent("end_session").then(() => {
      this.stateHolder.markEnded();
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
    return this.stateHolder.getSnapshot();
  }

  onStateChange(cb: (snap: ClientState) => void): () => void {
    return this.stateHolder.subscribe(cb);
  }

  /** Register / replace the permission-request callback at runtime. */
  setPermissionCallback(cb: PermissionCallback | null): void {
    this.permissionCallback = cb;
  }

  /** Hydrate the messages timeline (persistence-restore path). */
  hydrateMessages(entries: MessageEntry[]): void {
    this.stateHolder.hydrateMessages(entries);
  }

  /** Seed activeMode before first init (persistence-restore path). */
  seedMode(mode: string | null): void {
    this.stateHolder.seedMode(mode);
  }

  /** Seed activeModel before first init (persistence-restore path). */
  seedModel(model: string | null): void {
    this.stateHolder.seedModel(model);
  }

  /** Reject all in-flight intent promises (used on respawn / disconnect). */
  abortAllIntents(reason: string): void {
    this.correlator.rejectAll(new Error(reason));
  }

  /** Drop the pending-permissions queue (used on respawn / disconnect). */
  clearPermissionsQueue(): void {
    this.stateHolder.clearPermissionsQueue();
  }

  /** Reset all in-session aggregations (timeline, tasks, shell, hooks). */
  resetTimeline(): void {
    this.stateHolder.resetTimeline();
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
    // 1. Permission-request short-circuit (low-level onPermissionRequest):
    //    if the *raw* callback is wired, it short-circuits the higher-level
    //    UI aggregation entirely — the callback owns the reply. We still
    //    bump sessionState so observers can react.
    if (isCanUseToolFrame(frame) && this.permissionCallback) {
      const rid = frame.request_id;
      const cb = this.permissionCallback;
      this.stateHolder.update((s) => {
        s.sessionState = "requires_action";
      });
      Promise.resolve(cb(frame.request))
        .then((verdict) => {
          const response = buildPermissionResponseFrame(rid, verdict);
          return this.transport.send(response);
        })
        .catch((err) => {
          const response = buildPermissionResponseFrame(rid, {
            behavior: "deny",
            message: `permission callback threw: ${String(err)}`,
          });
          this.transport.send(response).catch(() => undefined);
        });
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

    // 3. State updates (includes the high-level UI permissions flow).
    this.stateHolder.applyInbound(frame as InboundFrame);

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
