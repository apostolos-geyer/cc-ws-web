// Bash exchange XML — single source of truth for the format the bridge
// replays back when a `bash_command` frame runs. Three shapes ride the
// `user` content channel:
//   input-only   <bash-input>cmd</bash-input>
//   output-only  <bash-stdout>…</bash-stdout><bash-stderr>…</bash-stderr><bash-exit-code>0</bash-exit-code>
//   merged       both, plus arbitrary trailing user text (drain-synthesis)
// Both the lib's outbound writer (handleShellReplay) and any UI that
// renders bash exchanges parse the same shape — keep them in lockstep
// here.

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
