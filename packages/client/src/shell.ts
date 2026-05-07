// Bash exchange XML — single source of truth for the format the bridge
// replays back when a `bash_command` frame runs. Three shapes ride the
// `user` content channel:
//   input-only   <bash-input>cmd</bash-input>
//   output-only  <bash-stdout>…</bash-stdout><bash-stderr>…</bash-stderr><bash-exit-code>0</bash-exit-code>
//   merged       both, plus arbitrary trailing user text (drain-synthesis)
// Both the lib's outbound writer (handleShellReplay) and any UI that
// renders bash exchanges parse the same shape — keep them in lockstep
// here.

import { atom, type WritableAtom } from "nanostores";
import { isSystemFrame, isUserFrame, type InboundFrame } from "./protocol";
import type { WsClient } from "./ws";

export function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function decodeXml(s: string): string {
  return s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
}

const RE_INPUT = /<bash-input>([\s\S]*?)<\/bash-input>/;
const RE_STDOUT = /<bash-stdout>([\s\S]*?)<\/bash-stdout>/;
const RE_STDERR = /<bash-stderr>([\s\S]*?)<\/bash-stderr>/;
const RE_EXIT = /<bash-exit-code>([\s\S]*?)<\/bash-exit-code>/;

export type BashFrame =
  | { kind: "input"; command: string }
  | { kind: "output"; stdout: string; stderr: string; exit: string }
  | { kind: "merged"; command: string; stdout: string; stderr: string; exit: string; trailing: string };

export function parseBashFrame(text: string): BashFrame | null {
  const inMatch = text.match(RE_INPUT);
  const outMatch = text.match(RE_STDOUT);
  const errMatch = text.match(RE_STDERR);
  const exitMatch = text.match(RE_EXIT);
  const hasInput = inMatch != null;
  const hasOutput = outMatch != null || errMatch != null || exitMatch != null;
  if (!hasInput && !hasOutput) return null;

  if (hasInput && hasOutput) {
    return {
      kind: "merged",
      command: decodeXml(inMatch![1]!),
      stdout: outMatch ? decodeXml(outMatch[1]!) : "",
      stderr: errMatch ? decodeXml(errMatch[1]!) : "",
      exit: exitMatch ? decodeXml(exitMatch[1]!) : "",
      trailing: text
        .replace(RE_INPUT, "")
        .replace(RE_STDOUT, "")
        .replace(RE_STDERR, "")
        .replace(RE_EXIT, "")
        .trim(),
    };
  }
  if (hasInput) {
    return { kind: "input", command: decodeXml(inMatch![1]!) };
  }
  return {
    kind: "output",
    stdout: outMatch ? decodeXml(outMatch[1]!) : "",
    stderr: errMatch ? decodeXml(errMatch[1]!) : "",
    exit: exitMatch ? decodeXml(exitMatch[1]!) : "",
  };
}

// Reconstruct the merged-frame XML the lib drains into the next user
// message. Encoding mirrors what the binary sends back so the round-trip
// is lossless.
export function buildBashXml(command: string, stdoutXml: string, stderrXml: string): string {
  return (
    `<bash-input>${escapeXml(command)}</bash-input>\n` +
    `<bash-stdout>${stdoutXml}</bash-stdout>` +
    `<bash-stderr>${stderrXml}</bash-stderr>`
  );
}

// ---------- runtime controller ----------

export type ShellSource = "context" | "sideChannel";

export type ShellEntry = {
  id: string;
  command: string;
  source: ShellSource;
  chunks: string[];
  // For context-shell: the exchange has run on the bridge but the
  // <bash-input>/<bash-stdout> XML hasn't been sent to claude yet — it
  // gets prepended to the user's next sendMessage() (matches the TUI's
  // shouldQuery:false flow). Cleared when drained.
  pending?: boolean;
};

export type ShellController = {
  shellEntries: WritableAtom<ShellEntry[]>;
  // Frame ingestion side-effects (return false intentionally for the
  // user-replay path — see handleShellReplay below).
  handleShellReplay: (frame: InboundFrame) => boolean;
  handleLocalCommandOutput: (frame: InboundFrame) => boolean;
  // Public ops.
  sendShellContext: (command: string, followUp?: string) => void;
  sendBashSideChannel: (command: string) => void;
  dismissShellEntry: (id: string) => void;
  // Drain pending bash exchanges into outbound text + clear their entries.
  // Returns the rewritten payload for sendMessage to wire-send.
  drainPending: (text: string) => string;
  hasPending: () => boolean;
  reset: () => void;
};

