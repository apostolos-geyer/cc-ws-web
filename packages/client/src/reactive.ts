/**
 * Reactive nanostores facade over `ClaudeClient` from
 * `@somewhatintelligent/cc-protocol/client`.
 *
 * Two entry points:
 *
 *   - `createReactiveClient(opts)` — low-level: wires a `wsClientTransport`,
 *     constructs a `ClaudeClient`, mirrors `client.getSnapshot()` into a
 *     `state` atom + a handful of convenience atoms. Use this when you
 *     don't need session-mode lifecycle (continue/resume/new), effort
 *     respawn, persistence, or the WsClient-shaped status atom.
 *
 *   - `createCcSession(opts)` — high-level: the legacy
 *     `@somewhatintelligent/cc-ws-client` factory. Owns the WsStatus
 *     atom, the `_local:respawn` flow with the cc-ws-server bridge,
 *     effort tracking (requires respawn), persistence, mode-error
 *     auto-clearing TTLs, and a small handful of UI conveniences
 *     (`cyclePermissionMode`, `setEffort`).
 *
 * Both are universal — works in browser and Bun. The only persistence
 * tie is `localStorage`, accessed defensively.
 */

import { atom, type ReadableAtom, type WritableAtom } from "nanostores";
import {
  ClaudeClient,
  type ClaudeClientOptions,
  type ClientState,
  type HookEntry,
  type InitData,
  type MessageEntry,
  type OnCanUseTool,
  type PendingPermission,
  type PermissionDecision,
  type ShellEntry,
  type TaskEntry,
} from "@somewhatintelligent/cc-protocol/client";
import {
  wsClientTransport,
  type ExpBackoff,
  type WsClientTransport,
} from "@somewhatintelligent/cc-protocol/transport/ws-client";
import {
  CYCLE_ORDER,
  KNOWN_EFFORTS,
  KNOWN_PERMISSION_MODES,
  nextCycleMode,
  type Effort,
  type Model,
  type PermissionMode,
} from "./modes";
import {
  buildSpawnArgs,
  type SessionMode,
  type LocalRespawnResultFrame,
} from "./protocol";
import {
  installPersistenceWriter,
  loadPersisted,
  resolvePersistence,
  type CcPersistenceOptions,
} from "./persistence";

// ============================================================ createReactiveClient

export type { ClientState, ClaudeClientOptions };

export interface ReactiveClientOptions extends ClaudeClientOptions {
  url: string;
  reconnect?: ExpBackoff;
  protocols?: string | string[];
}

export interface ReactiveClient {
  client: ClaudeClient;
  /** Live snapshot atom; updates on every state mutation. */
  state: ReadableAtom<ClientState>;
  sessionId: ReadableAtom<string | null>;
  sessionState: ReadableAtom<ClientState["sessionState"]>;
  messages: ReadableAtom<MessageEntry[]>;
  tasks: ReadableAtom<TaskEntry[]>;
  pendingPermissions: ReadableAtom<PendingPermission[]>;
  /** Tear down the underlying transport + client. */
  dispose: () => Promise<void>;
}

export function createReactiveClient(opts: ReactiveClientOptions): ReactiveClient {
  const transport = wsClientTransport(opts.url, {
    reconnect: opts.reconnect,
    protocols: opts.protocols,
  });
  const client = new ClaudeClient(transport, {
    onPermissionRequest: opts.onPermissionRequest,
    requestTimeoutMs: opts.requestTimeoutMs,
  });

  const state = atom<ClientState>(client.getSnapshot());
  client.onStateChange((snap) => state.set(snap));

  const sessionId = atom<string | null>(state.get().sessionId);
  const sessionState = atom<ClientState["sessionState"]>(state.get().sessionState);
  const messages = atom<MessageEntry[]>(state.get().messages);
  const tasks = atom<TaskEntry[]>(state.get().tasks);
  const pendingPermissions = atom<PendingPermission[]>(state.get().pendingPermissions);
  state.subscribe((s) => {
    sessionId.set(s.sessionId);
    sessionState.set(s.sessionState);
    messages.set(s.messages);
    tasks.set(s.tasks);
    pendingPermissions.set(s.pendingPermissions);
  });

  return {
    client,
    state,
    sessionId,
    sessionState,
    messages,
    tasks,
    pendingPermissions,
    async dispose() {
      await client.dispose();
      await transport.close();
    },
  };
}

// ============================================================ createCcSession

