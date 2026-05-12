/**
 * Task lifecycle aggregator.
 *
 * Drives `TaskEntry[]` off `system/task_*` frames. Routes sub-agent frames
 * (any frame carrying `parent_tool_use_id`) into the matching task's
 * transcript instead of the main timeline.
 *
 * Pure JS, no reactivity, runtime-agnostic. The orphan-frame TTL is computed
 * against a caller-supplied clock so tests can be deterministic.
 */

import type { MessageEntry } from "./messages";
import {
  isSystemFrame,
  type InboundFrame,
  type SystemTaskNotification,
  type SystemTaskProgress,
  type SystemTaskStarted,
  type SystemTaskUpdated,
  type TaskUsageBlock,
} from "./frames";

export type TaskStatus = "running" | "completed" | "failed" | "stopped";

export type TaskUsage = {
  totalTokens?: number;
  toolUses?: number;
  durationMs?: number;
};

export type TaskEntry = {
  taskId: string;
  toolUseId?: string;
  taskType?: string;
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
  // Frames whose parent_tool_use_id matches toolUseId; bash tasks
  // emit none and stay empty
  transcript: MessageEntry[];
};

const DEFAULT_TASKS_CAP = 100;
const DEFAULT_ORPHAN_TTL_MS = 5000;

export function capTasksKeepRunning<T extends { status: string }>(arr: T[], cap: number): T[] {
  if (arr.length <= cap) return arr;
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

function mapTaskUsage(u: TaskUsageBlock | undefined, prev?: TaskUsage): TaskUsage | undefined {
  if (!u) return prev;
  return {
    totalTokens: u.total_tokens ?? prev?.totalTokens,
    toolUses: u.tool_uses ?? prev?.toolUses,
    durationMs: u.duration_ms ?? prev?.durationMs,
  };
}

export interface TasksSnapshot {
  tasks: TaskEntry[];
}

export interface TasksAggregator {
  getSnapshot(): TasksSnapshot;
  handleTaskEvent(frame: InboundFrame): boolean;
  handleSubAgentFrame(frame: InboundFrame): boolean;
  reset(): void;
}

export interface TasksAggregatorOptions {
  onChange?: (snap: TasksSnapshot) => void;
  /** Test seam — defaults to `Date.now`. */
  now?: () => number;
  /** Test seam — defaults to `crypto.randomUUID()`. */
  newId?: () => string;
  cap?: number;
  orphanTtlMs?: number;
}

type PendingFrame = { frame: InboundFrame; addedAt: number };

export function createTasksAggregator(opts: TasksAggregatorOptions = {}): TasksAggregator {
  const onChange = opts.onChange ?? (() => {});
  const now = opts.now ?? (() => Date.now());
  const newId = opts.newId ?? (() => crypto.randomUUID());
  const cap = opts.cap ?? DEFAULT_TASKS_CAP;
  const orphanTtl = opts.orphanTtlMs ?? DEFAULT_ORPHAN_TTL_MS;

  let tasks: TaskEntry[] = [];
  const pendingByParent = new Map<string, PendingFrame[]>();

  function emit() {
    onChange({ tasks });
  }

  function gcPending(at: number) {
    for (const [parent, buf] of pendingByParent) {
      const kept = buf.filter((p) => at - p.addedAt < orphanTtl);
      if (kept.length === buf.length) continue;
      const dropped = buf.length - kept.length;
      if (dropped > 0) {
        // eslint-disable-next-line no-console
        console.warn("[tasks] orphan sub-agent frame dropped after TTL", parent, dropped);
      }
      if (kept.length === 0) {
        pendingByParent.delete(parent);
      } else {
        pendingByParent.set(parent, kept);
      }
    }
  }

  function flushPendingFor(parent: string) {
    const buf = pendingByParent.get(parent);
    if (!buf || buf.length === 0) return;
    pendingByParent.delete(parent);
    const idx = tasks.findIndex((t) => t.toolUseId === parent);
    if (idx === -1) return;
    const cur = tasks[idx]!;
    const appended: MessageEntry[] = buf.map((p, i) => ({
      kind: "frame" as const,
      id: newId(),
      frame: p.frame,
      arrivalIdx: cur.transcript.length + i,
    }));
    const next = tasks.slice();
    next[idx] = {
      ...cur,
      transcript: [...cur.transcript, ...appended],
      lastUpdate: now(),
    };
    tasks = next;
  }

  function upsertTask(
    taskId: string,
    mut: (t: TaskEntry) => TaskEntry,
    init?: () => TaskEntry,
  ) {
    const idx = tasks.findIndex((t) => t.taskId === taskId);
    if (idx === -1) {
      if (!init) return;
      tasks = capTasksKeepRunning([...tasks, mut(init())], cap);
    } else {
      const next = tasks.slice();
      next[idx] = mut(tasks[idx]!);
      tasks = capTasksKeepRunning(next, cap);
    }
  }

  function handleTaskEvent(frame: InboundFrame): boolean {
    if (!isSystemFrame(frame)) return false;

    if (frame.subtype === "task_started") {
      const f = frame as SystemTaskStarted;
      if (!f.task_id) return false;
      const at = now();
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
          lastUpdate: at,
        }),
        () => ({
          taskId: f.task_id,
          toolUseId: f.tool_use_id,
          taskType: f.task_type,
          description: f.description ?? "",
          workflowName: f.workflow_name,
          prompt: f.prompt,
          status: "running",
          startTime: at,
          lastUpdate: at,
          transcript: [],
        }),
      );
      if (f.tool_use_id) flushPendingFor(f.tool_use_id);
      emit();
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
        lastUpdate: now(),
      }));
      emit();
      return true;
    }

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
        lastUpdate: now(),
      }));
      emit();
      return true;
    }

    if (frame.subtype === "task_notification") {
      const f = frame as SystemTaskNotification;
      if (!f.task_id) return false;
      const status: TaskStatus =
        f.status === "completed" || f.status === "failed" || f.status === "stopped" ? f.status : "completed";
      const at = now();
      upsertTask(
        f.task_id,
        (t) => ({
          ...t,
          status,
          summary: f.summary ?? t.summary,
          outputFile: f.output_file ?? t.outputFile,
          usage: mapTaskUsage(f.usage, t.usage),
          lastUpdate: at,
        }),
        () => ({
          taskId: f.task_id,
          toolUseId: f.tool_use_id,
          taskType: undefined,
          description: f.summary ?? "",
          status,
          startTime: at,
          lastUpdate: at,
          transcript: [],
        }),
      );
      emit();
      return true;
    }

    return false;
  }

  function handleSubAgentFrame(frame: InboundFrame): boolean {
    const parent =
      "parent_tool_use_id" in frame && typeof (frame as { parent_tool_use_id?: unknown }).parent_tool_use_id === "string"
        ? (frame as { parent_tool_use_id: string }).parent_tool_use_id
        : null;
    if (!parent) return false;
    const at = now();
    gcPending(at);
    const idx = tasks.findIndex((t) => t.toolUseId === parent);
    if (idx === -1) {
      const buf = pendingByParent.get(parent) ?? [];
      buf.push({ frame, addedAt: at });
      pendingByParent.set(parent, buf);
      return true;
    }
    const cur = tasks[idx]!;
    const next = tasks.slice();
    next[idx] = {
      ...cur,
      transcript: [
        ...cur.transcript,
        {
          kind: "frame" as const,
          id: newId(),
          frame,
          arrivalIdx: cur.transcript.length,
        },
      ],
      lastUpdate: at,
    };
    tasks = next;
    emit();
    return true;
  }

  function reset() {
    tasks = [];
    pendingByParent.clear();
    emit();
  }

  return {
    getSnapshot: () => ({ tasks }),
    handleTaskEvent,
    handleSubAgentFrame,
    reset,
  };
}
