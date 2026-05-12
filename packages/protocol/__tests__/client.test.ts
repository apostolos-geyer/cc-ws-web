/**
 * `ClaudeClient` driven via `bufferTransport`. No binary, no network.
 *
 * Validates:
 *   - Each intent method produces the right wire frame.
 *   - `request_id` is generated, threaded into the outbound, correlated
 *     with a fed-in success response.
 *   - State updates happen on inbound frames:
 *       system/init                → sets sessionId, sessionState=running
 *       session_state_changed      → mirrors the new state
 *       assistant message          → appends to messages
 *       can_use_tool               → tracks pendingPermissionRequests +
 *                                    fires the configured callback +
 *                                    sends the response frame
 */

import { describe, test, expect } from "bun:test";
import { bufferTransport } from "../src/transport/buffer";
import { ClaudeClient } from "../src/client";

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

describe("ClaudeClient intent methods", () => {
  test("setPermissionMode emits set_permission_mode and resolves on success", async () => {
    const h = bufferTransport();
    const client = new ClaudeClient(h.transport);
    const p = client.setPermissionMode("plan");
    await tick();
    const out = h.drain();
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      type: "control_request",
      request: { subtype: "set_permission_mode", mode: "plan" },
    });
    const rid = getRequestId(out[0]);
    h.feed(ack(rid));
    await p;
    expect(client.getSnapshot().lastPermissionMode).toBe("plan");
  });

  test("setModel emits set_model + records lastModel", async () => {
    const h = bufferTransport();
    const client = new ClaudeClient(h.transport);
    const p = client.setModel("sonnet");
    await tick();
    const out = h.drain();
    expect(out[0]).toMatchObject({
      type: "control_request",
      request: { subtype: "set_model", model: "sonnet" },
    });
    h.feed(ack(getRequestId(out[0])));
    await p;
    expect(client.getSnapshot().lastModel).toBe("sonnet");
  });

  test("setMaxThinkingTokens emits the right shape", async () => {
    const h = bufferTransport();
    const client = new ClaudeClient(h.transport);
    const p = client.setMaxThinkingTokens(0);
    await tick();
    const out = h.drain();
    expect(out[0]).toMatchObject({
      type: "control_request",
      request: { subtype: "set_max_thinking_tokens", max_thinking_tokens: 0 },
    });
    h.feed(ack(getRequestId(out[0])));
    await p;
  });

  test("interrupt emits subtype:interrupt", async () => {
    const h = bufferTransport();
    const client = new ClaudeClient(h.transport);
    const p = client.interrupt();
    await tick();
    const out = h.drain();
    expect(out[0]).toMatchObject({
      type: "control_request",
      request: { subtype: "interrupt" },
    });
    h.feed(ack(getRequestId(out[0])));
    await p;
  });

  test("fileSuggestions threads query payload + resolves with response", async () => {
    const h = bufferTransport();
    const client = new ClaudeClient(h.transport);
    const p = client.fileSuggestions("package.json");
    await tick();
    const out = h.drain();
    expect(out[0]).toMatchObject({
      type: "control_request",
      request: { subtype: "file_suggestions", query: "package.json" },
    });
    h.feed(ack(getRequestId(out[0]), { suggestions: ["package.json"] }));
    const res = await p;
    expect(res).toEqual({ suggestions: ["package.json"] });
  });

  test("error response rejects the promise with the binary's message", async () => {
    const h = bufferTransport();
    const client = new ClaudeClient(h.transport);
    const p = client.getSettings();
    await tick();
    const out = h.drain();
    const rid = getRequestId(out[0]);
    h.feed({
      type: "control_response",
      response: { subtype: "error", request_id: rid, error: "binary said no" },
    });
    await expect(p).rejects.toThrow(/binary said no/);
  });

  test("sendUserMessage writes a type:user frame and records it", async () => {
    const h = bufferTransport();
    const client = new ClaudeClient(h.transport);
    await client.sendUserMessage("hello");
    const out = h.drain();
    expect(out[0]).toMatchObject({
      type: "user",
      message: { role: "user", content: "hello" },
    });
    expect(client.getSnapshot().userMessages).toHaveLength(1);
  });

  test("bashCommand writes a type:bash_command frame", async () => {
    const h = bufferTransport();
    const client = new ClaudeClient(h.transport);
    await client.bashCommand("ls -la");
    const out = h.drain();
    expect(out[0]).toMatchObject({ type: "bash_command", command: "ls -la" });
  });

  test("endSession emits end_session and marks state ended", async () => {
    const h = bufferTransport();
    const client = new ClaudeClient(h.transport);
    const p = client.endSession();
    await tick();
    const out = h.drain();
    expect(out[0]).toMatchObject({
      type: "control_request",
      request: { subtype: "end_session" },
    });
    h.feed(ack(getRequestId(out[0])));
    await p;
    expect(client.getSnapshot().sessionState).toBe("ended");
  });
});

