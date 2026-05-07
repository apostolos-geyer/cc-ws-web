// Frames carrying a non-null parent_tool_use_id are routed to the
// matching task's transcript instead of the main timeline.

import { atom, type WritableAtom } from "nanostores";
import type { MessageEntry } from "./messages";
import {
  isSystemFrame,
  type InboundFrame,
  type SystemTaskNotification,
  type SystemTaskProgress,
  type SystemTaskStarted,
  type SystemTaskUpdated,
  type TaskUsageBlock,
} from "./protocol";

// task_id is the value stopTask() takes; tool_use_id matches the
// spawning tool_use block (Bash, Agent, Task) so UI can nest progress
// inside the parent card
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

const TASKS_CAP = 100;

export function capTasksKeepRunning<T extends { status: string }>(arr: T[], cap: number): T[] {
  if (arr.length <= cap) return arr;
  // Evict oldest non-running first; if all are running, exceed the cap
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

export type TasksController = {
  tasks: WritableAtom<TaskEntry[]>;
  handleTaskEvent: (frame: InboundFrame) => boolean;
  handleSubAgentFrame: (frame: InboundFrame) => boolean;
  reset: () => void;
};

// Real binary ordering puts task_started ahead of fan-out frames,
// so anything still orphaned past the TTL is a wire-protocol bug
// worth surfacing in the console
const ORPHAN_TTL_MS = 5000;

type PendingFrame = { frame: InboundFrame; addedAt: number };

export function createTasksController(): TasksController {
  const tasks = atom<TaskEntry[]>([]);
  const pendingByParent = new Map<string, PendingFrame[]>();

  function gcPending(now: number) {
    for (const [parent, buf] of pendingByParent) {
      const kept = buf.filter((p) => now - p.addedAt < ORPHAN_TTL_MS);
      if (kept.length === buf.length) continue;
      const dropped = buf.length - kept.length;
      if (dropped > 0) {
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
    const arr = tasks.get();
    const idx = arr.findIndex((t) => t.toolUseId === parent);
    if (idx === -1) return;
    const next = arr.slice();
    const cur = arr[idx]!;
    const appended: MessageEntry[] = buf.map((p, i) => ({
      kind: "frame" as const,
      id: crypto.randomUUID(),
      frame: p.frame,
      arrivalIdx: cur.transcript.length + i,
    }));
    next[idx] = {
      ...cur,
      transcript: [...cur.transcript, ...appended],
      lastUpdate: Date.now(),
    };
    tasks.set(next);
  }

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
      if (f.tool_use_id) flushPendingFor(f.tool_use_id);
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

    // task_updated lands immediately on stop_task; the closing
    // task_notification arrives later, so we must flip status now
    // to avoid rendering a killed task as still-running
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

  // MUST run before messagesCtrl.ingest in the dispatch chain — messages
  // eats stream_event/assistant unconditionally and would pollute the
  // main timeline with sub-agent bubbles. Returning true claims the
  // frame: appended to the task transcript, buffered until task_started
  // arrives, or dropped after ORPHAN_TTL_MS.
  function handleSubAgentFrame(frame: InboundFrame): boolean {
    const parent =
      "parent_tool_use_id" in frame && typeof frame.parent_tool_use_id === "string"
        ? frame.parent_tool_use_id
        : null;
    if (!parent) return false;
    const now = Date.now();
    gcPending(now);
    const arr = tasks.get();
    const idx = arr.findIndex((t) => t.toolUseId === parent);
    if (idx === -1) {
      // task_started not yet observed; buffer until it lands
      const buf = pendingByParent.get(parent) ?? [];
      buf.push({ frame, addedAt: now });
      pendingByParent.set(parent, buf);
      return true;
    }
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
      lastUpdate: now,
    };
    tasks.set(next);
    return true;
  }

  function reset() {
    tasks.set([]);
    pendingByParent.clear();
  }

  return {
    tasks,
    handleTaskEvent,
    handleSubAgentFrame,
    reset,
  };
}
