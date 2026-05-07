import { describe, test, expect, beforeEach } from "bun:test";
import { createTestSession, flush, type TestSession } from "./helpers";

let h: TestSession;

beforeEach(() => {
  h = createTestSession();
  h.session.connect();
});

describe("task lifecycle", () => {
  test("task_started inserts a running task", () => {
    h.ws.pushFrame({
      type: "system",
      subtype: "task_started",
      task_id: "t1",
      tool_use_id: "tu1",
      task_type: "Bash",
      description: "running ls",
    } as any);

    const tasks = h.session.atoms.tasks.get();
    expect(tasks).toHaveLength(1);
    expect(tasks[0]).toMatchObject({
      taskId: "t1",
      toolUseId: "tu1",
      taskType: "Bash",
      description: "running ls",
      status: "running",
      transcript: [],
    });
  });

  test("task_progress updates description / last_tool_name / usage without changing status", () => {
    h.ws.pushFrame({
      type: "system", subtype: "task_started", task_id: "t1", description: "init",
    } as any);
    h.ws.pushFrame({
      type: "system",
      subtype: "task_progress",
      task_id: "t1",
      description: "step 2",
      last_tool_name: "Read",
      usage: { total_tokens: 1234, tool_uses: 3, duration_ms: 500 },
    } as any);

    const tasks = h.session.atoms.tasks.get();
    expect(tasks[0]).toMatchObject({
      taskId: "t1",
      description: "step 2",
      lastToolName: "Read",
      status: "running",
      usage: { totalTokens: 1234, toolUses: 3, durationMs: 500 },
    });
  });

  test("task_updated patch.status:'killed' flips status to 'stopped' (regression)", () => {
    h.ws.pushFrame({
      type: "system", subtype: "task_started", task_id: "t1", description: "x",
    } as any);
    h.ws.pushFrame({
      type: "system", subtype: "task_updated", task_id: "t1", patch: { status: "killed" },
    } as any);

    const t = h.session.atoms.tasks.get()[0];
    expect(t.status).toBe("stopped");
  });

  test("task_updated patch.status:'completed'/'failed' pass through", () => {
    h.ws.pushFrame({ type: "system", subtype: "task_started", task_id: "t1", description: "x" } as any);
    h.ws.pushFrame({ type: "system", subtype: "task_updated", task_id: "t1", patch: { status: "completed" } } as any);
    expect(h.session.atoms.tasks.get()[0].status).toBe("completed");

    h.ws.pushFrame({ type: "system", subtype: "task_started", task_id: "t2", description: "y" } as any);
    h.ws.pushFrame({ type: "system", subtype: "task_updated", task_id: "t2", patch: { status: "failed" } } as any);
    expect(h.session.atoms.tasks.get().find((t) => t.taskId === "t2")!.status).toBe("failed");
  });

  test("task_notification finalizes with status completed/failed/stopped", () => {
    h.ws.pushFrame({ type: "system", subtype: "task_started", task_id: "t1", description: "x" } as any);
    h.ws.pushFrame({
      type: "system",
      subtype: "task_notification",
      task_id: "t1",
      status: "completed",
      summary: "done",
      output_file: "/tmp/out",
    } as any);

    const t = h.session.atoms.tasks.get()[0];
    expect(t).toMatchObject({ status: "completed", summary: "done", outputFile: "/tmp/out" });
  });

  test("sub-agent dispatch ordering: parent_tool_use_id frames go to transcript, not main timeline (regression)", () => {
    h.ws.pushFrame({
      type: "system", subtype: "task_started", task_id: "t1", tool_use_id: "tu1", description: "subagent",
    } as any);

    const messagesBefore = h.session.atoms.messages.get().length;

    // stream_event with parent_tool_use_id should NOT touch main timeline
    h.ws.pushFrame({
      type: "stream_event",
      parent_tool_use_id: "tu1",
      event: { type: "message_start", message: { id: "mSub" } },
    } as any);

    const messagesAfter = h.session.atoms.messages.get();
    expect(messagesAfter).toHaveLength(messagesBefore);

    const t = h.session.atoms.tasks.get().find((x) => x.taskId === "t1")!;
    expect(t.transcript).toHaveLength(1);
    expect(t.transcript[0].kind).toBe("frame");

    // Same applies to assistant frames with parent_tool_use_id
    h.ws.pushFrame({
      type: "assistant",
      parent_tool_use_id: "tu1",
      message: { id: "mSub", content: [{ type: "text", text: "child reply" }] },
    } as any);

    const t2 = h.session.atoms.tasks.get().find((x) => x.taskId === "t1")!;
    expect(t2.transcript).toHaveLength(2);
    // Main timeline still untouched
    expect(h.session.atoms.messages.get()).toHaveLength(messagesBefore);
  });

  test("frames with unknown parent_tool_use_id fall through to main timeline", () => {
    const before = h.session.atoms.messages.get().length;
    // parent_tool_use_id references a tool_use we never saw a task_started for
    h.ws.pushFrame({
      type: "assistant",
      parent_tool_use_id: "unknown-tu",
      message: { id: "mX", content: [] },
    } as any);
    expect(h.session.atoms.messages.get().length).toBe(before + 1);
  });

  test("frames without parent_tool_use_id land in main timeline normally", () => {
    h.ws.pushFrame({
      type: "system", subtype: "task_started", task_id: "t1", tool_use_id: "tu1", description: "x",
    } as any);
    const before = h.session.atoms.messages.get().length;
    h.ws.pushFrame({
      type: "assistant",
      message: { id: "mMain", content: [] },
    } as any);
    expect(h.session.atoms.messages.get().length).toBe(before + 1);
  });
});

describe("stopTask", () => {
  test("sends stop_task control_request and resolves on success", async () => {
    const p = h.session.stopTask("t1");
    const sent = h.ws.sentFrames.find(
      (f) => (f as any).type === "control_request" && (f as any).request?.subtype === "stop_task",
    ) as any;
    expect(sent).toBeDefined();
    expect(sent.request).toEqual({ subtype: "stop_task", task_id: "t1" });

    h.ws.pushFrame({
      type: "control_response",
      response: { subtype: "success", request_id: sent.request_id, response: {} },
    } as any);
    await p;
    expect(true).toBe(true);
  });

  test("rejects when binary returns error", async () => {
    const p = h.session.stopTask("t1");
    const sent = h.ws.sentFrames.find(
      (f) => (f as any).type === "control_request" && (f as any).request?.subtype === "stop_task",
    ) as any;
    h.ws.pushFrame({
      type: "control_response",
      response: { subtype: "error", request_id: sent.request_id, error: "task not found" },
    } as any);
    await expect(p).rejects.toBe("task not found");
  });
});
