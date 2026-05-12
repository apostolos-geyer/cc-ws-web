import { describe, test, expect, beforeEach, spyOn } from "bun:test";
import { createTestSession, type TestSession } from "./helpers";
import type { StreamingEntry, FrameEntry, ToolUseBlock, TextBlock, ThinkingBlock } from "../src/index";

let h: TestSession;

beforeEach(() => {
  h = createTestSession();
  h.session.connect();
});

function streamingEntry(s: TestSession): StreamingEntry | undefined {
  return s.session.atoms.messages.get().find((e) => e.kind === "streaming") as StreamingEntry | undefined;
}

describe("streaming reducer", () => {
  test("message_start creates a streaming entry", () => {
    h.ws.pushFrame({ type: "stream_event", event: { type: "message_start", message: { id: "m1", model: "claude-opus-4-7" } } } as any);

    const entry = streamingEntry(h);
    expect(entry).toBeDefined();
    expect(entry!.id).toBe("m1");
    expect(entry!.msg.role).toBe("assistant");
    expect(entry!.msg.done).toBe(false);
    expect(h.session.atoms.activeStreamId.get()).toBe("m1");
  });

  test("content_block_start attaches text block", () => {
    h.ws.pushFrame({ type: "stream_event", event: { type: "message_start", message: { id: "m1" } } } as any);
    h.ws.pushFrame({
      type: "stream_event",
      event: { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } },
    } as any);
    const entry = streamingEntry(h)!;
    expect(entry.msg.content[0]).toMatchObject({ type: "text", text: "" });
  });

  test("content_block_start attaches tool_use block", () => {
    h.ws.pushFrame({ type: "stream_event", event: { type: "message_start", message: { id: "m1" } } } as any);
    h.ws.pushFrame({
      type: "stream_event",
      event: { type: "content_block_start", index: 0, content_block: { type: "tool_use", id: "tu1", name: "Bash", input: {} } },
    } as any);
    const block = streamingEntry(h)!.msg.content[0] as ToolUseBlock;
    expect(block.type).toBe("tool_use");
    expect(block.id).toBe("tu1");
    expect(block.name).toBe("Bash");
    expect(block.partialJson).toBe("");
    expect(block.parsed).toBe(false);
  });

  test("content_block_start attaches thinking block", () => {
    h.ws.pushFrame({ type: "stream_event", event: { type: "message_start", message: { id: "m1" } } } as any);
    h.ws.pushFrame({
      type: "stream_event",
      event: { type: "content_block_start", index: 0, content_block: { type: "thinking", thinking: "" } },
    } as any);
    const block = streamingEntry(h)!.msg.content[0] as ThinkingBlock;
    expect(block.type).toBe("thinking");
    expect(block.thinking).toBe("");
  });

  test("text_delta concatenates", () => {
    h.ws.pushFrame({ type: "stream_event", event: { type: "message_start", message: { id: "m1" } } } as any);
    h.ws.pushFrame({
      type: "stream_event",
      event: { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } },
    } as any);
    h.ws.pushFrame({
      type: "stream_event",
      event: { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "Hello, " } },
    } as any);
    h.ws.pushFrame({
      type: "stream_event",
      event: { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "world!" } },
    } as any);
    const block = streamingEntry(h)!.msg.content[0] as TextBlock;
    expect(block.text).toBe("Hello, world!");
  });

  test("input_json_delta accumulates partial_json", () => {
    h.ws.pushFrame({ type: "stream_event", event: { type: "message_start", message: { id: "m1" } } } as any);
    h.ws.pushFrame({
      type: "stream_event",
      event: { type: "content_block_start", index: 0, content_block: { type: "tool_use", id: "tu1", name: "Bash", input: {} } },
    } as any);
    h.ws.pushFrame({
      type: "stream_event",
      event: { type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: '{"cmd":' } },
    } as any);
    h.ws.pushFrame({
      type: "stream_event",
      event: { type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: '"ls"}' } },
    } as any);
    const block = streamingEntry(h)!.msg.content[0] as ToolUseBlock;
    expect(block.partialJson).toBe('{"cmd":"ls"}');
    expect(block.parsed).toBe(false);
  });

  test("thinking_delta concatenates", () => {
    h.ws.pushFrame({ type: "stream_event", event: { type: "message_start", message: { id: "m1" } } } as any);
    h.ws.pushFrame({
      type: "stream_event",
      event: { type: "content_block_start", index: 0, content_block: { type: "thinking", thinking: "" } },
    } as any);
    h.ws.pushFrame({
      type: "stream_event",
      event: { type: "content_block_delta", index: 0, delta: { type: "thinking_delta", thinking: "let me " } },
    } as any);
    h.ws.pushFrame({
      type: "stream_event",
      event: { type: "content_block_delta", index: 0, delta: { type: "thinking_delta", thinking: "think." } },
    } as any);
    const block = streamingEntry(h)!.msg.content[0] as ThinkingBlock;
    expect(block.thinking).toBe("let me think.");
  });

  test("signature_delta is silently tolerated", () => {
    h.ws.pushFrame({ type: "stream_event", event: { type: "message_start", message: { id: "m1" } } } as any);
    h.ws.pushFrame({
      type: "stream_event",
      event: { type: "content_block_start", index: 0, content_block: { type: "thinking", thinking: "" } },
    } as any);
    // Should not throw, should not affect the block content.
    h.ws.pushFrame({
      type: "stream_event",
      event: { type: "content_block_delta", index: 0, delta: { type: "signature_delta", signature: "abc" } },
    } as any);
    const block = streamingEntry(h)!.msg.content[0] as ThinkingBlock;
    expect(block.thinking).toBe("");
  });

  test("content_block_stop on tool_use parses partial_json into input + sets parsed", () => {
    h.ws.pushFrame({ type: "stream_event", event: { type: "message_start", message: { id: "m1" } } } as any);
    h.ws.pushFrame({
      type: "stream_event",
      event: { type: "content_block_start", index: 0, content_block: { type: "tool_use", id: "tu1", name: "Bash", input: {} } },
    } as any);
    h.ws.pushFrame({
      type: "stream_event",
      event: { type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: '{"cmd":"ls"}' } },
    } as any);
    h.ws.pushFrame({ type: "stream_event", event: { type: "content_block_stop", index: 0 } } as any);
    const block = streamingEntry(h)!.msg.content[0] as ToolUseBlock;
    expect(block.parsed).toBe(true);
    expect(block.input).toEqual({ cmd: "ls" });
  });

  test("content_block_stop with bad JSON warns and leaves parsed false", () => {
    const warnSpy = spyOn(console, "warn").mockImplementation(() => {});
    h.ws.pushFrame({ type: "stream_event", event: { type: "message_start", message: { id: "m1" } } } as any);
    h.ws.pushFrame({
      type: "stream_event",
      event: { type: "content_block_start", index: 0, content_block: { type: "tool_use", id: "tu1", name: "Bash", input: {} } },
    } as any);
    h.ws.pushFrame({
      type: "stream_event",
      event: { type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: "{not valid" } },
    } as any);
    h.ws.pushFrame({ type: "stream_event", event: { type: "content_block_stop", index: 0 } } as any);
    const block = streamingEntry(h)!.msg.content[0] as ToolUseBlock;
    expect(block.parsed).toBe(false);
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  test("message_stop sets done:true", () => {
    h.ws.pushFrame({ type: "stream_event", event: { type: "message_start", message: { id: "m1" } } } as any);
    h.ws.pushFrame({ type: "stream_event", event: { type: "message_stop" } } as any);
    const entry = streamingEntry(h);
    expect(entry).toBeDefined();
    expect(entry!.msg.done).toBe(true);
  });

  test("canonical assistant envelope drops streaming entry, appends frame entry", () => {
    h.ws.pushFrame({ type: "stream_event", event: { type: "message_start", message: { id: "m1" } } } as any);
    h.ws.pushFrame({
      type: "stream_event",
      event: { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } },
    } as any);
    h.ws.pushFrame({
      type: "stream_event",
      event: { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "hi" } },
    } as any);
    h.ws.pushFrame({ type: "stream_event", event: { type: "message_stop" } } as any);

    h.ws.pushFrame({
      type: "assistant",
      message: { id: "m1", model: "claude-opus-4-7", content: [{ type: "text", text: "hi" }] },
    } as any);

    const messages = h.session.atoms.messages.get();
    expect(messages.find((e) => e.kind === "streaming")).toBeUndefined();
    const frame = messages.find((e) => e.kind === "frame") as FrameEntry | undefined;
    expect(frame).toBeDefined();
    expect((frame!.frame as any).type).toBe("assistant");
    expect((frame!.frame as any).message.id).toBe("m1");
    expect(h.session.atoms.activeStreamId.get()).toBeNull();
  });

  test("out-of-order index: delta for missing block is ignored, no crash", () => {
    h.ws.pushFrame({ type: "stream_event", event: { type: "message_start", message: { id: "m1" } } } as any);
    // Skip index 0+1; start index 2 directly
    h.ws.pushFrame({
      type: "stream_event",
      event: { type: "content_block_start", index: 2, content_block: { type: "text", text: "" } },
    } as any);
    // Delta for index 1 (no block) — should be silently ignored
    h.ws.pushFrame({
      type: "stream_event",
      event: { type: "content_block_delta", index: 1, delta: { type: "text_delta", text: "hello" } },
    } as any);
    // Delta for index 2 still works
    h.ws.pushFrame({
      type: "stream_event",
      event: { type: "content_block_delta", index: 2, delta: { type: "text_delta", text: "ok" } },
    } as any);
    const entry = streamingEntry(h)!;
    const block2 = entry.msg.content[2] as TextBlock;
    expect(block2.text).toBe("ok");
    // Slot 1 stayed missing/undefined.
    expect(entry.msg.content[1]).toBeUndefined();
  });
});
