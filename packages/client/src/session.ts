// Session controller — composes ws + messages + controls + permissions into a
// single reactive client. See LIB-DESIGN.md for the full API contract.

import { atom, type ReadableAtom } from "nanostores";
import { createControlsClient } from "./controls";
import { createMessagesController, type MessageEntry } from "./messages";
import { createTasksController, type TaskEntry } from "./tasks";
import {
  KNOWN_PERMISSION_MODES,
  KNOWN_EFFORTS,
  CYCLE_ORDER,
  nextCycleMode,
  type Effort,
  type Model,
  type PermissionMode,
} from "./modes";
import { createPermissionsController, type OnCanUseTool, type PendingPermission, type PermissionDecision } from "./permissions";
import {
  installPersistenceWriter,
  loadPersisted,
  resolvePersistence,
  type CcPersistenceOptions,
} from "./persistence";
import {
  buildSpawnArgs,
  isLocalRespawnResult,
  isSystemFrame,
  makeRequestId,
  type InboundFrame,
  type SessionMode,
  type SystemInit,
  type SystemSessionStateChanged,
  type SystemHook,
} from "./protocol";
import { createShellController, type ShellEntry } from "./shell";
import { createWsClient, type WsClient, type WsStatus } from "./ws";

// ---------- public types ----------

export type HookEntry = {
  id: string;
  ts: number;
  subtype: "hook_started" | "hook_progress" | "hook_response";
  hookName?: string;
  raw: SystemHook;
};

export type { ShellEntry, ShellSource } from "./shell";
export type { TaskEntry, TaskStatus, TaskUsage } from "./tasks";

// hookEvents is plain FIFO drop-oldest — long-running sessions with chatty
// hooks accumulate thousands of entries otherwise.
const HOOK_EVENTS_CAP = 200;

function capRingFifo<T>(arr: T[], cap: number): T[] {
  return arr.length > cap ? arr.slice(arr.length - cap) : arr;
}

// session_state_changed: tracks whether claude is mid-turn or idle. Useful
// for UI affordances (show / hide spinner; prevent send while busy).
export type SessionState = "idle" | "running" | "requires_action" | "unknown";

export type InitData = {
  sessionId: string | null;
  model: string | null;
  cwd: string | null;
  agents: string[];
  slashCommands: string[];
  skills: string[];
};

export type CcAtoms = {
  status: ReadableAtom<WsStatus>;
  lastError: ReadableAtom<string | null>;
  init: ReadableAtom<InitData>;
  messages: ReadableAtom<MessageEntry[]>;
  activeStreamId: ReadableAtom<string | null>;
  activeMode: ReadableAtom<PermissionMode>;
  pendingMode: ReadableAtom<PermissionMode | null>;
  modeError: ReadableAtom<string | null>;
  activeModel: ReadableAtom<string>;
  pendingModel: ReadableAtom<string | null>;
  modelError: ReadableAtom<string | null>;
  activeEffort: ReadableAtom<Effort | "">;
  pendingEffort: ReadableAtom<Effort | null>;
  effortError: ReadableAtom<string | null>;
  pendingPermissions: ReadableAtom<PendingPermission[]>;
  hookEvents: ReadableAtom<HookEntry[]>;
  shellEntries: ReadableAtom<ShellEntry[]>;
  tasks: ReadableAtom<TaskEntry[]>;
  sessionState: ReadableAtom<SessionState>;
};

export type { CcPersistenceOptions, StorageLike } from "./persistence";

export type CcSessionOptions = {
  url: string;
  args?: {
    mode?: SessionMode;
    permissionMode?: PermissionMode;
    permissionPromptTool?: string | null;
    includePartialMessages?: boolean;
    includeHookEvents?: boolean;
    effort?: Effort;
    model?: Model | string;
  };
  onCanUseTool?: OnCanUseTool;
  onTrace?: (dir: "in" | "out", line: string) => void;
  persistence?: CcPersistenceOptions | false;
  // Test seam: inject a pre-built WS client (e.g. an in-memory fake) instead
  // of constructing one from `url`. The injected client must satisfy the
  // same WsClient contract.
  wsClient?: WsClient;
};

