// Pure transform from the lib's MessageEntry[] to the renderer's Row[].
// Two flavours: a stateless `classifyMessages` (handy for tests + one-shot
// use) and a stateful `createClassifier()` factory that memoises rows by
// entry.id for the streaming hot path. Use the factory in long-running
// renderers — it makes the per-token re-classify O(1) for the streaming
// tail instead of O(n) over the whole timeline.

import {
  parseBashFrame,
  type AssistantContentBlock,
  type MessageEntry,
  type ResultFrame,
  type ShellEntry,
  type StreamingBlock,
  type SystemFrame,
  type ToolResultContentBlock,
  type UnknownSystemFrame,
  type UserContentBlock,
} from "@somewhatintelligent/cc-ws-svelte";

export type Row =
  | { id: string; kind: "local_user"; text: string }
  | { id: string; kind: "user"; text: string }
  | { id: string; kind: "assistant"; content: AssistantContentBlock[] }
  | { id: string; kind: "streaming"; content: StreamingBlock[] }
  | { id: string; kind: "tool_result"; content: ToolResultContentBlock[] }
  | { id: string; kind: "result"; frame: ResultFrame }
  | { id: string; kind: "system"; frame: SystemFrame | UnknownSystemFrame }
  | { id: string; kind: "mode_change"; mode: string }
  | {
      id: string;
      kind: "bash";
      command: string;
      chunks?: string[];
      pending?: boolean;
      stdout?: string;
      stderr?: string;
      exit?: string;
    };

const HIDDEN_SYSTEM_SUBTYPES: ReadonlySet<string> = new Set([
  "init",
  "session_state_changed",
  "task_started",
  "task_progress",
  "task_notification",
  "task_updated",
  "hook_started",
  "hook_progress",
  "hook_response",
]);

function userText(content: string | UserContentBlock[]): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((b): b is { type: "text"; text: string } =>
      b.type === "text" && typeof (b as { text?: unknown }).text === "string",
    )
    .map((b) => b.text)
    .join("\n");
}

function isToolResultOnly(content: string | UserContentBlock[]): boolean {
  if (!Array.isArray(content) || content.length === 0) return false;
  return content.every((b) => b.type === "tool_result");
}

function nextUserFrameAt(arr: readonly MessageEntry[], from: number): number {
  for (let j = from; j < arr.length; j++) {
    const ej = arr[j];
    if (ej?.kind !== "frame") continue;
    const fj = ej.frame;
    if ("type" in fj && fj.type === "user") return j;
  }
  return -1;
}

// Per-entry analysis result — what rows this entry produces and how many
// adjacent entries it consumed (e.g., input-only bash + output-only bash
// → 1 entry consumed, 1 row produced). `shellsDependent` is true when
// the row's content reads `shells` (in-flight bash with no paired output
// frame yet); those entries are not memoised.
type Analysis = {
  rows: Row[];
  consumed: number;
  shellsDependent: boolean;
};

