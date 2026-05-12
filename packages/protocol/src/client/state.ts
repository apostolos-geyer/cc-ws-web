/**
 * `ClientState` + `StateHolder` — `ClaudeClient`'s in-memory session model.
 *
 * The state is composed of independent aggregators (messages, tasks,
 * shell, hooks, permissions) each owning a slice of the wire-frame →
 * state transformation. The holder threads frames through every
 * aggregator and fans out a single combined snapshot to subscribers.
 *
 * Mutations are synchronous inside the inbound-frame handler;
 * subscribers fire after each mutation with the post-mutation snapshot.
 *
 * Universal — no reactivity dep, no DOM, no runtime-specific imports.
 */

import type { Transport } from "../transport/index";
import {
  isAssistantFrame,
  isControlRequest,
  isControlResponse,
  isStreamEventFrame,
  isSystemFrame,
  type InboundFrame,
  type SystemInit,
  type SystemSessionStateChanged,
} from "./frames";
import {
  createMessagesAggregator,
  type MessageEntry,
  type MessagesAggregator,
} from "./messages";
import {
  createTasksAggregator,
  type TaskEntry,
  type TasksAggregator,
} from "./tasks";
import {
  createShellAggregator,
  type ShellAggregator,
  type ShellEntry,
} from "./shell";
import {
  createHooksAggregator,
  type HookEntry,
  type HooksAggregator,
} from "./hooks";
import {
  createPermissionsAggregator,
  type OnCanUseTool,
  type PendingPermission,
  type PermissionDecision,
  type PermissionsAggregator,
} from "./permissions";

export type SessionState = "idle" | "running" | "requires_action" | "ended" | "unknown";

export interface InitData {
  sessionId: string | null;
  model: string | null;
  cwd: string | null;
  agents: string[];
  slashCommands: string[];
  skills: string[];
}

export interface ClientState {
  // session-level
  sessionId: string | null;
  sessionState: SessionState;
  init: InitData;
  // mode / model tracking (round-trip aware)
  activeMode: string | null;
  pendingMode: string | null;
  modeError: string | null;
  activeModel: string | null;
  pendingModel: string | null;
  modelError: string | null;
  // last-set fields (post-success record; preserved across rounds)
  lastModel: string | null;
  lastPermissionMode: string | null;
  // streaming bubbles + canonical assistant envelopes
  messages: MessageEntry[];
  activeStreamId: string | null;
  /** Bumps on non-streaming changes only; persistence layers subscribe to
   *  this (not `messages`) to skip per-token churn. */
  messagesRevision: number;
  /** Outbound `type:"user"` frames sent via `sendUserMessage()`. */
  userMessages: unknown[];
  // task state machine
  tasks: TaskEntry[];
  // shell side-channel
  shellEntries: ShellEntry[];
  // hooks ring
  hookEvents: HookEntry[];
  // pending tool-use permissions (UI shape)
  pendingPermissions: PendingPermission[];
}

export function initialClientState(): ClientState {
  return {
    sessionId: null,
    sessionState: "unknown",
    init: {
      sessionId: null,
      model: null,
      cwd: null,
      agents: [],
      slashCommands: [],
      skills: [],
    },
    activeMode: null,
    pendingMode: null,
    modeError: null,
    activeModel: null,
    pendingModel: null,
    modelError: null,
    lastModel: null,
    lastPermissionMode: null,
    messages: [],
    activeStreamId: null,
    messagesRevision: 0,
    userMessages: [],
    tasks: [],
    shellEntries: [],
    hookEvents: [],
    pendingPermissions: [],
  };
}

export interface StateHolderOptions {
  transport: Transport;
  /** Optional UI callback for can_use_tool. If absent, requests queue in `pendingPermissions`. */
  onCanUseTool?: OnCanUseTool;
  /** Test seam — clock injected for deterministic timestamps. */
  now?: () => number;
  /** Test seam — id factory injected for deterministic ids. */
  newId?: () => string;
}

export class StateHolder {
  private state: ClientState = initialClientState();
  private subscribers = new Set<(state: ClientState) => void>();
  private initSeen = false;

  readonly messages: MessagesAggregator;
  readonly tasks: TasksAggregator;
  readonly shell: ShellAggregator;
  readonly hooks: HooksAggregator;
  readonly permissions: PermissionsAggregator;

