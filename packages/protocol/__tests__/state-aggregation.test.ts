/**
 * Tests for the rich state aggregations on `ClaudeClient`'s ClientState:
 *   - streaming-bubble assembly (stream_event frames)
 *   - task lifecycle state machine
 *   - shell-entry tracking via local_command_output
 *   - hook event ring buffer
 *   - mode round-trip (begin/resolve/fail)
 */

import { describe, test, expect } from "bun:test";
import { bufferTransport } from "../src/transport/buffer";
import { ClaudeClient } from "../src/client";
import type { StreamingEntry, ToolUseBlock } from "../src/client/messages";

function getRequestId(frame: unknown): string {
  if (!frame || typeof frame !== "object") throw new Error("non-object frame");
  const f = frame as { request_id?: unknown };
  if (typeof f.request_id !== "string") throw new Error("no request_id");
  return f.request_id;
}

function ack(requestId: string, response?: Record<string, unknown>) {
  return {
    type: "control_response",
    response: {
      subtype: "success",
      request_id: requestId,
      ...(response ? { response } : {}),
    },
  };
}

async function tick() {
  await new Promise((r) => setTimeout(r, 0));
}

describe("streaming-bubble assembly", () => {
  test("message_start through message_stop builds an InFlightMessage", () => {
    const h = bufferTransport();
    const client = new ClaudeClient(h.transport);

    h.feed({ type: "stream_event", event: { type: "message_start", message: { id: "m1", model: "claude-opus-4-7" } } });
    h.feed({
      type: "stream_event",
      event: { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } },
    });
    h.feed({
      type: "stream_event",
      event: { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "Hel" } },
    });
    h.feed({
      type: "stream_event",
      event: { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "lo!" } },
    });
    h.feed({ type: "stream_event", event: { type: "content_block_stop", index: 0 } });
    h.feed({ type: "stream_event", event: { type: "message_stop" } });

    const snap = client.getSnapshot();
    expect(snap.activeStreamId).toBe("m1");
    const stream = snap.messages.find((e) => e.kind === "streaming") as StreamingEntry | undefined;
    expect(stream).toBeDefined();
    expect(stream!.msg.content[0]).toEqual({ type: "text", text: "Hello!" });
    expect(stream!.msg.done).toBe(true);
  });

  test("canonical assistant envelope replaces streaming entry with frame entry", () => {
    const h = bufferTransport();
    const client = new ClaudeClient(h.transport);
    h.feed({ type: "stream_event", event: { type: "message_start", message: { id: "m1" } } });
    h.feed({ type: "stream_event", event: { type: "message_stop" } });
    h.feed({
      type: "assistant",
      message: { id: "m1", role: "assistant", content: [{ type: "text", text: "Hello!" }] },
    });
    const snap = client.getSnapshot();
    expect(snap.messages.find((e) => e.kind === "streaming")).toBeUndefined();
    const frame = snap.messages.find((e) => e.kind === "frame");
    expect(frame).toBeDefined();
    expect(snap.activeStreamId).toBeNull();
  });

  test("tool_use input_json_delta accumulates partial_json and parses on stop", () => {
    const h = bufferTransport();
    const client = new ClaudeClient(h.transport);
    h.feed({ type: "stream_event", event: { type: "message_start", message: { id: "m2" } } });
    h.feed({
      type: "stream_event",
      event: {
        type: "content_block_start",
        index: 0,
        content_block: { type: "tool_use", id: "tu1", name: "Bash", input: {} },
      },
    });
    h.feed({
      type: "stream_event",
      event: { type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: '{"cmd"' } },
    });
    h.feed({
      type: "stream_event",
      event: { type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: ':"ls"}' } },
    });
    h.feed({ type: "stream_event", event: { type: "content_block_stop", index: 0 } });

    const stream = client.getSnapshot().messages.find((e) => e.kind === "streaming") as StreamingEntry;
    const block = stream.msg.content[0] as ToolUseBlock;
    expect(block.partialJson).toBe('{"cmd":"ls"}');
    expect(block.parsed).toBe(true);
    expect(block.input).toEqual({ cmd: "ls" });
  });
});

