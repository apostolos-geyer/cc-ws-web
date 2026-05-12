/**
 * Message-timeline aggregation. Pure JS over wire frames.
 *
 * Streaming bubble assembly: `stream_event` frames build up a partial
 * `InFlightMessage`; the canonical `assistant` envelope arrives later and
 * is authoritative — the streaming entry is replaced by the canonical
 * frame entry.
 *
 * No reactivity dep, no DOM, no Node/Bun. Universal.
 */

import type {
  AssistantContentBlock,
  InboundFrame,
  StreamEvent,
} from "./frames";

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

// ---------- aggregator ----------

export interface MessagesSnapshot {
  messages: MessageEntry[];
  activeStreamId: string | null;
  /** Bumps on non-streaming changes; observers using this for
   *  save-on-stable-change skip per-token streaming churn. */
  revision: number;
}

export interface MessagesAggregator {
  getSnapshot(): MessagesSnapshot;
  pushLocalUser(text: string, id?: string): void;
  pushFrame(frame: InboundFrame): void;
  /** Returns true when the streaming machinery consumed the frame. */
  ingest(frame: InboundFrame): boolean;
  reset(): void;
  /** Streaming entries are dropped — they don't round-trip through serialization. */
  hydrate(entries: MessageEntry[]): void;
}

/**
 * @param onChange Called after every mutation with the new snapshot. The
 *   caller decides what to do — fan out to subscribers, persist, etc.
 * @param newId Test seam — replaces `crypto.randomUUID()` for deterministic
 *   ids in unit tests.
 */
export function createMessagesAggregator(opts: {
  onChange?: (snap: MessagesSnapshot) => void;
  newId?: () => string;
} = {}): MessagesAggregator {
  const onChange = opts.onChange ?? (() => {});
  const newId = opts.newId ?? (() => crypto.randomUUID());

  let messages: MessageEntry[] = [];
  let activeStreamId: string | null = null;
  let revision = 0;
  const streaming = new Map<string, InFlightMessage>();
  let arrivalCounter = 0;

  function emit() {
    onChange({ messages, activeStreamId, revision });
  }

  function bumpRevision() {
    revision++;
  }

  function pushLocalUser(text: string, id?: string) {
    const entry: LocalUserEntry = {
      kind: "local_user",
      id: id ?? newId(),
      text,
      arrivalIdx: arrivalCounter++,
    };
    messages = [...messages, entry];
    bumpRevision();
    emit();
  }

  function pushFrame(frame: InboundFrame) {
    const entry: FrameEntry = {
      kind: "frame",
      id: newId(),
      frame,
      arrivalIdx: arrivalCounter++,
    };
    messages = [...messages, entry];
    bumpRevision();
    emit();
  }

  function startStreaming(id: string, msg: InFlightMessage) {
    streaming.set(id, msg);
    const entry: StreamingEntry = {
      kind: "streaming",
      id,
      msg,
      arrivalIdx: arrivalCounter++,
    };
    messages = [...messages, entry];
    activeStreamId = id;
    emit();
  }

  function bumpStreaming(id: string) {
    const msg = streaming.get(id);
    if (!msg) return;
    const arr = messages;
    const last = arr.length - 1;
    if (last < 0) return;
    const tail = arr[last];
    if (tail?.kind !== "streaming" || tail.id !== id) {
      const idx = arr.findIndex((e) => e.kind === "streaming" && e.id === id);
      if (idx === -1) return;
      const next = arr.slice();
      next[idx] = { ...arr[idx]!, msg: { ...msg } } as StreamingEntry;
      messages = next;
      emit();
      return;
    }
    const next = arr.slice();
    next[last] = { ...tail, msg: { ...msg } };
    messages = next;
    emit();
  }

  function dropStreaming(id: string) {
    streaming.delete(id);
    if (activeStreamId === id) activeStreamId = null;
    messages = messages.filter((e) => !(e.kind === "streaming" && e.id === id));
    bumpRevision();
    emit();
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
      const id = activeStreamId;
      const msg = id ? streaming.get(id) : null;
      if (!msg || !id) return;
      const cb = (ev.content_block ?? {}) as Partial<
        AssistantContentBlock & { text?: string; thinking?: string }
      >;
      let block: StreamingBlock;
      if (cb.type === "tool_use") {
        block = {
          type: "tool_use",
          id: (cb as { id?: string }).id ?? "",
          name: (cb as { name?: string }).name ?? "",
          input: (cb as { input?: unknown }).input ?? {},
          partialJson: "",
          parsed: false,
        };
      } else if (cb.type === "thinking") {
        block = { type: "thinking", thinking: cb.thinking ?? "" };
      } else {
        block = { type: "text", text: cb.text ?? "" };
      }
      msg.content[ev.index] = block;
      bumpStreaming(id);
      return;
    }
    if (ev.type === "content_block_delta") {
      const id = activeStreamId;
      const msg = id ? streaming.get(id) : null;
      if (!msg || !id) return;
      const block = msg.content[ev.index];
      const delta = ev.delta ?? ({} as { type?: string });
      if (block?.type === "text" && delta.type === "text_delta" && typeof (delta as { text?: unknown }).text === "string") {
        block.text += (delta as { text: string }).text;
      } else if (
        block?.type === "tool_use" &&
        delta.type === "input_json_delta" &&
        typeof (delta as { partial_json?: unknown }).partial_json === "string"
      ) {
        block.partialJson += (delta as { partial_json: string }).partial_json;
      } else if (
        block?.type === "thinking" &&
        delta.type === "thinking_delta" &&
        typeof (delta as { thinking?: unknown }).thinking === "string"
      ) {
        block.thinking += (delta as { thinking: string }).thinking;
      }
      bumpStreaming(id);
      return;
    }
    if (ev.type === "content_block_stop") {
      const id = activeStreamId;
      const msg = id ? streaming.get(id) : null;
      if (!msg || !id) return;
      const block = msg.content[ev.index];
      if (block?.type === "tool_use" && !block.parsed) {
        if (block.partialJson) {
          try {
            block.input = JSON.parse(block.partialJson);
            block.parsed = true;
          } catch (err) {
            // Mirror the legacy console.warn so dev tools surface bad JSON.
            // eslint-disable-next-line no-console
            console.warn("[stream_event] tool_use partial_json parse failed", err, block.partialJson);
          }
        } else {
          block.parsed = true;
        }
      }
      bumpStreaming(id);
      return;
    }
    if (ev.type === "message_stop") {
      const id = activeStreamId;
      const msg = id ? streaming.get(id) : null;
      if (msg) msg.done = true;
      if (id) bumpStreaming(id);
    }
  }

  function ingest(frame: InboundFrame): boolean {
    if (!frame || typeof frame !== "object" || !("type" in frame)) return false;
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
    activeStreamId = null;
    const filtered = entries.filter(
      (e): e is LocalUserEntry | FrameEntry => e.kind === "frame" || e.kind === "local_user",
    );
    arrivalCounter = filtered.length > 0
      ? Math.max(...filtered.map((e) => e.arrivalIdx)) + 1
      : 0;
    messages = filtered;
    bumpRevision();
    emit();
  }

  function reset() {
    streaming.clear();
    activeStreamId = null;
    messages = [];
    arrivalCounter = 0;
    bumpRevision();
    emit();
  }

  return {
    getSnapshot: () => ({ messages, activeStreamId, revision }),
    pushLocalUser,
    pushFrame,
    ingest,
    reset,
    hydrate,
  };
}