function analyzeEntry(
  messages: readonly MessageEntry[],
  i: number,
  shells: readonly ShellEntry[],
): Analysis {
  const e = messages[i]!;

  if (e.kind === "local_user") {
    return { rows: [{ id: e.id, kind: "local_user", text: e.text }], consumed: 0, shellsDependent: false };
  }
  if (e.kind === "streaming") {
    return { rows: [{ id: e.id, kind: "streaming", content: e.msg.content }], consumed: 0, shellsDependent: false };
  }

  const f = e.frame;
  if (!("type" in f)) return { rows: [], consumed: 0, shellsDependent: false };
  // Lib guarantees no parent-keyed frame in messages — sub-agent frames
  // are consumed by tasks.ts before reaching the messages controller.

  if (f.type === "user") {
    const text = userText(f.message.content);
    const parsed = parseBashFrame(text);

    if (parsed?.kind === "merged") {
      const rows: Row[] = [{
        id: e.id + ":bash",
        kind: "bash",
        command: parsed.command,
        stdout: parsed.stdout,
        stderr: parsed.stderr,
        exit: parsed.exit,
      }];
      if (parsed.trailing) {
        rows.push({ id: e.id + ":text", kind: "user", text: parsed.trailing });
      }
      return { rows, consumed: 0, shellsDependent: false };
    }

    if (parsed?.kind === "input") {
      const pairIdx = nextUserFrameAt(messages, i + 1);
      let pairText = "";
      if (pairIdx >= 0) {
        const pairEntry = messages[pairIdx]!;
        if (pairEntry.kind === "frame" && "type" in pairEntry.frame && pairEntry.frame.type === "user") {
          pairText = userText(pairEntry.frame.message.content);
        }
      }
      const pairParsed = pairText ? parseBashFrame(pairText) : null;
      if (pairParsed?.kind === "output" && pairIdx >= 0) {
        return {
          rows: [{
            id: e.id,
            kind: "bash",
            command: parsed.command,
            stdout: pairParsed.stdout,
            stderr: pairParsed.stderr,
            exit: pairParsed.exit,
          }],
          consumed: pairIdx - i,
          shellsDependent: false,
        };
      }
      // Live in-flight: chunks come from shellEntries. Don't cache —
      // chunks update reactively until the output replay frame lands.
      const live = [...shells].reverse().find((s) => s.command === parsed.command);
      return {
        rows: [{
          id: e.id,
          kind: "bash",
          command: parsed.command,
          chunks: live?.chunks ?? [],
          pending: !live || live.chunks.length === 0,
        }],
        consumed: 0,
        shellsDependent: true,
      };
    }

    if (parsed?.kind === "output") {
      return {
        rows: [{
          id: e.id,
          kind: "bash",
          command: "(shell)",
          stdout: parsed.stdout,
          stderr: parsed.stderr,
          exit: parsed.exit,
        }],
        consumed: 0,
        shellsDependent: false,
      };
    }

    if (isToolResultOnly(f.message.content)) {
      return {
        rows: [{ id: e.id, kind: "tool_result", content: f.message.content as ToolResultContentBlock[] }],
        consumed: 0,
        shellsDependent: false,
      };
    }

    return text
      ? { rows: [{ id: e.id, kind: "user", text }], consumed: 0, shellsDependent: false }
      : { rows: [], consumed: 0, shellsDependent: false };
  }

  if (f.type === "assistant") {
    return {
      rows: [{ id: e.id, kind: "assistant", content: f.message.content }],
      consumed: 0,
      shellsDependent: false,
    };
  }

  if (f.type === "result") {
    return { rows: [{ id: e.id, kind: "result", frame: f }], consumed: 0, shellsDependent: false };
  }

  if (f.type === "system") {
    if (HIDDEN_SYSTEM_SUBTYPES.has(f.subtype)) {
      return { rows: [], consumed: 0, shellsDependent: false };
    }
    if (f.subtype === "status" && "permissionMode" in f && typeof f.permissionMode === "string") {
      return {
        rows: [{ id: e.id, kind: "mode_change", mode: f.permissionMode }],
        consumed: 0,
        shellsDependent: false,
      };
    }
    return { rows: [{ id: e.id, kind: "system", frame: f }], consumed: 0, shellsDependent: false };
  }

  return { rows: [], consumed: 0, shellsDependent: false };
}

// Stateless one-shot. Use this from tests or wherever caching across
// calls doesn't matter.
export function classifyMessages(
  messages: readonly MessageEntry[],
  shells: readonly ShellEntry[],
): Row[] {
  const out: Row[] = [];
  let i = 0;
  while (i < messages.length) {
    const a = analyzeEntry(messages, i, shells);
    for (const r of a.rows) out.push(r);
    i += 1 + a.consumed;
  }
  return out;
}

export type Classifier = {
  classify(messages: readonly MessageEntry[], shells: readonly ShellEntry[]): Row[];
  reset(): void;
};

// Stateful classifier. Frames are memoised by entry.id (stable across
// streaming token deltas, since only the trailing streaming entry's
// content mutates per delta). On a 200-entry timeline streaming a long
// reply, the per-token cost drops from O(n) regex-and-parse to O(1) for
// the streaming tail. In-flight bash rows (no paired output frame yet)
// always recompute — chunks update reactively via shellEntries until
// the output replay lands.
export function createClassifier(): Classifier {
  const cache = new Map<string, Analysis>();

  function gc(seen: Set<string>) {
    if (cache.size <= seen.size + 16) return;
    for (const id of cache.keys()) {
      if (!seen.has(id)) cache.delete(id);
    }
  }

  function classify(messages: readonly MessageEntry[], shells: readonly ShellEntry[]): Row[] {
    const out: Row[] = [];
    const seen = new Set<string>();
    let i = 0;
    while (i < messages.length) {
      const e = messages[i]!;
      const cacheKey = e.kind === "streaming" ? null : e.id;
      if (cacheKey) seen.add(cacheKey);

      let a: Analysis;
      const cached = cacheKey ? cache.get(cacheKey) : undefined;
      if (cached && !cached.shellsDependent) {
        a = cached;
      } else {
        a = analyzeEntry(messages, i, shells);
        if (cacheKey && !a.shellsDependent) cache.set(cacheKey, a);
      }
      for (const r of a.rows) out.push(r);
      i += 1 + a.consumed;
    }
    gc(seen);
    return out;
  }

  function reset() {
    cache.clear();
  }

  return { classify, reset };
}
