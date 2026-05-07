// Bash-replay XML on the user content channel. Three shapes:
//   input-only   <bash-input>cmd</bash-input>
//   output-only  <bash-stdout>…</bash-stdout><bash-stderr>…</bash-stderr><bash-exit-code>0</bash-exit-code>
//   merged       both, plus arbitrary trailing user text (drain-synthesis)

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

// Encoding mirrors what the binary emits so the round-trip is lossless
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
  // True between bridge-run and the drain into the next sendMessage —
  // matches the TUI's shouldQuery:false flow
  pending?: boolean;
};

export type ShellController = {
  shellEntries: WritableAtom<ShellEntry[]>;
  // Returns false on the replay path so the frame still flows into messagesCtrl
  handleShellReplay: (frame: InboundFrame) => boolean;
  handleLocalCommandOutput: (frame: InboundFrame) => boolean;
  sendShellContext: (command: string, followUp?: string) => void;
  sendBashSideChannel: (command: string) => void;
  dismissShellEntry: (id: string) => void;
  drainPending: (text: string) => string;
  hasPending: () => boolean;
  reset: () => void;
};

export function createShellController(args: {
  ws: WsClient;
  // Back-injected: queued follow-ups fire sendMessage after buffering,
  // and sendMessage in turn drains via drainPending
  sendMessage: (text: string) => void;
}): ShellController {
  const { ws, sendMessage } = args;
  const shellEntries = atom<ShellEntry[]>([]);

  // bash_command replays carry no correlation id, but the binary replies
  // in send-order — so we FIFO-track in-flight captures. Two bash sends
  // in quick succession used to clobber each other when we tracked a
  // single `activeShellId` global.
  const captureQueue: {
    entryId: string;
    command: string;
    source: ShellSource;
    sawInputEcho: boolean;
  }[] = [];
  // Empirically the binary does NOT auto-inject bash_command replay
  // frames into claude's transcript, so we buffer the XML here and
  // prepend it to the user's next sendMessage to achieve TUI-`!cmd` parity
  const pendingBashExchanges: { entryId: string; xml: string }[] = [];
  // Multi-line `!cmd\n<followup>` form: the followUp must go out as the
  // user message that drains the buffer, not before it
  const pendingFollowUps = new Map<string, string>();

  // Always returns false so the frame still reaches messagesCtrl for chat rendering
  function handleShellReplay(frame: InboundFrame): boolean {
    if (!isUserFrame(frame) || !frame.isReplay) return false;
    const c = frame.message.content;
    if (typeof c !== "string") return false;
    const parsed = parseBashFrame(c);
    if (!parsed) return false;

    if (parsed.kind === "input") {
      const head = captureQueue[0];
      if (head) head.sawInputEcho = true;
      return false;
    }
    // Both "output" and "merged" close the head capture in FIFO order
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
      // parseBashFrame decoded the entities; the outbound payload needs them re-escaped
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
    const id = crypto.randomUUID();
    shellEntries.set([...shellEntries.get(), { id, command, source: "context", chunks: [], pending: true }]);
    captureQueue.push({ entryId: id, command, source: "context", sawInputEcho: false });
    ws.send({ type: "bash_command", command });
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

  // shellEntries empties on drain (it's a "queued exchange" indicator);
  // the exchange itself remains visible in chat scrollback
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

