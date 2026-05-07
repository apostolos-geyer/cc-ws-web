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

// Long-running sessions with chatty hooks would otherwise accumulate
// thousands of entries
const HOOK_EVENTS_CAP = 200;

function capRingFifo<T>(arr: T[], cap: number): T[] {
  return arr.length > cap ? arr.slice(arr.length - cap) : arr;
}

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
  // Test seam — injected client must satisfy the WsClient contract
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
  // Use over interrupt() to kill one bg task without ending the whole turn
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
  // Thunk because sendMessage is defined later in this factory; the
  // controller's queued follow-up needs to fire sendMessage() after the
  // bash exchange XML lands in the buffer
  const shellCtrl = createShellController({
    ws,
    sendMessage: (text: string) => sendMessage(text),
  });

  // ---- persistence ----
  // Hydrate BEFORE constructing initial atom state so saved values feed
  // the initial values, not overwrite them post-render
  const persistence = resolvePersistence(opts.persistence);
  const persisted = persistence ? loadPersisted(persistence) : null;

  // Persisted sessionId routes the initial spawn through resume(stored) —
  // this is the post-refresh path back to the user's last thread
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

  // BEFORE installPersistenceWriter so hydration doesn't kick a save
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

  // Each new message cancels the previous timer so back-to-back failures
  // don't get prematurely cleared
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
    // _local frames have no `type`, so check before any type-based dispatch
    if (handleLocalFrame(frame)) return;

    // Branch system vs non-system once: the hot path (stream_event /
    // assistant at token rate) is non-system, so this avoids walking
    // ~5 system handlers before reaching messagesCtrl.ingest
    if (isSystemFrame(frame)) {
      switch (frame.subtype) {
        case "init":
          if (handleSystemInit(frame)) return;
          break;
        case "local_command_output":
          if (shellCtrl.handleLocalCommandOutput(frame)) return;
          break;
        case "hook_started":
        case "hook_progress":
        case "hook_response":
          if (handleHookEvent(frame)) return;
          break;
        case "task_started":
        case "task_progress":
        case "task_updated":
        case "task_notification":
          if (tasksCtrl.handleTaskEvent(frame)) return;
          break;
        case "session_state_changed":
          if (handleSessionStateChanged(frame)) return;
          break;
      }
      // Unknown / opted-out system subtypes still land on the timeline
      messagesCtrl.pushFrame(frame);
      return;
    }

    if (controls.ingest(frame)) return;
    if (permissions.ingest(frame)) return;
    shellCtrl.handleShellReplay(frame);
    // MUST run before messagesCtrl — messages eats stream_event/assistant
    // unconditionally and would pollute the main timeline with sub-agent
    // bubbles, starving the per-task transcript
    if (tasksCtrl.handleSubAgentFrame(frame)) return;
    if (messagesCtrl.ingest(frame)) return;
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
    // system:init doesn't carry effort. Skip the probe if we already
    // know it (we spawned with --effort or restored from persistence) —
    // the binary honours the spawn flag, so currentArgs.effort is the
    // ground truth in that case.
    if (!currentArgs.effort) {
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
        .catch((err) => {
          // Surface the probe failure so the UI shows we don't actually
          // know what effort the binary picked, instead of silently
          // displaying "default".
          setEffortErr(`could not read effort from get_settings: ${String(err)}`);
        });
    }
    messagesCtrl.pushFrame(frame);
    return true;
  }

  function handleHookEvent(frame: InboundFrame): boolean {
    const hookFrame = frame as SystemHook;
    const entry: HookEntry = {
      id: crypto.randomUUID(),
      ts: Date.now(),
      subtype: hookFrame.subtype,
      hookName: hookFrame.hook_event_name ?? hookFrame.hookEventName,
      raw: hookFrame,
    };
    hookEvents.set(capRingFifo([...hookEvents.get(), entry], HOOK_EVENTS_CAP));
    return true;
  }

  function handleSessionStateChanged(frame: InboundFrame): boolean {
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
    // Reset before the wire send: the bridge spawns the new child
    // synchronously, so the new system:init can beat the local
    // respawnResult on the wire (prior bug: setEffort relied on
    // respawnResult to clear this)
    initSeen = false;
    // Bridge kills the old child the instant it receives _local:respawn;
    // outstanding controls would otherwise hang against a dead pipe
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

  // One initial respawn per connect/disconnect cycle. Repeat connect()
  // calls without an intervening disconnect() are no-ops; otherwise a
  // duplicate connect would re-spawn against an already-running child.
  let connectStarted = false;
  function connect() {
    if (connectStarted) return;
    connectStarted = true;
    ws.connect();
    // nanostores subscribe fires synchronously with the current value
    // before returning the unsubscribe; `let` + null-guard avoids the
    // TDZ throw if status is already "open" at subscribe time
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
    connectStarted = false;
    // Reject before close so UI buttons don't hang 30s on a torn-down conn
    controls.abortAll("disconnected");
    permissions.clearQueue();
    // A respawn issued just before disconnect would otherwise sit 60s
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
      // Skip a forbidden mode in the cycle so cycling doesn't get stuck
      if (CYCLE_ORDER.includes(next)) {
        const skip = nextCycleMode(next);
        setModeErr(`${next} not allowed (${msg}) — skipping to ${skip}`);
        // Defer so atom subscribers commit pendingMode=null first
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
      // Different thread; previous-session bubbles must not bleed in
      messagesCtrl.reset();
      hookEvents.set([]);
      shellCtrl.reset();
      tasksCtrl.reset();
      // Otherwise old sessionId/cwd/agents stay visible until the new
      // system:init lands (jarring tens-of-ms flicker). Effort/model
      // respawns intentionally don't clear init — --continue preserves
      // the session and reuses the same sessionId
      init.set({
        sessionId: null,
        model: null,
        cwd: null,
        agents: [],
        slashCommands: [],
        skills: [],
      });
      // Otherwise a refresh after New/Resume falls back to the previous
      // session's saved sessionId; post-respawn system:init writes the
      // new id back in
      if (persistence) {
        try { persistence.storage.removeItem(persistence.key); } catch {}
      }
    }
    await respawn();
  }

  async function newSession() {
    await changeSession({ kind: "new" }, { resetTimeline: true });
  }
  // --continue restores claude's internal context but does NOT restream
  // prior turns, so wiping would leave a permanently empty timeline.
  // Calling continue on the current session means "stay here"
  async function continueSession() {
    await changeSession({ kind: "continue" }, { resetTimeline: false });
  }
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
    // For local_agent stop_task is a no-op; only interrupt actually halts it
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