export function createShellController(args: {
  ws: WsClient;
  // sendMessage is back-injected because a queued follow-up text fires
  // sendMessage(followUp) after the bash exchange's XML is buffered, and
  // sendMessage in turn drains via drainPending().
  sendMessage: (text: string) => void;
}): ShellController {
  const { ws, sendMessage } = args;
  const shellEntries = atom<ShellEntry[]>([]);

  // bash_command replay frames don't carry a correlation id, but the
  // binary processes them in the order received and replies in the same
  // order. So we keep a FIFO of in-flight captures: each call to
  // sendShellContext / sendBashSideChannel pushes; each output-replay
  // frame shifts. Two bash sends in quick succession used to clobber
  // each other when we tracked a single `activeShellId` global.
  const captureQueue: {
    entryId: string;
    command: string;
    source: ShellSource;
    sawInputEcho: boolean;
  }[] = [];
  // Buffered <bash-input>/<bash-stdout>/<bash-stderr> XML, FIFO. Filled
  // when a context-shell capture's output replay arrives; drained by
  // sendMessage() which prepends to the user's next prompt. The TUI-`!cmd`
  // parity workaround: bash_command's replay frames are NOT injected
  // into claude's transcript by the binary (verified empirically).
  const pendingBashExchanges: { entryId: string; xml: string }[] = [];
  // Optional follow-up user prompts queued from sendShellContext (the
  // multi-line `!cmd\n<followup>` form). Fires sendMessage(followUp)
  // after the bash exchange's XML is buffered, so the followUp goes out
  // as the user message that drains the buffer.
  const pendingFollowUps = new Map<string, string>();

  // Side-effect-only: scrape bash-* replay frames for shellEntries chunks
  // + build the buffered XML that rides out on the next sendMessage.
  // Always returns false so the frame still flows into messagesCtrl for
  // chat-side rendering.
  function handleShellReplay(frame: InboundFrame): boolean {
    if (!isUserFrame(frame) || !frame.isReplay) return false;
    const c = frame.message.content;
    if (typeof c !== "string") return false;
    const parsed = parseBashFrame(c);
    if (!parsed) return false;

    if (parsed.kind === "input") {
      // First replay frame for the head capture: the binary acked the
      // command. Output is still pending.
      const head = captureQueue[0];
      if (head) head.sawInputEcho = true;
      return false;
    }
    // Both "output" (output-only replay) and "merged" (some bridges emit
    // input + output in one frame) close the head capture in FIFO order.
    const cap = captureQueue.shift();
    if (!cap) return false;
    const parts: string[] = [];
    if (parsed.stdout) parts.push(parsed.stdout);
    if (parsed.stderr) parts.push("[stderr] " + parsed.stderr);
    if (parsed.exit && parsed.exit !== "0") parts.push(`[exit ${parsed.exit}]`);
    const chunk = parts.join("\n");
    shellEntries.set(
      shellEntries.get().map((s) => (s.id === cap.entryId ? { ...s, chunks: [...s.chunks, chunk] } : s)),
    );
    if (cap.source === "context") {
      // Re-encode for the buffered XML — parseBashFrame decodes the
      // entities; the outbound payload needs them re-escaped.
      const stdoutXml = escapeXml(parsed.stdout);
      const stderrXml = escapeXml(parsed.stderr);
      pendingBashExchanges.push({
        entryId: cap.entryId,
        xml: buildBashXml(cap.command, stdoutXml, stderrXml),
      });
      const followUp = pendingFollowUps.get(cap.entryId);
      if (followUp) {
        pendingFollowUps.delete(cap.entryId);
        sendMessage(followUp);
      }
    }
    return false;
  }

  function handleLocalCommandOutput(frame: InboundFrame): boolean {
    if (!isSystemFrame(frame) || frame.subtype !== "local_command_output") return false;
    const head = captureQueue[0];
    if (!head) return false;
    const content = "content" in frame ? frame.content ?? "" : "";
    shellEntries.set(
      shellEntries.get().map((s) => (s.id === head.entryId ? { ...s, chunks: [...s.chunks, content] } : s)),
    );
    return true;
  }

  function sendShellContext(command: string, followUp = "") {
    // Route `!cmd` to the binary via the bash_command wire frame: the
    // binary runs it (with its own bounds, sandboxing, etc) and replays
    // <bash-input>/<bash-stdout>/<bash-stderr>/<bash-exit-code> as
    // user/isReplay frames over the wire. Empirically these replay
    // frames are NOT auto-injected into claude's transcript — we have
    // to ride them out ourselves on the next user message.
    const id = crypto.randomUUID();
    shellEntries.set([...shellEntries.get(), { id, command, source: "context", chunks: [], pending: true }]);
    captureQueue.push({ entryId: id, command, source: "context", sawInputEcho: false });
    ws.send({ type: "bash_command", command });
    // If the user typed a follow-up prompt on subsequent lines of the
    // !cmd input, fire it right after the bash exchange completes — the
    // drain in sendMessage will prepend the XML to the followUp text.
    if (followUp.trim()) {
      pendingFollowUps.set(id, followUp);
    }
  }

  function sendBashSideChannel(command: string) {
    const id = crypto.randomUUID();
    shellEntries.set([...shellEntries.get(), { id, command, source: "sideChannel", chunks: [] }]);
    captureQueue.push({ entryId: id, command, source: "sideChannel", sawInputEcho: false });
    ws.send({ type: "bash_command", command });
  }

  function dismissShellEntry(id: string) {
    shellEntries.set(shellEntries.get().filter((s) => s.id !== id));
  }

  function hasPending(): boolean {
    return pendingBashExchanges.length > 0;
  }

  // Drain buffered context-shell exchanges. Drained shell entries get
  // removed from shellEntries — the panel acts as a "queued exchange"
  // indicator that empties when the user fires the message that flushes
  // the buffer. The exchange remains visible in the chat scrollback.
  function drainPending(text: string): string {
    if (pendingBashExchanges.length === 0) return text;
    const xml = pendingBashExchanges.map((p) => p.xml).join("\n");
    const payload = text.trim() ? `${xml}\n\n${text}` : xml;
    const drainedIds = new Set(pendingBashExchanges.map((p) => p.entryId));
    shellEntries.set(shellEntries.get().filter((s) => !drainedIds.has(s.id)));
    pendingBashExchanges.length = 0;
    return payload;
  }

  function reset() {
    shellEntries.set([]);
    captureQueue.length = 0;
    pendingBashExchanges.length = 0;
    pendingFollowUps.clear();
  }

  return {
    shellEntries,
    handleShellReplay,
    handleLocalCommandOutput,
    sendShellContext,
    sendBashSideChannel,
    dismissShellEntry,
    drainPending,
    hasPending,
    reset,
  };
}

