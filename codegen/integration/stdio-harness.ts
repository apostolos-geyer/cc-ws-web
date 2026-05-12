/**
 * stdio-harness.ts — spawn a Claude binary in stream-json mode, parse the
 * JSONL framing on stdout, and provide a typed send/onFrame surface for
 * integration tests.
 *
 * Guarantees:
 *   - JSONL framing on stdin (write `JSON.stringify(frame) + '\n'`).
 *   - Line-buffered stdout parsing — partial lines are buffered until '\n'.
 *   - Idle timeout: if no frame arrives within `idleTimeoutMs` (default 10s),
 *     the harness force-kills the binary. Prevents runaway processes when a
 *     test prompts for a turn the LLM never finishes.
 *   - Best-effort `end_session` before SIGKILL: callers calling `kill()` get
 *     a graceful shutdown attempt first; only if that doesn't ack within
 *     `gracePeriodMs` (default 1.5s) do we hard-kill.
 *
 * Used by `run-tests.ts`. Pure stdio — no network, no temp files.
 */

import type { ChildProcessByStdio } from "node:child_process";
import { spawn } from "node:child_process";
import type { Readable, Writable } from "node:stream";

export interface StdioHarnessOptions {
  binary: string;
  args: string[];
  cwd?: string;
  env?: Record<string, string>;
  idleTimeoutMs?: number;
  gracePeriodMs?: number;
  /** Optional handler for every line read from the child's stderr. */
  onStderr?: (line: string) => void;
}

export interface StdioHarness {
  pid: number;
  /** Send a JSON frame to the child over stdin. */
  send(frame: unknown): Promise<void>;
  /** Register an inbound-frame handler. Returns an unsubscribe fn. */
  onFrame(handler: (frame: unknown, rawLine: string) => void): () => void;
  /**
   * Best-effort graceful shutdown. Sends `end_session` (unless `force` is
   * true), waits up to `gracePeriodMs` for `control_response/success`, then
   * SIGTERM, then SIGKILL.
   */
  kill(opts?: { force?: boolean }): Promise<void>;
  /** Resolves when the child exits. */
  exit: Promise<{ code: number | null; signal: NodeJS.Signals | null }>;
}

export async function spawnHarness(opts: StdioHarnessOptions): Promise<StdioHarness> {
  const idleTimeoutMs = opts.idleTimeoutMs ?? 10_000;
  const gracePeriodMs = opts.gracePeriodMs ?? 1_500;

  const child = spawn(opts.binary, opts.args, {
    cwd: opts.cwd,
    env: { ...process.env, ...opts.env },
    stdio: ["pipe", "pipe", "pipe"],
  }) as ChildProcessByStdio<Writable, Readable, Readable>;

  if (!child.pid) {
    throw new Error(`[stdio-harness] failed to spawn ${opts.binary}`);
  }

  const handlers = new Set<(frame: unknown, raw: string) => void>();

  let stdoutBuf = "";
  let idleTimer: NodeJS.Timeout | null = null;
  let idleFired = false;
  const resetIdle = () => {
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      idleFired = true;
      try {
        child.kill("SIGKILL");
      } catch {
        // ignore
      }
    }, idleTimeoutMs);
  };
  resetIdle();

  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk: string) => {
    resetIdle();
    stdoutBuf += chunk;
    let nl: number;
    while ((nl = stdoutBuf.indexOf("\n")) >= 0) {
      const line = stdoutBuf.slice(0, nl);
      stdoutBuf = stdoutBuf.slice(nl + 1);
      if (line.trim() === "") continue;
      let parsed: unknown;
      try {
        parsed = JSON.parse(line);
      } catch {
        // Non-JSON line; forward verbatim so callers can inspect raw output.
        for (const h of handlers) h({ __raw__: line }, line);
        continue;
      }
      for (const h of handlers) h(parsed, line);
    }
  });

  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk: string) => {
    if (opts.onStderr) {
      for (const line of chunk.split("\n")) {
        if (line) opts.onStderr(line);
      }
    }
  });

  const exit = new Promise<{
    code: number | null;
    signal: NodeJS.Signals | null;
  }>((resolve) => {
    child.on("exit", (code, signal) => {
      if (idleTimer) clearTimeout(idleTimer);
      resolve({ code, signal });
    });
  });

  let killed = false;

  const harness: StdioHarness = {
    pid: child.pid,
    async send(frame) {
      if (killed) throw new Error("[stdio-harness] cannot send after kill");
      const line = JSON.stringify(frame) + "\n";
      await new Promise<void>((resolve, reject) => {
        child.stdin.write(line, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    },
    onFrame(handler) {
      handlers.add(handler);
      return () => handlers.delete(handler);
    },
    async kill(killOpts) {
      if (killed) return;
      killed = true;
      const force = killOpts?.force ?? false;
      if (!force) {
        try {
          const endFrame = {
            type: "control_request",
            request_id: `harness-end-${Date.now()}`,
            request: { subtype: "end_session" },
          };
          await harness.send(endFrame).catch(() => undefined);
          // Wait up to gracePeriodMs for the child to exit on its own.
          const winner = await Promise.race([
            exit.then(() => "exit" as const),
            new Promise<"timeout">((r) => setTimeout(() => r("timeout"), gracePeriodMs)),
          ]);
          if (winner === "exit") return;
        } catch {
          // ignore — fall through to SIGTERM/SIGKILL.
        }
      }
      try {
        child.kill("SIGTERM");
      } catch {
        // ignore
      }
      const sigtermResult = await Promise.race([
        exit.then(() => "exit" as const),
        new Promise<"timeout">((r) => setTimeout(() => r("timeout"), 500)),
      ]);
      if (sigtermResult === "exit") return;
      try {
        child.kill("SIGKILL");
      } catch {
        // ignore
      }
      await exit;
    },
    exit,
  };

  // Expose whether the idle-timeout fired so callers can flag stuck tests.
  Object.defineProperty(harness, "idleFired", {
    get: () => idleFired,
    enumerable: false,
  });
  return harness;
}
