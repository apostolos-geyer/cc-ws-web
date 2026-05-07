// Streaming entries (rebuilt from stream_event deltas) are replaced by
// the canonical `frame` entry once the `assistant` envelope arrives —
// the envelope is authoritative.

import { atom, type WritableAtom } from "nanostores";
import type { InboundFrame, StreamEvent } from "./protocol";

// ---------- streaming reconstruction ----------

export type TextBlock = { type: "text"; text: string };
export type ToolUseBlock = {
  type: "tool_use";
  id: string;
  name: string;
  input: unknown;
  // Renderers read partialJson before content_block_stop to show
  // streaming tool inputs while the JSON is still open
  partialJson: string;
  parsed: boolean;
};
export type ThinkingBlock = { type: "thinking"; thinking: string };
export type StreamingBlock = TextBlock | ToolUseBlock | ThinkingBlock;

export type InFlightMessage = {
  id: string;
  role: "assistant";
  model?: string;
  content: StreamingBlock[];
  done: boolean;
  arrivalIdx: number;
};

// ---------- timeline entries ----------

export type LocalUserEntry = {
  kind: "local_user";
  id: string;
  text: string;
  arrivalIdx: number;
};

export type FrameEntry = {
  kind: "frame";
  id: string;
  frame: InboundFrame;
  arrivalIdx: number;
};

export type StreamingEntry = {
  kind: "streaming";
  id: string;
  msg: InFlightMessage;
  arrivalIdx: number;
};

export type MessageEntry = LocalUserEntry | FrameEntry | StreamingEntry;

export type MessagesController = {
  messages: WritableAtom<MessageEntry[]>;
  activeStreamId: WritableAtom<string | null>;
  // Bumps on non-streaming changes only; subscribe to this (not
  // `messages`) for save-on-stable-change to skip the per-token churn
  revision: WritableAtom<number>;
  pushLocalUser: (text: string) => void;
  pushFrame: (frame: InboundFrame) => void;
  // Returns true when the streaming machinery consumed the frame; the
  // caller MUST NOT also append it as a frame entry
  ingest: (frame: InboundFrame) => boolean;
  reset: () => void;
  // Streaming entries are dropped — they don't round-trip through serialization
  hydrate: (entries: MessageEntry[]) => void;
};