export type CcSession = {
  atoms: CcAtoms;
  connect: () => void;
  disconnect: () => void;
  sendMessage: (text: string) => void;
  sendShellContext: (command: string, followUp?: string) => void;
  sendBashSideChannel: (command: string) => void;
  interrupt: () => Promise<void>;
  endSession: () => Promise<void>;
  setPermissionMode: (mode: PermissionMode) => Promise<void>;
  cyclePermissionMode: () => Promise<void>;
  setModel: (model: string) => Promise<void>;
  setEffort: (effort: Effort) => Promise<void>;
  setMaxThinkingTokens: (n: number) => Promise<void>;
  newSession: () => Promise<void>;
  continueSession: () => Promise<void>;
  resumeSession: (sessionId: string) => Promise<void>;
  // Stop a single task by id (any type — bash, agent, teammate). Maps to
  // the stop_task control_request. Use over interrupt() when you want to
  // kill a specific bg task without ending the whole turn.
  stopTask: (taskId: string) => Promise<void>;
  respondToPermission: (id: string, decision: PermissionDecision) => void;
  fetchFileSuggestions: (query: string) => Promise<Array<{ path: string; score?: number }>>;
  dismissShellEntry: (id: string) => void;
};

// ---------- factory ----------

export function createCcSession(opts: CcSessionOptions): CcSession {
  const ws = opts.wsClient ?? createWsClient({ url: opts.url, onTrace: opts.onTrace });
  const controls = createControlsClient(ws);
  const messagesCtrl = createMessagesController();
  const permissions = createPermissionsController({ ws, onCanUseTool: opts.onCanUseTool });
  const tasksCtrl = createTasksController();
  // Shell controller takes a thunk for sendMessage because both the
  // controller and sendMessage live inside this factory; the thunk lets
  // the controller's queued follow-up text fire sendMessage() after the
  // bash exchange XML lands in the buffer.
  const shellCtrl = createShellController({
    ws,
    sendMessage: (text: string) => sendMessage(text),
  });

  // ---- persistence ----
  // We hydrate from storage BEFORE constructing initial state so saved
  // values feed the atoms' initial values rather than overwriting them
  // after subscribers have already rendered.
  const persistence = resolvePersistence(opts.persistence);
  const persisted = persistence ? loadPersisted(persistence) : null;

  // Spawn args, kept up-to-date as the user changes mode/model/effort. Used
  // when respawning (effort change, session lifecycle change) so the new
  // child inherits the user's selections. If persistence has a stored
  // sessionId, the initial mode becomes resume(stored) — this is the
  // post-refresh path that brings the user back to their last thread.
  const initialMode: SessionMode = opts.args?.mode
    ?? (persisted?.sessionId ? { kind: "resume", sessionId: persisted.sessionId } : { kind: "continue" });
  let currentArgs: NonNullable<CcSessionOptions["args"]> = {
    mode: initialMode,
    permissionMode: opts.args?.permissionMode ?? persisted?.permissionMode ?? "default",
    permissionPromptTool: opts.args?.permissionPromptTool ?? "stdio",
    includePartialMessages: opts.args?.includePartialMessages ?? true,
    includeHookEvents: opts.args?.includeHookEvents ?? true,
    effort: opts.args?.effort ?? persisted?.effort,
    model: opts.args?.model ?? persisted?.model,
  };

  // ---- atoms ----
  const init = atom<InitData>({
    sessionId: null,
    model: null,
    cwd: null,
    agents: [],
    slashCommands: [],
    skills: [],
  });
  const activeMode = atom<PermissionMode>(currentArgs.permissionMode ?? "default");
  const pendingMode = atom<PermissionMode | null>(null);
  const modeError = atom<string | null>(null);
  const activeModel = atom<string>(currentArgs.model ?? "");
  const pendingModel = atom<string | null>(null);
  const modelError = atom<string | null>(null);
  const activeEffort = atom<Effort | "">((currentArgs.effort as Effort | undefined) ?? "");
  const pendingEffort = atom<Effort | null>(null);
  const effortError = atom<string | null>(null);
  const hookEvents = atom<HookEntry[]>([]);
  const shellEntries = shellCtrl.shellEntries;
  const tasks = tasksCtrl.tasks;
  const sessionState = atom<SessionState>("unknown");

  // Hydrate the message timeline from persisted snapshot if any. Doing
  // this BEFORE wiring the atom listener avoids a feedback loop where
  // hydration triggers a save (it's idempotent but wasteful).
  if (persisted?.messages && Array.isArray(persisted.messages)) {
    messagesCtrl.hydrate(persisted.messages);
  }

  if (persistence) {
    installPersistenceWriter({
      persistence,
      init,
      messagesCtrl,
      activeMode,
      activeModel,
      activeEffort,
    });
  }

  // Transient errors auto-clear after 5s. Each pending update cancels the
  // previous timer so back-to-back failures don't get prematurely cleared.
  function makeAutoClear(target: { set: (v: string | null) => void }, ttlMs = 5000) {
    let timer: ReturnType<typeof setTimeout> | null = null;
    return (msg: string | null) => {
      if (timer) clearTimeout(timer);
      target.set(msg);
      timer = msg ? setTimeout(() => target.set(null), ttlMs) : null;
    };
  }
  const setModeErr = makeAutoClear(modeError);
  const setModelErr = makeAutoClear(modelError);
  const setEffortErr = makeAutoClear(effortError);

  // ---- frame ingestion ----
  let initSeen = false;

  ws.onFrame((frame) => {
    // 1. _local frames (respawn ack).
    if (handleLocalFrame(frame)) return;

    // 2. controls layer (control_response → resolve in-flight requests).
    if (controls.ingest(frame)) return;

    // 3. permissions gate (inbound control_request:can_use_tool).
    if (permissions.ingest(frame)) return;

    // 4. system:init — capture once per spawn.
    if (handleSystemInit(frame)) return;

    // 5. user/isReplay shell echo / output. Side-effect-only: builds bash
    //    XML for next-send buffer, falls through so the frame still lands
    //    in the chat as a normal user bubble.
    shellCtrl.handleShellReplay(frame);

    // 6. system:local_command_output (rare).
    if (shellCtrl.handleLocalCommandOutput(frame)) return;

    // 7. hooks.
    if (handleHookEvent(frame)) return;

    // 8. task lifecycle (system:task_started / task_progress / task_notification).
    if (tasksCtrl.handleTaskEvent(frame)) return;

    // 9. session_state_changed.
    if (handleSessionStateChanged(frame)) return;

    // 10. Sub-agent frames (parent_tool_use_id set) MUST run BEFORE
    //     messagesCtrl — the messages controller eats stream_event /
    //     assistant unconditionally, which would otherwise pollute the
    //     main timeline with sub-agent bubbles and starve the per-task
    //     transcript.
    if (tasksCtrl.handleSubAgentFrame(frame)) return;

    // 11. streaming + canonical assistant — let messages controller decide.
    if (messagesCtrl.ingest(frame)) return;

    // 12. fall-through: drop noisy frames; otherwise append to timeline.
    if ("type" in frame && frame.type === "rate_limit_event") return;
    messagesCtrl.pushFrame(frame);
  });

  function handleLocalFrame(frame: InboundFrame): boolean {
    if (!isLocalRespawnResult(frame)) return false;
    const resolver = pendingRespawns.get(frame.requestId);
    if (resolver) {
      pendingRespawns.delete(frame.requestId);
      clearTimeout(resolver.timeoutId);
      if (frame.ok) resolver.resolve();
      else resolver.reject(frame.error ?? "respawn failed");
    }
    return true;
  }

  function handleSystemInit(frame: InboundFrame): boolean {
    if (initSeen) return false;
    if (!isSystemFrame(frame) || frame.subtype !== "init") return false;
    initSeen = true;
    const f = frame as SystemInit;
    const m = f.permissionMode ?? f.permission_mode;
    if (typeof m === "string" && (KNOWN_PERMISSION_MODES as readonly string[]).includes(m)) {
      activeMode.set(m as PermissionMode);
      currentArgs.permissionMode = m as PermissionMode;
    }
    const im = f.model ?? "";
    if (im) {
      activeModel.set(im);
      currentArgs.model = im;
    }
    init.set({
      sessionId: f.session_id ?? null,
      model: im || null,
      cwd: f.cwd ?? null,
      agents: f.agents ?? [],
      slashCommands: f.slash_commands ?? [],
      skills: f.skills ?? [],
    });
    void controls
      .request({ subtype: "get_settings" }, { timeoutMs: 10_000 })
      .then(({ inner }) => {
        const probes: unknown[] = [
          inner,
          (inner as Record<string, unknown> | null)?.applied,
          (inner as Record<string, unknown> | null)?.effective,
          (inner as Record<string, unknown> | null)?.settings,
          (inner as Record<string, unknown> | null)?.permissions,
          (inner as Record<string, unknown> | null)?.inferenceConfig,
        ];
        let found: string | undefined;
        for (const p of probes) {
          if (!p || typeof p !== "object") continue;
          const r = p as Record<string, unknown>;
          const cand =
            (typeof r.effortLevel === "string" && r.effortLevel) ||
            (typeof r.effort_level === "string" && r.effort_level) ||
            (typeof r.effort === "string" && r.effort) ||
            undefined;
          if (cand) { found = cand; break; }
        }
        if (found && (KNOWN_EFFORTS as readonly string[]).includes(found)) {
          activeEffort.set(found as Effort);
          currentArgs.effort = found as Effort;
        }
      })
      .catch(() => { /* silent */ });
    messagesCtrl.pushFrame(frame);
    return true;
  }

  function handleHookEvent(frame: InboundFrame): boolean {
    if (!isSystemFrame(frame)) return false;
    const sub = frame.subtype;
    if (sub !== "hook_started" && sub !== "hook_progress" && sub !== "hook_response") return false;
    const hookFrame = frame as Extract<typeof frame, { subtype: typeof sub }>;
    const entry: HookEntry = {
      id: crypto.randomUUID(),
      ts: Date.now(),
      subtype: sub,
      hookName: hookFrame.hook_event_name ?? hookFrame.hookEventName,
      raw: hookFrame,
    };
    hookEvents.set(capRingFifo([...hookEvents.get(), entry], HOOK_EVENTS_CAP));
    return true;
  }

  function handleSessionStateChanged(frame: InboundFrame): boolean {
    if (!isSystemFrame(frame) || frame.subtype !== "session_state_changed") return false;
    const f = frame as SystemSessionStateChanged;
    if (f.state === "idle" || f.state === "running" || f.state === "requires_action") {
      sessionState.set(f.state);
    }
    return true;
  }

  // ---- respawn ----
  type RespawnResolver = { resolve: () => void; reject: (err: string) => void; timeoutId: ReturnType<typeof setTimeout> };
  const pendingRespawns = new Map<string, RespawnResolver>();

  function respawn(timeoutMs = 60_000): Promise<void> {
    const requestId = makeRequestId();
    const args = buildSpawnArgs({
      mode: currentArgs.mode!,
      permissionMode: currentArgs.permissionMode,
      permissionPromptTool: currentArgs.permissionPromptTool,
      includePartialMessages: currentArgs.includePartialMessages,
      includeHookEvents: currentArgs.includeHookEvents,
      effort: currentArgs.effort,
      model: currentArgs.model,
    });
    // Reset BEFORE the wire send so the new claude's system:init is
    // accepted no matter whether respawnResult or system:init lands first.
    // (Prior bug: setEffort relied on respawnResult to clear initSeen, but
    // the bridge spawns the new child synchronously, so its first stdout
    // line could beat the local respawnResult on the wire.)
    initSeen = false;
    // Cancel any control_request promises that were in flight against the
    // about-to-die child. The bridge kills the old child the moment it
    // receives _local:respawn; outstanding requests would otherwise hang
    // until their timeouts fire against a dead pipe.
    controls.abortAll("respawn");
    permissions.clearQueue();
    return new Promise<void>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        if (!pendingRespawns.has(requestId)) return;
        pendingRespawns.delete(requestId);
        reject(`respawn timed out after ${timeoutMs}ms`);
      }, timeoutMs);
      pendingRespawns.set(requestId, { resolve, reject, timeoutId });
      ws.send({ _local: "respawn", args, requestId });
    });
  }

  // ---- public methods ----

  function connect() {
    ws.connect();
    // nanostores subscribe() fires synchronously with the current value
    // BEFORE returning the unsubscribe — using `const off = subscribe(...)`
    // and referencing `off` inside the callback TDZ-throws if status is
    // already "open" at subscribe time. `let` + null-guard handles it.
    let offStatus: (() => void) | null = null;
    let fired = false;
    offStatus = ws.status.subscribe((s) => {
      if (s !== "open" || fired) return;
      fired = true;
      offStatus?.();
      offStatus = null;
      void respawn().catch((err) => console.error("[session] initial respawn failed", err));
    });
  }

  function disconnect() {
    // Reject in-flight controls and clear the permission queue before
    // closing the socket so consumers don't see UI buttons hang for
    // 30 seconds against a torn-down connection.
    controls.abortAll("disconnected");
    permissions.clearQueue();
    // Reject any pending respawn, too — a respawn issued just before
    // disconnect would otherwise sit until its 60s timeout.
    for (const [id, r] of pendingRespawns) {
      clearTimeout(r.timeoutId);
      r.reject("disconnected");
      pendingRespawns.delete(id);
    }
    ws.disconnect();
  }

  function sendMessage(text: string) {
    if (!text.trim() && !shellCtrl.hasPending()) return;
    const payload = shellCtrl.drainPending(text);
    messagesCtrl.pushLocalUser(text);
    ws.send({ type: "user", message: { role: "user", content: payload } });
  }

  async function interrupt() {
    await controls.request({ subtype: "interrupt" }, { timeoutMs: 10_000 });
  }

  async function endSession() {
    await controls.request({ subtype: "end_session" }, { timeoutMs: 10_000 });
  }

  async function setMaxThinkingTokens(n: number) {
    await controls.request({ subtype: "set_max_thinking_tokens", max_tokens: n });
  }

  async function setPermissionMode(next: PermissionMode) {
    if (next === activeMode.get() || pendingMode.get() != null) return;
    pendingMode.set(next);
    setModeErr(null);
    try {
      await controls.request(
        { subtype: "set_permission_mode", mode: next },
        { timeoutMs: 10_000 },
      );
      activeMode.set(next);
      currentArgs.permissionMode = next;
      pendingMode.set(null);
    } catch (err) {
      pendingMode.set(null);
      const msg = String(err);
      // Auto-skip: if the failed mode is in the cycle, jump to the next
      // cycle slot so cycling doesn't get stuck on a forbidden mode.
      if (CYCLE_ORDER.includes(next)) {
        const skip = nextCycleMode(next);
        setModeErr(`${next} not allowed (${msg}) — skipping to ${skip}`);
        // Defer one tick so atom subscribers commit pendingMode=null first.
        setTimeout(() => { void setPermissionMode(skip); }, 0);
      } else {
        setModeErr(`could not change to ${next}: ${msg}`);
      }
    }
  }

  async function cyclePermissionMode() {
    const cur = activeMode.get();
    if (pendingMode.get() != null) return;
    await setPermissionMode(nextCycleMode(cur));
  }

  async function setModel(model: string) {
    if (!model) return;
    if (model === activeModel.get() || pendingModel.get() != null) return;
    pendingModel.set(model);
    setModelErr(null);
    try {
      await controls.request({ subtype: "set_model", model }, { timeoutMs: 30_000 });
      activeModel.set(model);
      currentArgs.model = model;
      pendingModel.set(null);
    } catch (err) {
      pendingModel.set(null);
      setModelErr(`could not change model to ${model}: ${err}`);
    }
  }

  async function setEffort(effort: Effort) {
    if (!effort) return;
    if (effort === activeEffort.get() || pendingEffort.get() != null) return;
    pendingEffort.set(effort);
    setEffortErr(null);
    const prev = currentArgs.effort;
    currentArgs.effort = effort;
    try {
      await respawn();
      activeEffort.set(effort);
      pendingEffort.set(null);
    } catch (err) {
      currentArgs.effort = prev;
      pendingEffort.set(null);
      setEffortErr(`could not change effort to ${effort}: ${err}`);
    }
  }

  async function changeSession(mode: SessionMode, opts: { resetTimeline: boolean }) {
    currentArgs.mode = mode;
    if (opts.resetTimeline) {
      // Switching to a different conversation thread — wipe local state so
      // stale bubbles from the previous session don't bleed into the new one.
      messagesCtrl.reset();
      hookEvents.set([]);
      shellCtrl.reset();
      tasksCtrl.reset();
      // Clear init too, otherwise the OLD sessionId / cwd / agents stay
      // visible in the UI until the new system:init lands (the wire round-
      // trip can be tens of ms but the visual flicker is jarring). Effort/
      // model respawns intentionally don't clear init — the same session
      // is preserved by --continue and gets the same sessionId back.
      init.set({
        sessionId: null,
        model: null,
        cwd: null,
        agents: [],
        slashCommands: [],
        skills: [],
      });
      // Also clear the persisted snapshot so a refresh after New/Resume
      // doesn't fall back to the previous session's saved sessionId. The
      // post-respawn system:init will write the new id back in.
      if (persistence) {
        try { persistence.storage.removeItem(persistence.key); } catch {}
      }
    }
    // respawn() resets initSeen + aborts in-flight controls/permissions.
    await respawn();
  }

  // newSession = brand-new conversation, wipe.
  async function newSession() {
    await changeSession({ kind: "new" }, { resetTimeline: true });
  }
  // continueSession = pick up the most recent thread. Don't wipe local
  // state: the CLI's --continue restores claude's internal context but
  // does NOT restream prior turns over stream-json, so wiping would leave
  // a permanently empty timeline. Calling continue when you're already on
  // the current session means "stay here," and the user's bubbles stay.
  async function continueSession() {
    await changeSession({ kind: "continue" }, { resetTimeline: false });
  }
  // resumeSession = jump to a specific session by id; almost always means
  // a different thread.
  async function resumeSession(sessionId: string) {
    await changeSession({ kind: "resume", sessionId }, { resetTimeline: true });
  }

  async function fetchFileSuggestions(query: string): Promise<Array<{ path: string; score?: number }>> {
    try {
      const { inner } = await controls.request(
        { subtype: "file_suggestions", query },
        { timeoutMs: 5_000 },
      );
      const sugg = (inner as { suggestions?: unknown } | null)?.suggestions;
      if (!Array.isArray(sugg)) return [];
      return sugg.flatMap((s) => {
        if (!s || typeof s !== "object") return [];
        const r = s as { path?: unknown; score?: unknown };
        if (typeof r.path !== "string") return [];
        return [{ path: r.path, score: typeof r.score === "number" ? r.score : undefined }];
      });
    } catch {
      return [];
    }
  }

  async function stopTask(taskId: string) {
    // stop_task is decorative for local_agent — only interrupt halts it.
    const task = tasks.get().find((t) => t.taskId === taskId);
    if (task?.taskType === "local_agent") return interrupt();
    await controls.request({ subtype: "stop_task", task_id: taskId }, { timeoutMs: 10_000 });
  }

  // ---- assemble ----

  const atoms: CcAtoms = {
    status: ws.status,
    lastError: ws.lastError,
    init,
    messages: messagesCtrl.messages,
    activeStreamId: messagesCtrl.activeStreamId,
    activeMode,
    pendingMode,
    modeError,
    activeModel,
    pendingModel,
    modelError,
    activeEffort,
    pendingEffort,
    effortError,
    pendingPermissions: permissions.pendingPermissions,
    hookEvents,
    shellEntries,
    tasks,
    sessionState,
  };

  return {
    atoms,
    connect,
    disconnect,
    sendMessage,
    sendShellContext: shellCtrl.sendShellContext,
    sendBashSideChannel: shellCtrl.sendBashSideChannel,
    interrupt,
    endSession,
    setPermissionMode,
    cyclePermissionMode,
    setModel,
    setEffort,
    setMaxThinkingTokens,
    newSession,
    continueSession,
    resumeSession,
    stopTask,
    respondToPermission: permissions.respond,
    fetchFileSuggestions,
    dismissShellEntry: shellCtrl.dismissShellEntry,
  };
}