describe("task lifecycle", () => {
  test("task_started creates a running task", () => {
    const h = bufferTransport();
    const client = new ClaudeClient(h.transport);
    h.feed({
      type: "system",
      subtype: "task_started",
      task_id: "t1",
      tool_use_id: "tu1",
      task_type: "Bash",
      description: "running ls",
    });
    const tasks = client.getSnapshot().tasks;
    expect(tasks).toHaveLength(1);
    expect(tasks[0]).toMatchObject({
      taskId: "t1",
      toolUseId: "tu1",
      taskType: "Bash",
      description: "running ls",
      status: "running",
    });
  });

  test("task_progress updates description + usage", () => {
    const h = bufferTransport();
    const client = new ClaudeClient(h.transport);
    h.feed({ type: "system", subtype: "task_started", task_id: "t1", description: "init" });
    h.feed({
      type: "system",
      subtype: "task_progress",
      task_id: "t1",
      description: "halfway",
      usage: { total_tokens: 100, tool_uses: 2 },
    });
    const task = client.getSnapshot().tasks[0]!;
    expect(task.description).toBe("halfway");
    expect(task.usage).toEqual({ totalTokens: 100, toolUses: 2 });
  });

  test("task_notification with status:completed marks the task completed", () => {
    const h = bufferTransport();
    const client = new ClaudeClient(h.transport);
    h.feed({ type: "system", subtype: "task_started", task_id: "t1", description: "x" });
    h.feed({
      type: "system",
      subtype: "task_notification",
      task_id: "t1",
      status: "completed",
      summary: "done",
    });
    expect(client.getSnapshot().tasks[0]).toMatchObject({ status: "completed", summary: "done" });
  });

  test("sub-agent frames route into the matching task transcript", () => {
    const h = bufferTransport();
    const client = new ClaudeClient(h.transport);
    h.feed({
      type: "system",
      subtype: "task_started",
      task_id: "t1",
      tool_use_id: "tu-parent",
      description: "subagent",
    });
    h.feed({
      type: "assistant",
      message: { id: "m1", role: "assistant", content: [{ type: "text", text: "thinking..." }] },
      parent_tool_use_id: "tu-parent",
    });
    const task = client.getSnapshot().tasks[0]!;
    expect(task.transcript).toHaveLength(1);
    // The main timeline should NOT include this assistant frame.
    const mainAssistantEntries = client
      .getSnapshot()
      .messages.filter(
        (m) => m.kind === "frame" && (m.frame as { type?: string }).type === "assistant",
      );
    expect(mainAssistantEntries).toHaveLength(0);
  });
});

describe("shell entries", () => {
  test("sendBashSideChannel queues an entry and emits bash_command", async () => {
    const h = bufferTransport();
    const client = new ClaudeClient(h.transport);
    client.sendBashSideChannel("ls -la");
    await tick();
    const out = h.drain();
    expect(out[0]).toMatchObject({ type: "bash_command", command: "ls -la" });
    const entries = client.getSnapshot().shellEntries;
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ command: "ls -la", source: "sideChannel" });
  });

  test("local_command_output appends to the head shell entry", () => {
    const h = bufferTransport();
    const client = new ClaudeClient(h.transport);
    client.sendBashSideChannel("ls");
    h.feed({ type: "system", subtype: "local_command_output", content: "file1\nfile2" });
    const entry = client.getSnapshot().shellEntries[0]!;
    expect(entry.chunks).toContain("file1\nfile2");
  });

  test("user/isReplay bash output closes the head capture (context source)", () => {
    const h = bufferTransport();
    const client = new ClaudeClient(h.transport);
    client.sendShellContext("echo hi");
    h.feed({
      type: "user",
      isReplay: true,
      message: { role: "user", content: "<bash-input>echo hi</bash-input>" },
    });
    h.feed({
      type: "user",
      isReplay: true,
      message: {
        role: "user",
        content:
          "<bash-input>echo hi</bash-input><bash-stdout>hi</bash-stdout><bash-stderr></bash-stderr><bash-exit-code>0</bash-exit-code>",
      },
    });
    const entry = client.getSnapshot().shellEntries[0]!;
    expect(entry.chunks).toContain("hi");
  });
});

