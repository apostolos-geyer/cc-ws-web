/**
 * `spawnTransport({ args, env?, cwd? })` — spawn a Claude child via
 * `Bun.spawn`, wire its stdio through `stdioTransport`, and expose the
 * resulting `Transport` together with handles for the underlying process.
 *
 * The canonical stream-json invocation is fixed by this adapter:
 *   claude --print --input-format stream-json --output-format stream-json
 *          --verbose [...userArgs]
 *
 * The caller passes the args that vary per session (e.g. `--continue`,
 * `--resume <id>`, `--permission-mode plan`, `--model <m>`). The fixed
 * flags are added automatically so consumers don't accidentally drop one.
 *
 * The returned transport `close()`s the child via SIGTERM → SIGKILL when
 * called. Callers expecting a clean shutdown should drive the protocol
 * teardown (`end_session`) through their `ClaudeProcess` first, then call
 * `transport.close()`.
 */

import { spawn, type Subprocess } from "bun";
import type { Transport } from "@somewhatintelligent/cc-protocol/transport";

import { stdioTransport } from "./stdio";
import { gracefulKill } from "./lifecycle";

const CANONICAL_ARGS = [
  "--print",
  "--input-format",
  "stream-json",
  "--output-format",
  "stream-json",
  "--verbose",
] as const;

export interface SpawnTransportOptions {
  /** Path to the claude binary. Defaults to `"claude"` (resolved on PATH). */
  binary?: string;
  /** User args appended after the canonical flags. */
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
  /** Optional handler for non-JSON stdout lines (log noise, errors). */
  onRawLine?: (line: string) => void;
  /** Optional handler for stderr lines. */
  onStderr?: (line: string) => void;
  /**
   * Skip the canonical `--print --input-format stream-json …` prefix.
   * Used by tests that spawn `cat`-like processes; production code should
   * never set this.
   */
  rawArgs?: boolean;
}

export interface SpawnTransport extends Transport {
  readonly pid: number;
  /**
   * Resolves with the child's exit code when it terminates. Useful for
   * detecting unexpected crashes.
   */
  readonly exited: Promise<number>;
  /** Force-kill the child (skips graceful shutdown). */
  kill(signal?: "SIGTERM" | "SIGINT" | "SIGKILL"): void;
}

export function spawnTransport(opts: SpawnTransportOptions = {}): SpawnTransport {
  const binary = opts.binary ?? "claude";
  const userArgs = opts.args ?? [];
  const argv = opts.rawArgs
    ? [binary, ...userArgs]
    : [binary, ...CANONICAL_ARGS, ...userArgs];

  const child = spawn(argv, {
    cwd: opts.cwd,
    env: { ...process.env, ...(opts.env ?? {}) },
    stdin: "pipe",
    stdout: "pipe",
    stderr: opts.onStderr ? "pipe" : "inherit",
  }) as Subprocess<"pipe", "pipe", "pipe" | "inherit">;

  if (opts.onStderr && (child.stderr as ReadableStream<Uint8Array> | undefined)) {
    // Drain stderr line-by-line.
    (async () => {
      const reader = (child.stderr as ReadableStream<Uint8Array>).getReader();
      const decoder = new TextDecoder();
      let buf = "";
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          if (!value) continue;
          buf += decoder.decode(value, { stream: true });
          let nl: number;
          while ((nl = buf.indexOf("\n")) >= 0) {
            const line = buf.slice(0, nl);
            buf = buf.slice(nl + 1);
            if (line) opts.onStderr!(line);
          }
        }
      } catch {
        // ignore
      }
    })();
  }

  const inner = stdioTransport({
    stdin: child.stdin,
    stdout: child.stdout as ReadableStream<Uint8Array>,
    onRawLine: opts.onRawLine,
  });

  let closed = false;
  const exited = child.exited.then((code) => code ?? 0);

  // If the child exits on its own, surface as closed.
  exited.then(() => {
    closed = true;
  }, () => {
    closed = true;
  });

  return {
    async send(frame) {
      if (closed) throw new Error("spawnTransport: send after close");
      await inner.send(frame);
    },
    onFrame(h) {
      return inner.onFrame(h);
    },
    async close(): Promise<void> {
      if (closed) return;
      closed = true;
      // Try to close stdin so the child sees EOF on its protocol channel.
      try {
        await inner.close();
      } catch {
        // ignore
      }
      // Graceful kill — SIGTERM, wait, SIGKILL.
      await gracefulKill(child);
    },
    get closed() {
      return closed;
    },
    get pid() {
      return child.pid;
    },
    exited,
    kill(signal?: "SIGTERM" | "SIGINT" | "SIGKILL") {
      try {
        child.kill(signal ?? "SIGTERM");
      } catch {
        // ignore
      }
    },
  };
}
