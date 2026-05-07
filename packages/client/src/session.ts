// Session controller — composes ws + messages + controls + permissions into a
// single reactive client. See LIB-DESIGN.md for the full API contract.

import { atom, type ReadableAtom } from "nanostores";
import { createControlsClient } from "./controls";
import { createMessagesController, type MessageEntry } from "./messages";
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
  buildSpawnArgs,
  isLocalRespawnResult,
  isSystemFrame,
  isUserFrame,
  makeRequestId,
  type InboundFrame,
  type SessionMode,
  type SystemInit,
  type SystemSessionStateChanged,
  type SystemTaskStarted,
  type SystemTaskProgress,
  type SystemTaskNotification,
  type SystemTaskUpdated,
  type SystemHook,
  type TaskUsageBlock,
} from "./protocol";
import { buildBashXml, parseBashFrame } from "./shell";
import { createWsClient, type WsClient, type WsStatus } from "./ws";

// ---------- public types ----------

export type HookEntry = {
  id: string;
  ts: number;
  subtype: "hook_started" | "hook_progress" | "hook_response";
  hookName?: string;
  raw: SystemHook;
};

export type ShellSource = "context" | "sideChannel";

export type ShellEntry = {
  id: string;
  command: string;
  source: ShellSource;
  chunks: string[];
  // For context-shell: the exchange has run on the bridge but the
  // <bash-input>/<bash-stdout> XML hasn't been sent to claude yet — it
  // gets prepended to the user's next sendMessage() (matches the TUI's
  // shouldQuery:false flow). Cleared when drained.
  pending?: boolean;
};

// Ring-buffer caps on append-only atoms. Long-running sessions with
// chatty hooks or many sub-agents accumulate thousands of entries
// otherwise; the React renderer iterates the full array each render.
// Tasks keep N most recent (running tasks always retained — never evict
// a still-active row); hookEvents is plain FIFO drop-oldest.
const HOOK_EVENTS_CAP = 200;
const TASKS_CAP = 100;

function capRingFifo<T>(arr: T[], cap: number): T[] {
  return arr.length > cap ? arr.slice(arr.length - cap) : arr;
}

function capTasksKeepRunning<T extends { status: string }>(arr: T[], cap: number): T[] {
  if (arr.length <= cap) return arr;
  // Evict oldest non-running entries first; if all are running, keep all.
  const overflow = arr.length - cap;
  const out: T[] = [];
  let evictBudget = overflow;
  for (const t of arr) {
    if (evictBudget > 0 && t.status !== "running") {
      evictBudget--;
      continue;
    }
    out.push(t);
  }
  return out;
}

// Tasks emitted via system:task_started / task_progress / task_notification.
// task_id is the binary's local registry id and the value to pass to
// stopTask(). tool_use_id ties the task back to the tool_use block that
// spawned it (Bash, Agent, Task, etc) — used to render task progress
// alongside / inside the parent's tool_use card.
export type TaskStatus = "running" | "completed" | "failed" | "stopped";

export type TaskUsage = {
  totalTokens?: number;
  toolUses?: number;
  durationMs?: number;
};

export type TaskEntry = {
  taskId: string;
  toolUseId?: string;
  taskType?: string;       // e.g. "Bash", "Agent", "Task" — exact strings come from the binary
  description: string;
  workflowName?: string;
  prompt?: string;
  status: TaskStatus;
  startTime: number;
  lastUpdate: number;
  lastToolName?: string;
  summary?: string;
  outputFile?: string;
  usage?: TaskUsage;
  // Sub-agent transcript (frames received while this task was running with
  // parent_tool_use_id matching toolUseId). Populated only for tasks that
  // emit their own frames — bash tasks won't have these.
  transcript: MessageEntry[];
};

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

// Persistence: when enabled (the default in browsers), the lib remembers
// sessionId + visible message timeline + active mode/model/effort/tasks
// to localStorage so a page refresh resumes the same conversation thread
// AND restores the rendered bubbles (claude's own --continue restores
// internal context but doesn't restream prior turns over stream-json, so
// without local persistence the timeline would be empty after refresh).
//
// Set `persistence: false` to opt out. Provide a custom `storage` (e.g.
// sessionStorage, an in-memory shim, IndexedDB-backed wrapper) for
// non-default targets.
export type StorageLike = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
};