describe("hook events", () => {
  test("hook_started → hook_progress → hook_response build a ring", () => {
    const h = bufferTransport();
    const client = new ClaudeClient(h.transport);
    h.feed({ type: "system", subtype: "hook_started", hook_event_name: "PreToolUse", hook_id: "h1" });
    h.feed({ type: "system", subtype: "hook_progress", hook_event_name: "PreToolUse", hook_id: "h1" });
    h.feed({ type: "system", subtype: "hook_response", hook_event_name: "PreToolUse", hook_id: "h1" });
    const events = client.getSnapshot().hookEvents;
    expect(events).toHaveLength(3);
    expect(events.map((e) => e.subtype)).toEqual(["hook_started", "hook_progress", "hook_response"]);
    expect(events[0]!.hookName).toBe("PreToolUse");
  });
});

describe("mode tracking", () => {
  test("setPermissionMode round-trip: pending → active on success", async () => {
    const h = bufferTransport();
    const client = new ClaudeClient(h.transport);
    const p = client.setPermissionMode("plan");
    await tick();
    expect(client.getSnapshot().pendingMode).toBe("plan");
    expect(client.getSnapshot().activeMode).toBeNull();
    const out = h.drain();
    h.feed(ack(getRequestId(out[0])));
    await p;
    const snap = client.getSnapshot();
    expect(snap.activeMode).toBe("plan");
    expect(snap.pendingMode).toBeNull();
    expect(snap.lastPermissionMode).toBe("plan");
  });

  test("setPermissionMode on error: pending clears, modeError set", async () => {
    const h = bufferTransport();
    const client = new ClaudeClient(h.transport);
    const p = client.setPermissionMode("bypassPermissions");
    await tick();
    const out = h.drain();
    const rid = getRequestId(out[0]);
    h.feed({
      type: "control_response",
      response: { subtype: "error", request_id: rid, error: "not allowed" },
    });
    await expect(p).rejects.toThrow(/not allowed/);
    const snap = client.getSnapshot();
    expect(snap.activeMode).toBeNull();
    expect(snap.pendingMode).toBeNull();
    expect(snap.modeError).toMatch(/not allowed/);
  });

  test("setModel round-trip same shape as setPermissionMode", async () => {
    const h = bufferTransport();
    const client = new ClaudeClient(h.transport);
    const p = client.setModel("sonnet");
    await tick();
    expect(client.getSnapshot().pendingModel).toBe("sonnet");
    const out = h.drain();
    h.feed(ack(getRequestId(out[0])));
    await p;
    expect(client.getSnapshot().activeModel).toBe("sonnet");
    expect(client.getSnapshot().pendingModel).toBeNull();
    expect(client.getSnapshot().lastModel).toBe("sonnet");
  });
});

describe("init data", () => {
  test("system/init populates init { sessionId, model, cwd, agents, ... } + activeMode/Model", () => {
    const h = bufferTransport();
    const client = new ClaudeClient(h.transport);
    h.feed({
      type: "system",
      subtype: "init",
      session_id: "sess-1",
      model: "claude-opus-4-7",
      permissionMode: "default",
      cwd: "/tmp/proj",
      agents: ["agent-a"],
      slash_commands: ["/help"],
      skills: ["skill-x"],
    });
    const s = client.getSnapshot();
    expect(s.sessionId).toBe("sess-1");
    expect(s.init.cwd).toBe("/tmp/proj");
    expect(s.init.agents).toEqual(["agent-a"]);
    expect(s.init.slashCommands).toEqual(["/help"]);
    expect(s.init.skills).toEqual(["skill-x"]);
    expect(s.activeMode).toBe("default");
    expect(s.activeModel).toBe("claude-opus-4-7");
  });
});

describe("UI permissions queue (no onCanUseTool)", () => {
  test("can_use_tool queues a PendingPermission until respondToPermission", () => {
    const h = bufferTransport();
    const client = new ClaudeClient(h.transport);
    h.feed({
      type: "control_request",
      request_id: "perm-1",
      request: { subtype: "can_use_tool", tool_name: "Bash", input: { cmd: "ls" } },
    });
    const queue = client.getSnapshot().pendingPermissions;
    expect(queue).toHaveLength(1);
    expect(queue[0]).toMatchObject({
      id: "perm-1",
      toolName: "Bash",
      input: { cmd: "ls" },
    });
    expect(client.getSnapshot().sessionState).toBe("requires_action");

    client.respondToPermission("perm-1", { behavior: "allow" });
    const after = client.getSnapshot();
    expect(after.pendingPermissions).toHaveLength(0);
    expect(after.sessionState).toBe("running");
  });
});
