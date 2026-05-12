/**
 * Bash side-channel aggregator + helpers.
 *
 * Two channels in Claude Code consumer protocol:
 *   - `bash_command` outbound frames request shell execution
 *   - `user/isReplay` inbound frames echo the input + output back over the
 *     transcript channel (so the binary's context picks up the result)
 *
 * `ShellEntry[]` is the UI-facing aggregation of in-flight + completed
 * shell exchanges. Three send modes:
 *   - "context"   — exchange XML gets buffered and prepended to the next
 *                   `sendUserMessage`, parity with TUI `!cmd`
 *   - "sideChannel" — fire-and-forget; output goes to ShellEntry only
 *
 * Pure JS over wire frames. No reactivity, no Node/Bun. Callers wire
 * the outbound `bash_command` send + the `sendUserMessage` follow-up
 * action via the constructor.
 */

import type { Transport } from "../transport/index";
import { isSystemFrame, isUserFrame, type InboundFrame } from "./frames";

// ---------- XML helpers (pure) ----------

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

export function buildBashXml(command: string, stdoutXml: string, stderrXml: string): string {
  return (
    `<bash-input>${escapeXml(command)}</bash-input>\n` +
    `<bash-stdout>${stdoutXml}</bash-stdout>` +
    `<bash-stderr>${stderrXml}</bash-stderr>`
  );
}

// ---------- runtime aggregator ----------

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

export interface ShellSnapshot {
  shellEntries: ShellEntry[];
}

export interface ShellAggregator {
  getSnapshot(): ShellSnapshot;
  /** Returns false on the replay path so the frame still flows to messages. */
  handleShellReplay(frame: InboundFrame): boolean;
  handleLocalCommandOutput(frame: InboundFrame): boolean;
  sendShellContext(command: string, followUp?: string): void;
  sendBashSideChannel(command: string): void;
  dismissShellEntry(id: string): void;
  /** Drain context-mode XML for the next outbound user message. */
  drainPending(text: string): string;
  hasPending(): boolean;
  reset(): void;
}

export interface ShellAggregatorOptions {
  /** Used to send outbound bash_command + (on follow-up) user messages. */
  transport: Transport;
  /** Called on context-mode follow-up after the bash exchange drains. */
  sendUserMessage: (text: string) => void;
  onChange?: (snap: ShellSnapshot) => void;
  newId?: () => string;
}

export function createShellAggregator(opts: ShellAggregatorOptions): ShellAggregator {
  const onChange = opts.onChange ?? (() => {});
  const newId = opts.newId ?? (() => crypto.randomUUID());

  let shellEntries: ShellEntry[] = [];
  const captureQueue: {
    entryId: string;
    command: string;
    source: ShellSource;
    sawInputEcho: boolean;
  }[] = [];
  const pendingBashExchanges: { entryId: string; xml: string }[] = [];
  const pendingFollowUps = new Map<string, string>();

  function emit() {
    onChange({ shellEntries });
  }

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
    const cap = captureQueue.shift();
    if (!cap) return false;
    const parts: string[] = [];
    if (parsed.stdout) parts.push(parsed.stdout);
    if (parsed.stderr) parts.push("[stderr] " + parsed.stderr);
    if (parsed.exit && parsed.exit !== "0") parts.push(`[exit ${parsed.exit}]`);
    const chunk = parts.join("\n");
    shellEntries = shellEntries.map((s) => (s.id === cap.entryId ? { ...s, chunks: [...s.chunks, chunk] } : s));
    emit();
    if (cap.source === "context") {
      const stdoutXml = escapeXml(parsed.stdout);
      const stderrXml = escapeXml(parsed.stderr);
      pendingBashExchanges.push({
        entryId: cap.entryId,
        xml: buildBashXml(cap.command, stdoutXml, stderrXml),
      });
      const followUp = pendingFollowUps.get(cap.entryId);
      if (followUp) {
        pendingFollowUps.delete(cap.entryId);
        opts.sendUserMessage(followUp);
      }
    }
    return false;
  }

  function handleLocalCommandOutput(frame: InboundFrame): boolean {
    if (!isSystemFrame(frame) || frame.subtype !== "local_command_output") return false;
    const head = captureQueue[0];
    if (!head) return false;
    const content = "content" in frame ? frame.content ?? "" : "";
    shellEntries = shellEntries.map((s) => (s.id === head.entryId ? { ...s, chunks: [...s.chunks, content] } : s));
    emit();
    return true;
  }

  function sendShellContext(command: string, followUp = "") {
    const id = newId();
    shellEntries = [...shellEntries, { id, command, source: "context", chunks: [], pending: true }];
    captureQueue.push({ entryId: id, command, source: "context", sawInputEcho: false });
    void opts.transport.send({ type: "bash_command", command }).catch(() => undefined);
    if (followUp.trim()) {
      pendingFollowUps.set(id, followUp);
    }
    emit();
  }

  function sendBashSideChannel(command: string) {
    const id = newId();
    shellEntries = [...shellEntries, { id, command, source: "sideChannel", chunks: [] }];
    captureQueue.push({ entryId: id, command, source: "sideChannel", sawInputEcho: false });
    void opts.transport.send({ type: "bash_command", command }).catch(() => undefined);
    emit();
  }

  function dismissShellEntry(id: string) {
    shellEntries = shellEntries.filter((s) => s.id !== id);
    emit();
  }

  function hasPending(): boolean {
    return pendingBashExchanges.length > 0;
  }

  function drainPending(text: string): string {
    if (pendingBashExchanges.length === 0) return text;
    const xml = pendingBashExchanges.map((p) => p.xml).join("\n");
    const payload = text.trim() ? `${xml}\n\n${text}` : xml;
    const drainedIds = new Set(pendingBashExchanges.map((p) => p.entryId));
    shellEntries = shellEntries.filter((s) => !drainedIds.has(s.id));
    pendingBashExchanges.length = 0;
    emit();
    return payload;
  }

  function reset() {
    shellEntries = [];
    captureQueue.length = 0;
    pendingBashExchanges.length = 0;
    pendingFollowUps.clear();
    emit();
  }

  return {
    getSnapshot: () => ({ shellEntries }),
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