export type CcPersistenceOptions = {
  enabled?: boolean;
  storage?: StorageLike;
  key?: string;
  // Cap on serialized message entries to keep localStorage manageable.
  // Streaming entries are never persisted (transient by definition).
  maxMessages?: number;
};

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
  const shellEntries = atom<ShellEntry[]>([]);
  const tasks = atom<TaskEntry[]>([]);
  const sessionState = atom<SessionState>("unknown");

  // Hydrate the message timeline from persisted snapshot if any. Doing
  // this BEFORE wiring the atom listener avoids a feedback loop where
  // hydration triggers a save (it's idempotent but wasteful).
  if (persisted?.messages && Array.isArray(persisted.messages)) {
    messagesCtrl.hydrate(persisted.messages);
  }

  // Save-on-change. We debounce because messages can flood in during a
  // streaming turn and serializing the entire timeline on every delta
  // would burn budget. 250ms gives a reasonable batch window.
  if (persistence) {
    let saveTimer: ReturnType<typeof setTimeout> | null = null;
    const flush = () => {
      saveTimer = null;
      savePersisted(persistence, {
        sessionId: init.get().sessionId,
        messages: messagesCtrl.messages.get(),
        permissionMode: activeMode.get(),
        model: activeModel.get() || undefined,
        effort: activeEffort.get() || undefined,
      });
    };
    const schedule = () => {
      if (saveTimer != null) return;
      saveTimer = setTimeout(flush, 250);
    };
    init.subscribe(schedule);
    messagesCtrl.messages.subscribe(schedule);
    activeMode.subscribe(schedule);
    activeModel.subscribe(schedule);
    activeEffort.subscribe(schedule);
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

  // Side-channel shell tracking.
  // bash_command replay frames don't carry a correlation id, but the
  // binary processes them in the order received and replies in the same
  // order. So we keep a FIFO of in-flight captures: each call to
  // sendShellContext / sendBashSideChannel pushes; each scrape of an
  // output-replay frame shifts. Two bash sends in quick succession used
  // to clobber each other when we tracked a single `activeShellId`
  // global — replies for command #1 would land on entry #2's row and
  // command #1's capture would leak in the map forever.
  const shellCaptureQueue: {
    entryId: string;
    command: string;
    source: ShellSource;
    sawInputEcho: boolean;
  }[] = [];
  // Buffered <bash-input>/<bash-stdout>/<bash-stderr> XML, FIFO. Filled
  // when a context-shell capture's output replay arrives; drained by
  // sendMessage() which prepends to the user's next prompt. The TUI-`!cmd`
  // parity workaround: bash_command's replay frames are NOT injected
  // into claude's transcript by the binary (verified empirically).
  const pendingBashExchanges: { entryId: string; xml: string }[] = [];
  // Optional follow-up user prompts queued from sendShellContext (the
  // multi-line `!cmd\n<followup>` form). Fires sendMessage(followUp)
  // after the bash exchange's XML is buffered, so the followUp goes out
  // as the user message that drains the buffer.
  const pendingFollowUps = new Map<string, string>();

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
    handleShellReplay(frame);

    // 6. system:local_command_output (rare).
    if (handleLocalCommandOutput(frame)) return;

    // 7. hooks.
    if (handleHookEvent(frame)) return;

    // 8. task lifecycle (system:task_started / task_progress / task_notification).
    if (handleTaskEvent(frame)) return;

    // 9. session_state_changed.
    if (handleSessionStateChanged(frame)) return;

    // 10. Sub-agent frames (parent_tool_use_id set) MUST run BEFORE
    //     messagesCtrl — the messages controller eats stream_event /
    //     assistant unconditionally, which would otherwise pollute the
    //     main timeline with sub-agent bubbles and starve the per-task
    //     transcript.
    if (handleSubAgentFrame(frame)) return;

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

  // Side-effect-only: scrape bash-* replay frames for shellEntries chunks
  // + build the buffered XML that rides out on the next sendMessage.
  // Always returns false so the frame still flows into messagesCtrl for
  // chat-side rendering.
  function handleShellReplay(frame: InboundFrame): boolean {
    if (!isUserFrame(frame) || !frame.isReplay) return false;
    const c = frame.message.content;
    if (typeof c !== "string") return false;
    const parsed = parseBashFrame(c);
    if (!parsed) return false;

    if (parsed.kind === "input") {
      // First replay frame for the head capture: the binary acked the
      // command. Output is still pending.
      const head = shellCaptureQueue[0];
      if (head) head.sawInputEcho = true;
      return false;
    }
    // Both "output" (output-only replay) and "merged" (some bridges emit
    // input + output in one frame) close the head capture in FIFO order.
    const cap = shellCaptureQueue.shift();
    if (!cap) return false;
    const parts: string[] = [];
    if (parsed.stdout) parts.push(parsed.stdout);
    if (parsed.stderr) parts.push("[stderr] " + parsed.stderr);
    if (parsed.exit && parsed.exit !== "0") parts.push(`[exit ${parsed.exit}]`);
    const chunk = parts.join("\n");
    shellEntries.set(
      shellEntries.get().map((s) => (s.id === cap.entryId ? { ...s, chunks: [...s.chunks, chunk] } : s)),
    );
    if (cap.source === "context") {
      // Re-encode for the buffered XML — parseBashFrame decodes the
      // entities; the outbound payload needs them re-escaped.
      const stdoutXml = parsed.stdout.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      const stderrXml = parsed.stderr.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      pendingBashExchanges.push({
        entryId: cap.entryId,
        xml: buildBashXml(cap.command, stdoutXml, stderrXml),
      });
      const followUp = pendingFollowUps.get(cap.entryId);
      if (followUp) {
        pendingFollowUps.delete(cap.entryId);
        sendMessage(followUp);
      }
    }
    return false;
  }

  function handleLocalCommandOutput(frame: InboundFrame): boolean {
    if (!isSystemFrame(frame) || frame.subtype !== "local_command_output") return false;
    const head = shellCaptureQueue[0];
    if (!head) return false;
    const content = "content" in frame ? frame.content ?? "" : "";
    shellEntries.set(
      shellEntries.get().map((s) => (s.id === head.entryId ? { ...s, chunks: [...s.chunks, content] } : s)),
    );
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

  // task_started bookend opens a task; progress updates the running entry;
  // task_notification closes it with terminal status. See sdkEventQueue.ts
  // in the leaked source for the canonical shapes.
  function upsertTask(taskId: string, mut: (t: TaskEntry) => TaskEntry, init?: () => TaskEntry) {
    const arr = tasks.get();
    const idx = arr.findIndex((t) => t.taskId === taskId);
    if (idx === -1) {
      if (!init) return;
      tasks.set(capTasksKeepRunning([...arr, mut(init())], TASKS_CAP));
    } else {
      const next = arr.slice();
      next[idx] = mut(arr[idx]!);
      tasks.set(capTasksKeepRunning(next, TASKS_CAP));
    }
  }

  function mapTaskUsage(u: TaskUsageBlock | undefined, prev?: TaskUsage): TaskUsage | undefined {
    if (!u) return prev;
    return {
      totalTokens: u.total_tokens ?? prev?.totalTokens,
      toolUses: u.tool_uses ?? prev?.toolUses,
      durationMs: u.duration_ms ?? prev?.durationMs,
    };
  }

  function handleTaskEvent(frame: InboundFrame): boolean {
    if (!isSystemFrame(frame)) return false;

    if (frame.subtype === "task_started") {
      const f = frame as SystemTaskStarted;
      if (!f.task_id) return false;
      const now = Date.now();
      upsertTask(
        f.task_id,
        (t) => ({
          ...t,
          toolUseId: f.tool_use_id ?? t.toolUseId,
          taskType: f.task_type ?? t.taskType,
          description: f.description ?? t.description,
          workflowName: f.workflow_name ?? t.workflowName,
          prompt: f.prompt ?? t.prompt,
          status: "running",
          lastUpdate: now,
        }),
        () => ({
          taskId: f.task_id,
          toolUseId: f.tool_use_id,
          taskType: f.task_type,
          description: f.description ?? "",
          workflowName: f.workflow_name,
          prompt: f.prompt,
          status: "running",
          startTime: now,
          lastUpdate: now,
          transcript: [],
        }),
      );
      return true;
    }

    if (frame.subtype === "task_progress") {
      const f = frame as SystemTaskProgress;
      if (!f.task_id) return false;
      upsertTask(f.task_id, (t) => ({
        ...t,
        description: f.description ?? t.description,
        lastToolName: f.last_tool_name ?? t.lastToolName,
        summary: f.summary ?? t.summary,
        usage: mapTaskUsage(f.usage, t.usage),
        lastUpdate: Date.now(),
      }));
      return true;
    }

    // task_updated is the binary's immediate state-change frame (stop_task
    // → status:"killed"). The bookend task_notification arrives later;
    // flip status NOW so a killed task doesn't render as still-running.
    if (frame.subtype === "task_updated") {
      const f = frame as SystemTaskUpdated;
      if (!f.task_id || !f.patch) return false;
      const rawStatus = f.patch.status;
      const mapped: TaskStatus | undefined =
        rawStatus === "killed" ? "stopped" :
        rawStatus === "completed" || rawStatus === "failed" || rawStatus === "stopped" ? rawStatus :
        undefined;
      upsertTask(f.task_id, (t) => ({
        ...t,
        status: mapped ?? t.status,
        lastUpdate: Date.now(),
      }));
      return true;
    }

    if (frame.subtype === "task_notification") {
      const f = frame as SystemTaskNotification;
      if (!f.task_id) return false;
      const status: TaskStatus =
        f.status === "completed" || f.status === "failed" || f.status === "stopped" ? f.status : "completed";
      upsertTask(
        f.task_id,
        (t) => ({
          ...t,
          status,
          summary: f.summary ?? t.summary,
          outputFile: f.output_file ?? t.outputFile,
          usage: mapTaskUsage(f.usage, t.usage),
          lastUpdate: Date.now(),
        }),
        () => ({
          taskId: f.task_id,
          toolUseId: f.tool_use_id,
          taskType: undefined,
          description: f.summary ?? "",
          status,
          startTime: Date.now(),
          lastUpdate: Date.now(),
          transcript: [],
        }),
      );
      return true;
    }

    return false;
  }

  function handleSessionStateChanged(frame: InboundFrame): boolean {
    if (!isSystemFrame(frame) || frame.subtype !== "session_state_changed") return false;
    const f = frame as SystemSessionStateChanged;
    if (f.state === "idle" || f.state === "running" || f.state === "requires_action") {
      sessionState.set(f.state);
    }
    return true;
  }

  // Sub-agent frames: any frame with a non-null parent_tool_use_id was
  // emitted from inside a sub-agent (Task / Agent / teammate). Append to
  // the matching task's transcript instead of the main timeline so the
  // parent's chat flow stays clean. Frames without a parent or whose
  // parent task we haven't seen yet fall through to normal handling.
  function handleSubAgentFrame(frame: InboundFrame): boolean {
    // parent_tool_use_id only lives on user/assistant/stream_event frames.
    const parent =
      "parent_tool_use_id" in frame && typeof frame.parent_tool_use_id === "string"
        ? frame.parent_tool_use_id
        : null;
    if (!parent) return false;
    // Locate the task by tool_use_id correlation. If we haven't seen the
    // task_started yet (race), fall back to letting the main timeline take
    // it — better visible-but-misplaced than dropped.
    const arr = tasks.get();
    const idx = arr.findIndex((t) => t.toolUseId === parent);
    if (idx === -1) return false;
    // Build a synthetic FrameEntry without using messagesCtrl so we don't
    // pollute the main timeline. Streaming reconstruction inside sub-agent
    // transcripts is out of scope for v0 — we just append the raw frame.
    const next = arr.slice();
    const cur = arr[idx]!;
    next[idx] = {
      ...cur,
      transcript: [
        ...cur.transcript,
        {
          kind: "frame" as const,
          id: crypto.randomUUID(),
          frame,
          arrivalIdx: cur.transcript.length,
        },
      ],
      lastUpdate: Date.now(),
    };
    tasks.set(next);
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
    if (!text.trim() && pendingBashExchanges.length === 0) return;
    // Drain any buffered context-shell bash exchanges and prepend their
    // <bash-input>/<bash-stdout>/<bash-stderr> XML so claude sees the
    // bash context in the same shape the TUI's processBashCommand pushes
    // for `!cmd`. Format intentionally omits <bash-exit-code> (the TUI
    // doesn't include it; only the bash_command CCR replay does).
    //
    // Drained shell entries get removed from shellEntries entirely — the
    // panel above the input acts as a "queued exchange" indicator that
    // empties when the user fires the message that flushes the buffer.
    // The bash exchange remains visible in the chat scrollback.
    let payload = text;
    if (pendingBashExchanges.length > 0) {
      const xml = pendingBashExchanges.map((p) => p.xml).join("\n");
      payload = text.trim() ? `${xml}\n\n${text}` : xml;
      const drainedIds = new Set(pendingBashExchanges.map((p) => p.entryId));
      shellEntries.set(shellEntries.get().filter((s) => !drainedIds.has(s.id)));
      pendingBashExchanges.length = 0;
    }
    messagesCtrl.pushLocalUser(text);
    ws.send({ type: "user", message: { role: "user", content: payload } });
  }

  function sendShellContext(command: string, followUp = "") {
    // Route `!cmd` to the binary via the bash_command wire frame: the
    // binary runs it (with its own bounds, sandboxing, etc) and replays
    // <bash-input>/<bash-stdout>/<bash-stderr>/<bash-exit-code> as
    // user/isReplay frames over the wire. Empirically these replay
    // frames are NOT auto-injected into claude's transcript — we have
    // to ride them out ourselves on the next user message. The replay
    // scraper (handleShellReplay) builds the TUI-shape XML and pushes
    // to pendingBashExchanges; sendMessage() drains.
    const id = crypto.randomUUID();
    shellEntries.set([...shellEntries.get(), { id, command, source: "context", chunks: [], pending: true }]);
    shellCaptureQueue.push({ entryId: id, command, source: "context", sawInputEcho: false });
    ws.send({ type: "bash_command", command });
    // If the user typed a follow-up prompt on subsequent lines of the
    // !cmd input, fire it right after the bash exchange completes — the
    // drain in sendMessage will prepend the XML to the followUp text.
    if (followUp.trim()) {
      pendingFollowUps.set(id, followUp);
    }
  }

  function sendBashSideChannel(command: string) {
    const id = crypto.randomUUID();
    shellEntries.set([...shellEntries.get(), { id, command, source: "sideChannel", chunks: [] }]);
    shellCaptureQueue.push({ entryId: id, command, source: "sideChannel", sawInputEcho: false });
    ws.send({ type: "bash_command", command });
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
      shellEntries.set([]);
      tasks.set([]);
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

  function dismissShellEntry(id: string) {
    shellEntries.set(shellEntries.get().filter((s) => s.id !== id));
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
    sendShellContext,
    sendBashSideChannel,
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
    dismissShellEntry,
  };
}

// ---- persistence helpers ----

type PersistenceConfig = {
  storage: StorageLike;
  key: string;
  maxMessages: number;
};

type PersistedShape = {
  sessionId: string | null;
  messages?: MessageEntry[];
  permissionMode?: PermissionMode;
  model?: string;
  effort?: Effort;
};

function resolvePersistence(opt: CcSessionOptions["persistence"]): PersistenceConfig | null {
  if (opt === false) return null;
  // Default to localStorage when running in a browser; null otherwise so
  // server-side usage doesn't crash on missing globals.
  const defaultStorage: StorageLike | null =
    typeof globalThis !== "undefined" && (globalThis as any).localStorage
      ? ((globalThis as any).localStorage as StorageLike)
      : null;
  const storage = opt?.storage ?? defaultStorage;
  if (!storage) return null;
  if (opt && opt.enabled === false) return null;
  return {
    storage,
    key: opt?.key ?? "cc-ws-session",
    maxMessages: opt?.maxMessages ?? 200,
  };
}

function loadPersisted(cfg: PersistenceConfig): PersistedShape | null {
  try {
    const raw = cfg.storage.getItem(cfg.key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    return parsed as PersistedShape;
  } catch {
    return null;
  }
}

function savePersisted(cfg: PersistenceConfig, payload: PersistedShape): void {
  try {
    // Cap messages: keep only frame + local_user kinds (streaming entries
    // are transient by definition; serializing them would resurrect a
    // half-decoded message on reload). Trim to the most recent N.
    const trimmed: PersistedShape = { ...payload };
    if (Array.isArray(payload.messages)) {
      const filtered = payload.messages.filter(
        (m) => m.kind === "frame" || m.kind === "local_user",
      );
      trimmed.messages = filtered.slice(-cfg.maxMessages);
    }
    cfg.storage.setItem(cfg.key, JSON.stringify(trimmed));
  } catch {
    // Storage full / quota error / serialization error — drop silently.
    // Persistence is a best-effort UX feature, not a correctness requirement.
  }
}