export type WsStatus = "idle" | "connecting" | "open" | "respawning" | "closed" | "error";

export type SessionStateValue = ClientState["sessionState"];

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
  sessionState: ReadableAtom<SessionStateValue>;
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
  /** Test seam — injected client + transport. When set, the WS plumbing is
   *  bypassed entirely (used by createTestSession in __tests__/helpers). */
  testTransport?: {
    transport: WsClientTransportLike;
    status?: WritableAtom<WsStatus>;
    lastError?: WritableAtom<string | null>;
  };
};

/** Minimal contract the test seam needs from a transport. */
export interface WsClientTransportLike {
  send(frame: unknown): Promise<void>;
  onFrame(handler: (frame: unknown) => void): () => void;
  close(): Promise<void>;
  readonly closed: boolean;
}

export type CcSession = {
  atoms: CcAtoms;
  /** Direct access to the underlying ClaudeClient. */
  client: ClaudeClient;
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
  stopTask: (taskId: string) => Promise<void>;
  respondToPermission: (id: string, decision: PermissionDecision) => void;
  fetchFileSuggestions: (query: string) => Promise<Array<{ path: string; score?: number }>>;
  dismissShellEntry: (id: string) => void;
};

export function createCcSession(opts: CcSessionOptions): CcSession {
  // ---- transport + status atoms ----
  // We deliberately defer constructing the transport until connect() to
  // preserve the legacy "createCcSession does not open a socket" contract.
  const status = opts.testTransport?.status ?? atom<WsStatus>("idle");
  const lastError = opts.testTransport?.lastError ?? atom<string | null>(null);
  let transport: WsClientTransportLike | null = opts.testTransport?.transport ?? null;
  const isTestTransport = !!opts.testTransport;

  // ---- persistence ----
  const persistence = resolvePersistence(opts.persistence);
  const persisted = persistence ? loadPersisted(persistence) : null;

  // Persisted sessionId routes the initial spawn through resume(stored) —
  // the post-refresh path back to the user's last thread.
  const initialMode: SessionMode = opts.args?.mode
    ?? (persisted?.sessionId ? { kind: "resume", sessionId: persisted.sessionId } : { kind: "continue" });
  const currentArgs: NonNullable<CcSessionOptions["args"]> = {
    mode: initialMode,
    permissionMode: opts.args?.permissionMode ?? persisted?.permissionMode ?? "default",
    permissionPromptTool: opts.args?.permissionPromptTool ?? "stdio",
    includePartialMessages: opts.args?.includePartialMessages ?? true,
    includeHookEvents: opts.args?.includeHookEvents ?? true,
    effort: opts.args?.effort ?? persisted?.effort,
    model: opts.args?.model ?? persisted?.model,
  };

  // ---- ClaudeClient construction ----
  // The client is created with a placeholder transport synchronously so the
  // tests + persistence hydration can call hydrateMessages / seedMode /
  // seedModel before the network transport opens.
  //
  // When the user calls connect() we wire the real WS transport and route
  // frames through to the client. The test seam bypasses this by injecting
  // its own transport up front.
  //
  // We use a small forwarding wrapper to swap the transport at runtime.
  const forwarder = makeForwardingTransport();
  const client = new ClaudeClient(forwarder.transport, {
    onCanUseTool: opts.onCanUseTool,
  });

  if (isTestTransport && transport) {
    forwarder.attach(transport);
  }

  // Persistence hydration BEFORE atoms snapshot so initial values reflect
  // restored state, not empty defaults.
  if (persisted?.messages && Array.isArray(persisted.messages)) {
    client.hydrateMessages(persisted.messages);
  }
  if (persisted?.permissionMode) {
    client.seedMode(persisted.permissionMode);
  }
  if (persisted?.model) {
    client.seedModel(persisted.model);
  }
  // Critical: the binary defers system/init until the first user message
  // in stream-json mode. Without seeding sessionId here, the persistence
  // writer's first debounced save (250ms after mount) flushes the in-memory
  // null over the persisted id — wiping it from localStorage and leaving
  // the Header indicator empty until the user actually sends something.
  if (persisted?.sessionId) {
    client.seedSessionId(persisted.sessionId);
  }

  // ---- mirror ClientState into atoms ----
  const snap0 = client.getSnapshot();
  const init = atom<InitData>(snap0.init);
  const messages = atom<MessageEntry[]>(snap0.messages);
  const messagesRevision = atom<number>(snap0.messagesRevision);
  const activeStreamId = atom<string | null>(snap0.activeStreamId);
  const activeMode = atom<PermissionMode>((snap0.activeMode as PermissionMode) ?? (currentArgs.permissionMode ?? "default"));
  const pendingMode = atom<PermissionMode | null>(null);
  const modeError = atom<string | null>(null);
  const activeModel = atom<string>(snap0.activeModel ?? currentArgs.model ?? "");
  const pendingModel = atom<string | null>(null);
  const modelError = atom<string | null>(null);
  const activeEffort = atom<Effort | "">((currentArgs.effort as Effort | undefined) ?? "");
  const pendingEffort = atom<Effort | null>(null);
  const effortError = atom<string | null>(null);
  const pendingPermissions = atom<PendingPermission[]>(snap0.pendingPermissions);
  const hookEvents = atom<HookEntry[]>(snap0.hookEvents);
  const shellEntries = atom<ShellEntry[]>(snap0.shellEntries);
  const tasks = atom<TaskEntry[]>(snap0.tasks);
  const sessionState = atom<SessionStateValue>(snap0.sessionState);

  // Wire onStateChange → atoms.
  client.onStateChange((s) => {
    if (init.get() !== s.init) init.set(s.init);
    if (messages.get() !== s.messages) messages.set(s.messages);
    if (messagesRevision.get() !== s.messagesRevision) messagesRevision.set(s.messagesRevision);
    if (activeStreamId.get() !== s.activeStreamId) activeStreamId.set(s.activeStreamId);
    // Mode/model atoms hold the validated PermissionMode subtype; protocol
    // exposes activeMode as a raw string.
    const am = (s.activeMode ?? "default") as PermissionMode;
    if (activeMode.get() !== am) activeMode.set(am);
    const pm = s.pendingMode as PermissionMode | null;
    if (pendingMode.get() !== pm) pendingMode.set(pm);
    const amdl = s.activeModel ?? "";
    if (activeModel.get() !== amdl) activeModel.set(amdl);
    const pmdl = s.pendingModel as string | null;
    if (pendingModel.get() !== pmdl) pendingModel.set(pmdl);
    if (pendingPermissions.get() !== s.pendingPermissions) pendingPermissions.set(s.pendingPermissions);
    if (hookEvents.get() !== s.hookEvents) hookEvents.set(s.hookEvents);
    if (shellEntries.get() !== s.shellEntries) shellEntries.set(s.shellEntries);
    if (tasks.get() !== s.tasks) tasks.set(s.tasks);
    if (sessionState.get() !== s.sessionState) sessionState.set(s.sessionState);
  });

  if (persistence) {
    installPersistenceWriter({
      persistence,
      sessionId: atomFromSelector(client, (s) => s.sessionId),
      messages,
      messagesRevision,
      activeMode,
      activeModel,
      activeEffort,
    });
  }

  // Auto-clear errors. Each new message cancels the previous timer so
  // back-to-back failures don't get prematurely cleared.
  function makeAutoClear(target: WritableAtom<string | null>, ttlMs = 5000) {
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

  // Wire client-side modeError / modelError → auto-clearing atoms.
  client.onStateChange((s) => {
    if (s.modeError && s.modeError !== modeError.get()) setModeErr(s.modeError);
    if (s.modelError && s.modelError !== modelError.get()) setModelErr(s.modelError);
  });

  // ---- _local:respawn handling ----
  type RespawnResolver = { resolve: () => void; reject: (err: string) => void; timeoutId: ReturnType<typeof setTimeout> };
  const pendingRespawns = new Map<string, RespawnResolver>();

  function handleLocalFrame(frame: unknown): boolean {
    if (!frame || typeof frame !== "object") return false;
    const f = frame as { _local?: unknown; requestId?: unknown; ok?: unknown; error?: unknown };
    if (f._local !== "respawnResult") return false;
    const rid = typeof f.requestId === "string" ? f.requestId : null;
    if (!rid) return true;
    const resolver = pendingRespawns.get(rid);
    if (resolver) {
      pendingRespawns.delete(rid);
      clearTimeout(resolver.timeoutId);
      if (f.ok) resolver.resolve();
      else resolver.reject(typeof f.error === "string" ? f.error : "respawn failed");
    }
    return true;
  }

  // Attach _local frame handler to the forwarder so it sees frames BEFORE
  // they hit the ClaudeClient (the client otherwise complains about
  // unknown frame types in the timeline).
  forwarder.setLocalHandler(handleLocalFrame);

  function makeRequestId(): string {
    return crypto.randomUUID();
  }

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
    // respawnResult on the wire.
    forwarder.resetInitSeen();
    // Bridge kills the old child the instant it receives _local:respawn;
    // outstanding controls would otherwise hang against a dead pipe.
    client.abortAllIntents("respawn");
    client.clearPermissionsQueue();
    return new Promise<void>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        if (!pendingRespawns.has(requestId)) return;
        pendingRespawns.delete(requestId);
        reject(`respawn timed out after ${timeoutMs}ms`);
      }, timeoutMs);
      pendingRespawns.set(requestId, { resolve, reject, timeoutId });
      void send({ _local: "respawn", args, requestId });
    });
  }

  function send(frame: unknown) {
    if (!transport || transport.closed) return Promise.resolve();
    try {
      opts.onTrace?.("out", JSON.stringify(frame));
    } catch {
      // ignore
    }
    return transport.send(frame).catch((err: unknown) => {
      console.warn("[ws] send rejected:", err);
    });
  }

  // ---- public methods ----

  let connectStarted = false;
  function connect() {
    if (connectStarted) return;
    connectStarted = true;
    if (isTestTransport) {
      // Test seam: status already-open semantics
      if (status.get() === "idle") status.set("connecting");
      Promise.resolve().then(() => {
        if (status.get() === "connecting") status.set("open");
        void respawn().catch((err) => console.error("[session] initial respawn failed", err));
      });
      return;
    }
    status.set("connecting");
    lastError.set(null);
    const t = wsClientTransport(opts.url, {
      onOpen() {
        status.set("open");
        void respawn().catch((err) => console.error("[session] initial respawn failed", err));
      },
      onSocketClose() {
        if (status.get() !== "closed") status.set("closed");
      },
    });
    transport = t;
    forwarder.attach(t);
  }

  function disconnect() {
    connectStarted = false;
    // Reject before close so UI buttons don't hang 30s on a torn-down conn
    client.abortAllIntents("disconnected");
    client.clearPermissionsQueue();
    for (const [id, r] of pendingRespawns) {
      clearTimeout(r.timeoutId);
      r.reject("disconnected");
      pendingRespawns.delete(id);
    }
    if (transport && !isTestTransport) {
      void transport.close().catch(() => undefined);
      transport = null;
    }
    forwarder.detach();
    status.set("closed");
  }

  function sendMessage(text: string) {
    void client.sendUserMessage(text);
  }

  async function interrupt() {
    await client.interrupt();
  }

  async function endSession() {
    await client.endSession();
  }

  async function setMaxThinkingTokens(n: number) {
    await client.setMaxThinkingTokens(n);
  }

  async function setPermissionMode(next: PermissionMode) {
    if (next === activeMode.get() || pendingMode.get() != null) return;
    setModeErr(null);
    try {
      await client.setPermissionMode(next);
      currentArgs.permissionMode = next;
    } catch (err) {
      const msg = String(err);
      // Skip a forbidden mode in the cycle so cycling doesn't get stuck
      if (CYCLE_ORDER.includes(next)) {
        const skip = nextCycleMode(next);
        setModeErr(`${next} not allowed (${msg}) — skipping to ${skip}`);
        setTimeout(() => { void setPermissionMode(skip); }, 0);
      } else {
        setModeErr(`could not change to ${next}: ${msg}`);
      }
    }
  }

  async function cyclePermissionMode() {
    if (pendingMode.get() != null) return;
    await setPermissionMode(nextCycleMode(activeMode.get()));
  }

  async function setModel(model: string) {
    if (!model) return;
    if (model === activeModel.get() || pendingModel.get() != null) return;
    setModelErr(null);
    try {
      await client.setModel(model);
      currentArgs.model = model;
    } catch (err) {
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

  async function changeSession(mode: SessionMode, resetTimeline: boolean) {
    currentArgs.mode = mode;
    if (resetTimeline) {
      client.resetTimeline();
      // Otherwise a refresh after New/Resume falls back to the previous
      // session's saved sessionId; post-respawn system:init writes the
      // new id back in
      if (persistence) {
        try { persistence.storage.removeItem(persistence.key); } catch { /* ignore */ }
      }
    }
    await respawn();
  }

  async function newSession() {
    await changeSession({ kind: "new" }, true);
  }
  async function continueSession() {
    await changeSession({ kind: "continue" }, false);
  }
  async function resumeSession(sessionId: string) {
    await changeSession({ kind: "resume", sessionId }, true);
  }

  async function fetchFileSuggestions(query: string): Promise<Array<{ path: string; score?: number }>> {
    try {
      const inner = await client.fileSuggestions(query);
      const sugg = (inner as { suggestions?: unknown } | null)?.suggestions;
      if (!Array.isArray(sugg)) return [];
      return sugg.flatMap((s: unknown) => {
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
    await client.stopTask(taskId);
  }

  // After system:init lands and we don't know the binary's effort, probe it.
  // This mirrors the original session.ts behaviour.
  let probedEffort = false;
  client.onStateChange((s) => {
    if (probedEffort) return;
    if (!s.sessionId) return;
    probedEffort = true;
    if (currentArgs.effort) return; // explicit/persisted value wins
    void client
      .getSettings()
      .then((inner) => {
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
        setEffortErr(`could not read effort from get_settings: ${String(err)}`);
      });
  });

  const atoms: CcAtoms = {
    status,
    lastError,
    init,
    messages,
    activeStreamId,
    activeMode,
    pendingMode,
    modeError,
    activeModel,
    pendingModel,
    modelError,
    activeEffort,
    pendingEffort,
    effortError,
    pendingPermissions,
    hookEvents,
    shellEntries,
    tasks,
    sessionState,
  };

  return {
    atoms,
    client,
    connect,
    disconnect,
    sendMessage,
    sendShellContext: (cmd, fu) => client.sendShellContext(cmd, fu),
    sendBashSideChannel: (cmd) => client.sendBashSideChannel(cmd),
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
    respondToPermission: (id, decision) => client.respondToPermission(id, decision),
    fetchFileSuggestions,
    dismissShellEntry: (id) => client.dismissShellEntry(id),
  };
}

// ============================================================ Forwarding transport

/**
 * A `Transport` whose backing channel can be hot-swapped. ClaudeClient
 * subscribes to it once at construction; we then swap the underlying
 * transport whenever the WS opens / disconnects.
 *
 * Also has a "local frame" handler that intercepts `_local:*` frames
 * before they reach the ClaudeClient — ClaudeClient doesn't know about
 * bridge-level extensions.
 */
function makeForwardingTransport() {
  const handlers = new Set<(f: unknown) => void>();
  let inner: WsClientTransportLike | null = null;
  let unsub: (() => void) | null = null;
  let localHandler: ((f: unknown) => boolean) | null = null;
  let initSeen = false;

  const transport: WsClientTransportLike = {
    async send(frame) {
      if (!inner) return;
      await inner.send(frame);
    },
    onFrame(handler) {
      handlers.add(handler);
      return () => {
        handlers.delete(handler);
      };
    },
    async close() {
      // Forwarder doesn't own its inner — close is a no-op.
    },
    get closed() {
      return inner?.closed ?? false;
    },
  };

  function deliver(frame: unknown) {
    // Track system:init so respawn knows when to reset.
    if (
      frame &&
      typeof frame === "object" &&
      (frame as { type?: unknown }).type === "system" &&
      (frame as { subtype?: unknown }).subtype === "init"
    ) {
      initSeen = true;
    }
    if (localHandler && localHandler(frame)) return;
    for (const h of [...handlers]) {
      try {
        h(frame);
      } catch (err) {
        console.error("[forwarder] handler error", err);
      }
    }
  }

  return {
    transport,
    attach(t: WsClientTransportLike) {
      if (unsub) unsub();
      inner = t;
      unsub = t.onFrame(deliver);
    },
    detach() {
      if (unsub) unsub();
      unsub = null;
      inner = null;
    },
    setLocalHandler(h: (f: unknown) => boolean) {
      localHandler = h;
    },
    resetInitSeen() {
      initSeen = false;
    },
    get initSeen() {
      return initSeen;
    },
  };
}

// ============================================================ Helpers

/** Build a read-only atom that mirrors a field of `client.getSnapshot()`. */
function atomFromSelector<T>(client: ClaudeClient, sel: (s: ClientState) => T): ReadableAtom<T> {
  const a = atom<T>(sel(client.getSnapshot()));
  client.onStateChange((s) => {
    const next = sel(s);
    if (a.get() !== next) a.set(next);
  });
  return a;
}

// Type compatibility check — wsClientTransport extends our minimal interface.
export type { WsClientTransport };
