// Pure transform from the lib's MessageEntry[] to the renderer's Row[].
// Lives outside MessageStream.svelte so it's unit-testable and so the
// component stays focused on reactive presentation.

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
} from "@cc-ws/svelte";

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

const HIDDEN_SYSTEM_SUBTYPES = new Set([
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
    if ("type" in fj && fj.type === "user" && !fj.parent_tool_use_id) return j;
  }
  return -1;
}

export function classifyMessages(
  messages: readonly MessageEntry[],
  shells: readonly ShellEntry[],
): Row[] {
  const out: Row[] = [];
  const consumed = new Set<number>();

  for (let i = 0; i < messages.length; i++) {
    if (consumed.has(i)) continue;
    const e = messages[i]!;

    if (e.kind === "local_user") {
      out.push({ id: e.id, kind: "local_user", text: e.text });
      continue;
    }
    if (e.kind === "streaming") {
      out.push({ id: e.id, kind: "streaming", content: e.msg.content });
      continue;
    }

    const f = e.frame;
    if (!("type" in f)) continue;
    if ("parent_tool_use_id" in f && f.parent_tool_use_id) continue;

    if (f.type === "user") {
      const text = userText(f.message.content);
      const parsed = parseBashFrame(text);

      if (parsed?.kind === "merged") {
        out.push({
          id: e.id + ":bash",
          kind: "bash",
          command: parsed.command,
          stdout: parsed.stdout,
          stderr: parsed.stderr,
          exit: parsed.exit,
        });
        if (parsed.trailing) {
          out.push({ id: e.id + ":text", kind: "user", text: parsed.trailing });
        }
        continue;
      }

      if (parsed?.kind === "input") {
        // Walk forward to the next user frame; if it's an output-only
        // bash replay, pair them. Both frames are persisted, so this
        // pairing works pre- and post-refresh without lib state.
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
          out.push({
            id: e.id,
            kind: "bash",
            command: parsed.command,
            stdout: pairParsed.stdout,
            stderr: pairParsed.stderr,
            exit: pairParsed.exit,
          });
          consumed.add(pairIdx);
          continue;
        }
        // Live in-flight: match to the most recent shellEntry with the
        // same command; chunks update reactively as output arrives.
        const live = [...shells].reverse().find((s) => s.command === parsed.command);
        out.push({
          id: e.id,
          kind: "bash",
          command: parsed.command,
          chunks: live?.chunks ?? [],
          pending: !live || live.chunks.length === 0,
        });
        continue;
      }

      if (parsed?.kind === "output") {
        // Orphan: shouldn't happen when the input-echo is in the same
        // timeline, but render gracefully so we never expose raw XML.
        out.push({
          id: e.id,
          kind: "bash",
          command: "(shell)",
          stdout: parsed.stdout,
          stderr: parsed.stderr,
          exit: parsed.exit,
        });
        continue;
      }

      if (isToolResultOnly(f.message.content)) {
        out.push({
          id: e.id,
          kind: "tool_result",
          content: f.message.content as ToolResultContentBlock[],
        });
        continue;
      }

      if (text) out.push({ id: e.id, kind: "user", text });
      continue;
    }

    if (f.type === "assistant") {
      out.push({ id: e.id, kind: "assistant", content: f.message.content });
      continue;
    }

    if (f.type === "result") {
      out.push({ id: e.id, kind: "result", frame: f });
      continue;
    }

    if (f.type === "system") {
      if (HIDDEN_SYSTEM_SUBTYPES.has(f.subtype)) continue;
      // Mode-change confirmation from the binary — render as an inline
      // coloured marker, not a raw "·status" line.
      if (f.subtype === "status" && "permissionMode" in f && typeof f.permissionMode === "string") {
        out.push({ id: e.id, kind: "mode_change", mode: f.permissionMode });
        continue;
      }
      out.push({ id: e.id, kind: "system", frame: f });
      continue;
    }
  }
  return out;
}
