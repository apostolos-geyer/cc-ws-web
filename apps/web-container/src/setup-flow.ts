// Per-session sandbox bootstrap. Called by the worker on POST /init/:id.
// **Idempotent by design** — re-calling with the same sessionId attaches to
// the existing sandbox + restarts the bridge in place, instead of leaking a
// fresh container. Mirrors the SDK's own internal pattern at
// packages/sandbox/src/sandbox.ts:2447-2463: try createSession, catch
// SessionAlreadyExistsError, fall back to getSession.
//
// Credential lifecycle (matches the slopbox invariant — see
// Apostoli.ca/services/slopbox-orchestrator/src/index.ts:289-307):
//   - Claude credential lives in this stack frame only. Posted to the
//     container as session env on first init, then dropped from worker
//     memory. Re-init does NOT change baked-in env — credential is
//     "first writer wins". To rotate, call destroySession first.
//   - GitHub PAT lives in this stack frame only. Registered on the DO via
//     setOutboundByHost (idempotent — re-call overwrites). The PAT never
//     enters the container — the outbound handler in sandbox.ts injects
//     it at the Worker layer.

import { getSandbox } from "@cloudflare/sandbox";
import type { Env } from "./worker-env";

// Port 3000 is RESERVED by the @cloudflare/sandbox SDK for its own control
// plane — sandbox.wsConnect / validatePort throws if you pass 3000. Slopbox
// uses 9999 specifically to avoid this (slopbox-orchestrator/src/index.ts:153,
// Dockerfile:13). cc-ws-server respects $PORT, so passing 9999 here propagates
// through `session.startProcess("cc-ws-server", { env: { PORT: "9999" } })`.
export const BRIDGE_PORT = 9999;
export const BRIDGE_PROCESS_ID = "cc-ws-bridge";
export const REPO_DIR = "/workspace/repo";

export type ClaudeCredential =
  | { kind: "oauth"; value: string }
  | { kind: "api-key"; value: string };

export type GithubSetup = {
  pat: string;
  /**
   * Full https URL — `https://github.com/owner/repo.git` or without `.git`.
   * No PAT in this URL; the outbound handler injects auth at the worker boundary.
   */
  repoUrl: string;
};

export type GitIdentity = {
  userName: string;
  userEmail: string;
};

export type Setup = {
  claude: ClaudeCredential;
  github?: GithubSetup;
  git?: GitIdentity;
};

export type InitResult =
  | { ok: true; cwd: string; reused: boolean }
  | { ok: false; reason: string; detail?: string };

const DEFAULT_GIT_IDENTITY: GitIdentity = {
  userName: "claude",
  userEmail: "claude@local",
};

function claudeEnvKey(kind: ClaudeCredential["kind"]): string {
  // Mirrors slopbox-orchestrator/src/index.ts:294 — kind-discriminated env
  // var name. The `claude` CLI picks one or the other transparently.
  return kind === "oauth" ? "CLAUDE_CODE_OAUTH_TOKEN" : "ANTHROPIC_API_KEY";
}

function isSessionAlreadyExists(err: unknown): boolean {
  // `SessionAlreadyExistsError` is constructed inside @cloudflare/sandbox
  // 0.9.2 but NOT exported from its `index.d.ts` (see node_modules dist).
  // The class does set `this.name = "SessionAlreadyExistsError"`, so a name
  // check is the most robust runtime detector available across versions.
  if (!(err instanceof Error)) return false;
  if (err.name === "SessionAlreadyExistsError") return true;
  // Defensive: some error wrappers strip the name; fall back to the
  // canonical message substring.
  return /session.*already exists/i.test(err.message);
}

export async function initSession(
  env: Env,
  sessionId: string,
  setup: Setup,
): Promise<InitResult> {
  const sandbox = getSandbox(env.Sandbox, sessionId, { normalizeId: true });
  const envKey = claudeEnvKey(setup.claude.kind);

  // Try createSession first. On "already exists", swap to getSession and
  // skip the clone + initial git config (the repo dir is already there
  // from the first init). startProcess is idempotent on processId so we
  // always run it — covers both fresh and resumed paths.
  let session;
  let reused = false;
  try {
    session = await sandbox.createSession({
      id: sessionId,
      env: { [envKey]: setup.claude.value },
      ...(setup.github ? { cwd: REPO_DIR } : {}),
    });
  } catch (err) {
    if (!isSessionAlreadyExists(err)) {
      return {
        ok: false,
        reason: "session-create-failed",
        detail: err instanceof Error ? err.message : String(err),
      };
    }
    try {
      session = await sandbox.getSession(sessionId);
      reused = true;
    } catch (getErr) {
      return {
        ok: false,
        reason: "session-attach-failed",
        detail: getErr instanceof Error ? getErr.message : String(getErr),
      };
    }
  }

  if (setup.github) {
    try {
      // setOutboundByHost is per-instance and overwrites prior params, so
      // it's safe to re-call on resume — keeps the PAT injection wired
      // even if the operator hasn't changed the PAT.
      const sandboxStub = sandbox as unknown as {
        setOutboundByHost: (
          hostname: string,
          methodName: string,
          params?: Record<string, unknown>,
        ) => Promise<void>;
      };
      await sandboxStub.setOutboundByHost("github.com", "githubAuth", {
        pat: setup.github.pat,
      });

      if (!reused) {
        // Fresh session — clone the repo and configure git identity.
        // Outbound handler injects Basic auth at the worker boundary.
        const cloneResult = await session.exec(
          `git clone ${shellQuote(setup.github.repoUrl)} ${shellQuote(REPO_DIR)}`,
        );
        if (cloneResult.exitCode !== 0) {
          return {
            ok: false,
            reason: "clone-failed",
            detail: cloneResult.stderr || cloneResult.stdout,
          };
        }
        const identity = setup.git ?? DEFAULT_GIT_IDENTITY;
        await session.exec(
          `git -C ${shellQuote(REPO_DIR)} config user.name ${shellQuote(identity.userName)}`,
        );
        await session.exec(
          `git -C ${shellQuote(REPO_DIR)} config user.email ${shellQuote(identity.userEmail)}`,
        );
      }
    } catch (err) {
      return {
        ok: false,
        reason: "git-setup-failed",
        detail: err instanceof Error ? err.message : String(err),
      };
    }
  }

  // Start the chat bridge inside the sandbox. Per the slopbox comment at
  // services/slopbox-orchestrator/src/index.ts:586-587, startProcess is
  // idempotent on processId — a re-call with the same id either no-ops
  // (if running) or revives a crashed instance. Safe on both fresh and
  // resumed paths.
  const cwd = setup.github ? REPO_DIR : "/workspace";
  try {
    const proc = await session.startProcess("cc-ws-server", {
      processId: BRIDGE_PROCESS_ID,
      env: { PORT: String(BRIDGE_PORT) },
      cwd,
    });
    // TCP probe — cc-ws-server's HTTP root returns 404, only /ws upgrades
    // succeed, so HTTP-based readiness checks would falsely fail.
    await proc.waitForPort(BRIDGE_PORT, { mode: "tcp" });
  } catch (err) {
    return {
      ok: false,
      reason: "bridge-start-failed",
      detail: err instanceof Error ? err.message : String(err),
    };
  }

  return { ok: true, cwd, reused };
}

function shellQuote(s: string): string {
  // Single-quote and escape any embedded single quotes. Enough for the
  // controlled inputs we pass (paths, URLs, names) — not a general shell
  // escape. The repo URL is validated at the worker boundary before
  // reaching here.
  return `'${s.replace(/'/g, "'\\''")}'`;
}