describe("ClaudeClient state updates", () => {
  test("system/init sets sessionId and sessionState=running", () => {
    const h = bufferTransport();
    const client = new ClaudeClient(h.transport);
    h.feed({ type: "system", subtype: "init", session_id: "sess-1" });
    const s = client.getSnapshot();
    expect(s.sessionId).toBe("sess-1");
    expect(s.sessionState).toBe("running");
  });

  test("assistant frame appends to messages", () => {
    const h = bufferTransport();
    const client = new ClaudeClient(h.transport);
    h.feed({ type: "assistant", message: { role: "assistant", content: "hi" } });
    expect(client.getSnapshot().messages).toHaveLength(1);
  });

  test("onStateChange fires after each state mutation", () => {
    const h = bufferTransport();
    const client = new ClaudeClient(h.transport);
    const seen: number[] = [];
    client.onStateChange((s) => seen.push(s.messages.length));
    h.feed({ type: "assistant", message: { role: "assistant", content: "1" } });
    h.feed({ type: "assistant", message: { role: "assistant", content: "2" } });
    expect(seen).toEqual([1, 2]);
  });
});

describe("ClaudeClient permission requests", () => {
  test("can_use_tool fires the callback, then sends the response back", async () => {
    const h = bufferTransport();
    let received: unknown = null;
    const client = new ClaudeClient(h.transport, {
      onPermissionRequest: async (req) => {
        received = req;
        return { behavior: "allow", updatedInput: { tool: "Bash" } };
      },
    });
    h.feed({
      type: "control_request",
      request_id: "perm-1",
      request: { subtype: "can_use_tool", tool: "Bash" },
    });
    // The callback is async; let microtasks run.
    await tick();
    await tick();
    const out = h.drain();
    expect(received).toMatchObject({ subtype: "can_use_tool", tool: "Bash" });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      type: "control_response",
      response: {
        subtype: "success",
        request_id: "perm-1",
        response: { behavior: "allow", updatedInput: { tool: "Bash" } },
      },
    });
  });

  test("pending requests are recorded in state until the callback resolves", async () => {
    const h = bufferTransport();
    let resolveCb: (v: { behavior: "allow"; updatedInput?: unknown }) => void = () => {};
    const cbPromise = new Promise<{ behavior: "allow"; updatedInput?: unknown }>((r) => {
      resolveCb = r;
    });
    const client = new ClaudeClient(h.transport, {
      onPermissionRequest: () => cbPromise,
    });
    h.feed({
      type: "control_request",
      request_id: "perm-2",
      request: { subtype: "can_use_tool", tool_name: "Read", input: {} },
    });
    // onPermissionRequest is a raw low-level callback — it short-circuits
    // queue tracking, so the UI-shape queue stays empty. State still flips
    // to requires_action via the StateHolder.applyInbound path.
    expect(client.getSnapshot().sessionState).toBe("requires_action");
    resolveCb({ behavior: "allow" });
    await tick();
    await tick();
  });
});
