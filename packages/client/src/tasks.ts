// Task lifecycle: system:task_started / task_progress / task_updated /
// task_notification, plus sub-agent fan-out (frames carrying a non-null
// parent_tool_use_id are routed to the matching task's transcript instead
// of the main timeline).

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
  // Sub-agent transcript (frames received with parent_tool_use_id matching
  // toolUseId). Populated only for tasks that emit their own frames —
  // bash tasks won't have these.
  transcript: MessageEntry[];
};

const TASKS_CAP = 100;

export function capTasksKeepRunning<T extends { status: string }>(arr: T[], cap: number): T[] {
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

export function createTasksController(): TasksController {
  const tasks = atom<TaskEntry[]>([]);

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

  // task_started bookend opens a task; progress updates the running entry;
  // task_notification closes it with terminal status.
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

  // Sub-agent frames must be checked BEFORE messagesCtrl.ingest in the
  // dispatch chain — the messages controller eats stream_event / assistant
  // unconditionally, which would otherwise pollute the main timeline with
  // sub-agent bubbles and starve the per-task transcript.
  function handleSubAgentFrame(frame: InboundFrame): boolean {
    const parent =
      "parent_tool_use_id" in frame && typeof frame.parent_tool_use_id === "string"
        ? frame.parent_tool_use_id
        : null;
    if (!parent) return false;
    const arr = tasks.get();
    const idx = arr.findIndex((t) => t.toolUseId === parent);
    // Race: task_started not yet observed. Fall through so the frame still
    // appears somewhere — visible-but-misplaced beats dropped.
    if (idx === -1) return false;
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

  function reset() {
    tasks.set([]);
  }

  return {
    tasks,
    handleTaskEvent,
    handleSubAgentFrame,
    reset,
  };
}