export function createMessagesController(): MessagesController {
  const messages = atom<MessageEntry[]>([]);
  const activeStreamId = atom<string | null>(null);
  const revision = atom(0);
  function bumpRevision() {
    revision.set(revision.get() + 1);
  }
  // Mutated in place — there's typically ≤1 active streaming message,
  // so the array-replace-per-delta cost beats a more complex reactivity
  // contract
  const streaming = new Map<string, InFlightMessage>();
  let arrivalCounter = 0;

  function nextIdx() {
    return arrivalCounter++;
  }

  function pushLocalUser(text: string) {
    const id = crypto.randomUUID();
    const entry: LocalUserEntry = {
      kind: "local_user",
      id,
      text,
      arrivalIdx: nextIdx(),
    };
    messages.set([...messages.get(), entry]);
    bumpRevision();
  }

  function pushFrame(frame: InboundFrame) {
    const entry: FrameEntry = {
      kind: "frame",
      id: crypto.randomUUID(),
      frame,
      arrivalIdx: nextIdx(),
    };
    messages.set([...messages.get(), entry]);
    bumpRevision();
  }

  function startStreaming(id: string, msg: InFlightMessage) {
    streaming.set(id, msg);
    const entry: StreamingEntry = {
      kind: "streaming",
      id,
      msg,
      arrivalIdx: nextIdx(),
    };
    messages.set([...messages.get(), entry]);
    activeStreamId.set(id);
  }

  function bumpStreaming(id: string) {
    // The streaming entry lives at the tail until message_stop (no
    // frames are pushed during a stream), so we can mutate the array
    // in place rather than scan with .map
    const msg = streaming.get(id);
    if (!msg) return;
    const arr = messages.get();
    const last = arr.length - 1;
    if (last < 0) return;
    const tail = arr[last];
    if (tail?.kind !== "streaming" || tail.id !== id) {
      const idx = arr.findIndex((e) => e.kind === "streaming" && e.id === id);
      if (idx === -1) return;
      const next = arr.slice();
      next[idx] = { ...arr[idx]!, msg: { ...msg } } as StreamingEntry;
      messages.set(next);
      return;
    }
    const next = arr.slice();
    next[last] = { ...tail, msg: { ...msg } };
    messages.set(next);
  }

  function dropStreaming(id: string) {
    streaming.delete(id);
    if (activeStreamId.get() === id) activeStreamId.set(null);
    messages.set(messages.get().filter((e) => !(e.kind === "streaming" && e.id === id)));
    bumpRevision();
  }

  function applyStreamEvent(ev: StreamEvent) {
    if (ev.type === "message_start" && ev.message?.id) {
      const id = ev.message.id;
      const msg: InFlightMessage = {
        id,
        role: "assistant",
        model: ev.message.model,
        content: [],
        done: false,
        arrivalIdx: arrivalCounter,
      };
      startStreaming(id, msg);
      return;
    }
    if (ev.type === "content_block_start") {
      const id = activeStreamId.get();
      const msg = id ? streaming.get(id) : null;
      if (!msg) return;
      const cb = ev.content_block ?? {};
      let block: StreamingBlock;
      if (cb.type === "tool_use") {
        block = {
          type: "tool_use",
          id: cb.id ?? "",
          name: cb.name ?? "",
          input: cb.input ?? {},
          partialJson: "",
          parsed: false,
        };
      } else if (cb.type === "thinking") {
        block = { type: "thinking", thinking: cb.thinking ?? "" };
      } else {
        block = { type: "text", text: cb.text ?? "" };
      }
      msg.content[ev.index] = block;
      bumpStreaming(id!);
      return;
    }
    if (ev.type === "content_block_delta") {
      const id = activeStreamId.get();
      const msg = id ? streaming.get(id) : null;
      if (!msg) return;
      const block = msg.content[ev.index];
      const delta = ev.delta ?? {};
      if (block?.type === "text" && delta.type === "text_delta" && typeof delta.text === "string") {
        block.text += delta.text;
      } else if (
        block?.type === "tool_use" &&
        delta.type === "input_json_delta" &&
        typeof delta.partial_json === "string"
      ) {
        block.partialJson += delta.partial_json;
      } else if (
        block?.type === "thinking" &&
        delta.type === "thinking_delta" &&
        typeof delta.thinking === "string"
      ) {
        block.thinking += delta.thinking;
      }
      bumpStreaming(id!);
      return;
    }
    if (ev.type === "content_block_stop") {
      const id = activeStreamId.get();
      const msg = id ? streaming.get(id) : null;
      if (!msg) return;
      const block = msg.content[ev.index];
      if (block?.type === "tool_use" && !block.parsed) {
        if (block.partialJson) {
          try {
            block.input = JSON.parse(block.partialJson);
            block.parsed = true;
          } catch (err) {
            console.warn("[stream_event] tool_use partial_json parse failed", err, block.partialJson);
          }
        } else {
          block.parsed = true;
        }
      }
      bumpStreaming(id!);
      return;
    }
    if (ev.type === "message_stop") {
      const id = activeStreamId.get();
      const msg = id ? streaming.get(id) : null;
      if (msg) msg.done = true;
      if (id) bumpStreaming(id);
    }
  }

  function ingest(frame: InboundFrame): boolean {
    if (!("type" in frame)) return false;
    if (frame.type === "stream_event" && frame.event) {
      applyStreamEvent(frame.event);
      return true;
    }
    if (frame.type === "assistant" && frame.message?.id) {
      const id = frame.message.id;
      if (streaming.has(id)) dropStreaming(id);
      pushFrame(frame);
      return true;
    }
    return false;
  }

  function hydrate(entries: MessageEntry[]) {
    streaming.clear();
    activeStreamId.set(null);
    const filtered = entries.filter(
      (e): e is LocalUserEntry | FrameEntry => e.kind === "frame" || e.kind === "local_user",
    );
    // Reseat past the last hydrated entry so subsequent pushes don't
    // collide with restored ids in render order
    arrivalCounter = filtered.length > 0
      ? Math.max(...filtered.map((e) => e.arrivalIdx)) + 1
      : 0;
    messages.set(filtered);
    bumpRevision();
  }

  function reset() {
    streaming.clear();
    activeStreamId.set(null);
    messages.set([]);
    arrivalCounter = 0;
    bumpRevision();
  }

  return {
    messages,
    activeStreamId,
    revision,
    pushLocalUser,
    pushFrame,
    ingest,
    reset,
    hydrate,
  };
}