  constructor(opts: StateHolderOptions) {
    const sync = () => this.emit();

    this.messages = createMessagesAggregator({
      onChange: ({ messages, activeStreamId, revision }) => {
        this.state.messages = messages;
        this.state.activeStreamId = activeStreamId;
        this.state.messagesRevision = revision;
        sync();
      },
      newId: opts.newId,
    });

    this.tasks = createTasksAggregator({
      onChange: ({ tasks }) => {
        this.state.tasks = tasks;
        sync();
      },
      now: opts.now,
      newId: opts.newId,
    });

    this.shell = createShellAggregator({
      transport: opts.transport,
      sendUserMessage: (_text: string) => {
        // The ClaudeClient registers a real callback after construction
        // via setSendUserMessage.
        this.deferredSendUserMessage?.(_text);
      },
      onChange: ({ shellEntries }) => {
        this.state.shellEntries = shellEntries;
        sync();
      },
      newId: opts.newId,
    });

    this.hooks = createHooksAggregator({
      onChange: ({ hookEvents }) => {
        this.state.hookEvents = hookEvents;
        sync();
      },
      now: opts.now,
      newId: opts.newId,
    });

    this.permissions = createPermissionsAggregator({
      send: (frame: unknown) => opts.transport.send(frame),
      onCanUseTool: opts.onCanUseTool,
      onChange: ({ pendingPermissions }) => {
        this.state.pendingPermissions = pendingPermissions;
        sync();
      },
    });
  }

  private deferredSendUserMessage: ((text: string) => void) | null = null;

  /** Wired by ClaudeClient after construction so the shell's follow-up
   * path can fire `sendUserMessage`. */
  setSendUserMessage(fn: (text: string) => void): void {
    this.deferredSendUserMessage = fn;
  }

  getSnapshot(): ClientState {
    return this.state;
  }

  subscribe(cb: (state: ClientState) => void): () => void {
    this.subscribers.add(cb);
    return () => this.subscribers.delete(cb);
  }

  /** Apply a mutator and notify subscribers. */
  update(mut: (s: ClientState) => void): void {
    mut(this.state);
    this.emit();
  }

  emit(): void {
    for (const s of [...this.subscribers]) s(this.state);
  }

  // ============================================================ Frame ingestion

  /**
   * Apply known mutations for a given inbound frame. Returns true if any
   * aggregator claimed the frame (callers can use this to skip duplicate
   * handling, e.g. for hook events).
   */
  applyInbound(frame: InboundFrame): boolean {
    // _local frames are bridge-only; ignore here (consumers handle them).
    if (!frame || typeof frame !== "object") return false;

    // System dispatch
    if (isSystemFrame(frame)) {
      // system/init: capture session id + initial mode/model + push to timeline
      if (frame.subtype === "init") {
        const f = frame as SystemInit;
        if (this.initSeen) {
          this.messages.pushFrame(frame);
          return true;
        }
        this.initSeen = true;
        const sid = f.session_id ?? null;
        const m = f.permissionMode ?? f.permission_mode ?? null;
        const im = f.model ?? null;
        this.update((s) => {
          if (sid) s.sessionId = sid;
          if (m) s.activeMode = m;
          if (im) s.activeModel = im;
          s.sessionState = "running";
          s.init = {
            sessionId: sid,
            model: im,
            cwd: f.cwd ?? null,
            agents: f.agents ?? [],
            slashCommands: f.slash_commands ?? [],
            skills: f.skills ?? [],
          };
        });
        this.messages.pushFrame(frame);
        return true;
      }

      // session_state_changed
      if (frame.subtype === "session_state_changed") {
        const f = frame as SystemSessionStateChanged;
        if (f.state === "idle" || f.state === "running" || f.state === "requires_action") {
          this.update((s) => {
            s.sessionState = f.state;
          });
        }
        return true;
      }

      // hooks
      if (
        frame.subtype === "hook_started" ||
        frame.subtype === "hook_progress" ||
        frame.subtype === "hook_response"
      ) {
        this.hooks.ingest(frame);
        return true;
      }

      // task lifecycle
      if (
        frame.subtype === "task_started" ||
        frame.subtype === "task_progress" ||
        frame.subtype === "task_updated" ||
        frame.subtype === "task_notification"
      ) {
        this.tasks.handleTaskEvent(frame);
        return true;
      }

      // shell local_command_output
      if (frame.subtype === "local_command_output") {
        if (this.shell.handleLocalCommandOutput(frame)) return true;
      }

      // Unknown / unhandled system frames still appear on the main timeline.
      this.messages.pushFrame(frame);
      return true;
    }

    // control_response: correlated by ClaudeClient via the correlator;
    // not appended to the timeline.
    if (isControlResponse(frame)) return false;

    // can_use_tool: route via permissions aggregator. (Also bumps session state.)
    if (isControlRequest(frame) && frame.request.subtype === "can_use_tool") {
      this.update((s) => {
        s.sessionState = "requires_action";
      });
      this.permissions.ingest(frame);
      return true;
    }

    // Other control_request frames: not appended (rare; binary mostly only
    // sends can_use_tool).
    if (isControlRequest(frame)) return false;

    // Shell-replay parser sits BEFORE messages so user/isReplay-bash frames
    // get sniffed for bash XML before they flow into the main timeline.
    // Returns false to allow the frame to continue to messages too.
    this.shell.handleShellReplay(frame);

    // Sub-agent routing: any frame with parent_tool_use_id goes to the
    // matching task's transcript, not the main timeline.
    if (this.tasks.handleSubAgentFrame(frame)) return true;

    // Streaming bubble assembly + canonical assistant envelope
    if (isStreamEventFrame(frame) || isAssistantFrame(frame)) {
      if (this.messages.ingest(frame)) return true;
    }

    // Rate-limit and other passthrough types: not appended to timeline.
    if ("type" in frame && frame.type === "rate_limit_event") return false;

    // Everything else lands on the main timeline.
    this.messages.pushFrame(frame);
    return true;
  }

