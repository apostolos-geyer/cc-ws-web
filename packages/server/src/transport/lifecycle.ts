/**
 * OS-level lifecycle helpers used by `spawnTransport`.
 *
 * Pure runtime concerns separate from the protocol state machine:
 *   - Idle-timeout watchdog: if no inbound frame arrives within
 *     `idleMs`, hard-kill the child.
 *   - Graceful shutdown: SIGTERM → wait → SIGKILL. The protocol-level
 *     `end_session` handshake is `ClaudeProcess`'s job; the *runtime*
 *     teardown after that is what these helpers do.
 *   - Signal forwarding: when the parent receives SIGINT/SIGTERM, ensure
 *     the spawned child gets cleaned up too.
 */

import type { Subprocess } from "bun";

export interface IdleWatchdog {
  reset(): void;
  cancel(): void;
}

export function createIdleWatchdog(
  idleMs: number,
  onFire: () => void,
): IdleWatchdog {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const arm = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(onFire, idleMs);
  };
  arm();
  return {
    reset: arm,
    cancel() {
      if (timer) clearTimeout(timer);
      timer = null;
    },
  };
}

export async function gracefulKill(
  child: Subprocess<"pipe", "pipe", "inherit" | "pipe">,
  opts: { sigtermWaitMs?: number } = {},
): Promise<void> {
  const sigtermWaitMs = opts.sigtermWaitMs ?? 1500;
  if (child.exitCode !== null) return;
  try {
    child.kill("SIGTERM");
  } catch {
    // ignore — may already be dead
  }
  const winner = await Promise.race([
    child.exited.then(() => "exit" as const),
    new Promise<"timeout">((r) => setTimeout(() => r("timeout"), sigtermWaitMs)),
  ]);
  if (winner === "exit") return;
  try {
    child.kill("SIGKILL");
  } catch {
    // ignore
  }
  await child.exited;
}
