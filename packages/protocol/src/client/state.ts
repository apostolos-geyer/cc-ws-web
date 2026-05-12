/**
 * `ClientState` + `StateHolder` — `ClaudeClient`'s in-memory session model.
 *
 * Holds the pieces a UI typically wants to render off-of (current session
 * id, last-set model / permission mode, message history, task state, the
 * queue of pending permission requests). Mutations happen synchronously
 * inside the inbound-frame handler; subscribers fire after each mutation
 * with the post-mutation snapshot.
 *
 * Intentionally *not* reactive. The Phase-4 `packages/client/src/reactive.ts`
 * wraps this with nanostores; until then, callers poll `getSnapshot()` or
 * subscribe.
 */

export type SessionState =
  | "idle"
  | "running"
  | "requires_action"
  | "ended";

export interface TaskState {
  id: string;
  status: "started" | "in_progress" | "completed" | "failed" | "cancelled";
  /** The latest progress / summary frame for this task. */
  lastFrame: unknown;
}

export interface PendingPermissionRequest {
  requestId: string;
  /** The inbound `can_use_tool` payload — passed through to the UI callback. */
  payload: unknown;
}

export interface ClientState {
  sessionId: string | null;
  sessionState: SessionState;
  lastModel: string | null;
  lastPermissionMode: string | null;
  /** Inbound `type:"assistant"` frames in arrival order. */
  messages: unknown[];
  /** Outbound `type:"user"` frames sent via `sendUserMessage()`. */
  userMessages: unknown[];
  /** Task state machine keyed by task id. */
  tasks: Record<string, TaskState>;
  /** Pending `can_use_tool` permission requests, keyed by request_id. */
  pendingPermissionRequests: Record<string, PendingPermissionRequest>;
}

export function initialClientState(): ClientState {
  return {
    sessionId: null,
    sessionState: "idle",
    lastModel: null,
    lastPermissionMode: null,
    messages: [],
    userMessages: [],
    tasks: {},
    pendingPermissionRequests: {},
  };
}

export class StateHolder {
  private state: ClientState = initialClientState();
  private subscribers = new Set<(state: ClientState) => void>();

  getSnapshot(): ClientState {
    return this.state;
  }

  subscribe(cb: (state: ClientState) => void): () => void {
    this.subscribers.add(cb);
    return () => this.subscribers.delete(cb);
  }

  /**
   * Apply a mutator and notify subscribers. We don't deep-clone — the
   * principal is "subscribers see the latest state, mutations are
   * synchronous". Callers should treat the returned snapshot as a read-only
   * reference.
   */
  update(mut: (s: ClientState) => void): void {
    mut(this.state);
    for (const s of [...this.subscribers]) s(this.state);
  }

  /**
   * Apply known mutations for a given inbound frame. Encapsulates the
   * frame-shape → state-shape mapping. Returns true if the state was
   * mutated.
   */
  applyInbound(frame: unknown): boolean {
    if (!frame || typeof frame !== "object") return false;
    const f = frame as Record<string, unknown>;
    const ty = typeof f.type === "string" ? (f.type as string) : null;
    const sub = typeof f.subtype === "string" ? (f.subtype as string) : null;

    // system/init carries the session id.
    if (ty === "system" && sub === "init") {
      const sid = typeof f.session_id === "string" ? (f.session_id as string) : null;
      this.update((s) => {
        if (sid) s.sessionId = sid;
        s.sessionState = "running";
      });
      return true;
    }

    // session_state_changed carries the new state.
    if (ty === "system" && sub === "session_state_changed") {
      const newState = typeof f.state === "string" ? (f.state as string) : null;
      if (newState === "idle" || newState === "running" || newState === "requires_action" || newState === "ended") {
        this.update((s) => {
          s.sessionState = newState;
        });
        return true;
      }
      return false;
    }

    // assistant message frames append to the history.
    if (ty === "assistant") {
      this.update((s) => {
        s.messages.push(frame);
      });
      return true;
    }

    // Task lifecycle subtypes from the system namespace.
    if (ty === "system" && sub && (sub === "task_started" || sub === "task_progress" || sub === "task_updated" || sub === "task_notification" || sub === "task_summary")) {
      const tid = typeof f.task_id === "string" ? (f.task_id as string) : null;
      if (!tid) return false;
      const status =
        sub === "task_started"
          ? "started"
          : sub === "task_progress" || sub === "task_updated"
            ? "in_progress"
            : sub === "task_summary"
              ? "completed"
              : "in_progress";
      this.update((s) => {
        s.tasks[tid] = {
          id: tid,
          status: status as TaskState["status"],
          lastFrame: frame,
        };
      });
      return true;
    }

    // can_use_tool comes in as a control_request whose request payload has
    // subtype: "can_use_tool". Permission-request state.
    if (ty === "control_request") {
      const req = f.request as Record<string, unknown> | undefined;
      const reqSub = req && typeof req.subtype === "string" ? (req.subtype as string) : null;
      const rid = typeof f.request_id === "string" ? (f.request_id as string) : null;
      if (reqSub === "can_use_tool" && rid) {
        this.update((s) => {
          s.pendingPermissionRequests[rid] = { requestId: rid, payload: req };
          s.sessionState = "requires_action";
        });
        return true;
      }
    }

    return false;
  }

  /** Record a permission-request resolution (callback returned a verdict). */
  resolvePermissionRequest(requestId: string): void {
    this.update((s) => {
      delete s.pendingPermissionRequests[requestId];
      if (Object.keys(s.pendingPermissionRequests).length === 0) {
        // Best-effort: if we were waiting on a permission and there are no
        // more pending, return to "running". A real session_state_changed
        // frame will overwrite this.
        if (s.sessionState === "requires_action") s.sessionState = "running";
      }
    });
  }

  /** Record an outbound user-message frame. */
  recordUserMessage(frame: unknown): void {
    this.update((s) => {
      s.userMessages.push(frame);
    });
  }

  /** Record an outbound intent that affects state (set_model, set_permission_mode). */
  recordIntent(kind: "set_model" | "set_permission_mode", value: string): void {
    this.update((s) => {
      if (kind === "set_model") s.lastModel = value;
      else if (kind === "set_permission_mode") s.lastPermissionMode = value;
    });
  }

  /** Mark the session ended. */
  markEnded(): void {
    this.update((s) => {
      s.sessionState = "ended";
    });
  }
}