  // ============================================================ Mode round-trip

  /** Called by ClaudeClient.setPermissionMode before send. */
  beginModeChange(mode: string): void {
    this.update((s) => {
      s.pendingMode = mode;
      s.modeError = null;
    });
  }

  /** Called on control_response success. */
  resolveModeChange(mode: string): void {
    this.update((s) => {
      s.activeMode = mode;
      s.pendingMode = null;
      s.lastPermissionMode = mode;
    });
  }

  /** Called on control_response error or transport failure. */
  failModeChange(err: string): void {
    this.update((s) => {
      s.pendingMode = null;
      s.modeError = err;
    });
  }

  /** Called by ClaudeClient.setModel before send. */
  beginModelChange(model: string): void {
    this.update((s) => {
      s.pendingModel = model;
      s.modelError = null;
    });
  }

  resolveModelChange(model: string): void {
    this.update((s) => {
      s.activeModel = model;
      s.pendingModel = null;
      s.lastModel = model;
    });
  }

  failModelChange(err: string): void {
    this.update((s) => {
      s.pendingModel = null;
      s.modelError = err;
    });
  }

  // ============================================================ Permission verdict

  respondToPermission(id: string, decision: PermissionDecision): void {
    this.permissions.respond(id, decision);
    // If queue is empty and we were "requires_action", back to "running".
    if (this.state.pendingPermissions.length === 0 && this.state.sessionState === "requires_action") {
      this.update((s) => {
        s.sessionState = "running";
      });
    }
  }

  /** Drop pending permissions (on respawn/disconnect). */
  clearPermissionsQueue(): void {
    this.permissions.clearQueue();
  }

  // ============================================================ User messages

  recordUserMessage(frame: unknown): void {
    this.update((s) => {
      s.userMessages.push(frame);
    });
  }

  /** Record the local user message in the main timeline. */
  pushLocalUserMessage(text: string): void {
    this.messages.pushLocalUser(text);
  }

  // ============================================================ Lifecycle

  markEnded(): void {
    this.update((s) => {
      s.sessionState = "ended";
    });
  }

  /** Reset the per-session timeline + tasks + shell on respawn-with-reset. */
  resetTimeline(): void {
    this.initSeen = false;
    this.messages.reset();
    this.tasks.reset();
    this.shell.reset();
    this.hooks.reset();
    this.update((s) => {
      s.sessionId = null;
      s.init = {
        sessionId: null,
        model: null,
        cwd: null,
        agents: [],
        slashCommands: [],
        skills: [],
      };
    });
  }

  /** Hydrate the messages timeline from a persisted snapshot. */
  hydrateMessages(entries: MessageEntry[]): void {
    this.messages.hydrate(entries);
  }

  /** Seed the initial activeMode/activeModel atoms before init (used by
   *  persistence-hydrating clients). */
  seedMode(mode: string | null): void {
    if (!mode) return;
    this.update((s) => {
      s.activeMode = mode;
    });
  }
  seedModel(model: string | null): void {
    if (!model) return;
    this.update((s) => {
      s.activeModel = model;
    });
  }
  /**
   * Seed sessionId before the first system/init lands. The binary only
   * emits system/init AFTER the first user message in stream-json mode, so
   * a resumed session has no way to populate `state.sessionId` until the
   * user sends something. Without seeding, the persistence writer's
   * debounced first-save flushes `{sessionId: null, ...}` 250ms after
   * mount — wiping the resume id out of localStorage. Also the UI's
   * `$init.sessionId` reads null and the session indicator stays empty.
   * Seeding from the persisted snapshot fixes both.
   */
  seedSessionId(id: string | null): void {
    if (!id) return;
    this.update((s) => {
      s.sessionId = id;
      s.init = { ...s.init, sessionId: id };
    });
  }
}
