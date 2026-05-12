// Worker entry. Two dynamic routes:
//   POST /init/:sessionId  — accepts the Setup payload from the browser,
//                            bootstraps the sandbox (session env, optional
//                            git clone, bridge process), returns { ok }.
//   GET  /ws/:sessionId    — proxies the WebSocket upgrade to the cc-ws-server
//                            bridge inside the sandbox via `sandbox.wsConnect`.
//
// Everything else falls through to the SPA via the ASSETS binding.
//
// There is no auth. The sessionId is opaque to the worker — it's whatever
// the browser generated. Two browsers can't share the same sessionId
// without one stomping the other's sandbox; that's intentional for a demo.

import { getSandbox, type Sandbox as SandboxBinding } from "@cloudflare/sandbox";
import { Sandbox } from "./sandbox";
import { initSession, BRIDGE_PORT, type Setup } from "./setup-flow";
import type { Env } from "./worker-env";

// Two top-level exports the sandbox runtime requires:
//
// 1. `Sandbox`  — our subclass (DO class, registered in wrangler.jsonc's
//    `migrations` block). The runtime instantiates this when the worker is
//    asked for a sandbox via getSandbox().
//
// 2. `ContainerProxy` — the WorkerEntrypoint that `@cloudflare/containers`
//    uses for outbound-HTTPS interception. Required ANY time a Sandbox
//    subclass has `interceptHttps = true` + outboundByHost handlers
//    (that's us). The runtime reaches it via `ctx.exports.ContainerProxy`
//    and throws "ctx.exports.ContainerProxy is undefined" if missing.
//
// Source of truth: cloudflare/sandbox-sdk
// `examples/authentication/src/index.ts` (the canonical interceptHttps
// example) — it does the same `export { ContainerProxy }`. Slopbox-
// orchestrator omits this export; that's a latent bug in slopbox's setup
// (they're likely not hitting the interception code path in dev), not
// guidance to follow.
export { Sandbox };
export { ContainerProxy } from "@cloudflare/sandbox";

const WS_PATH_RE = /^\/ws\/([^/]+)$/;
const INIT_PATH_RE = /^\/init\/([^/]+)$/;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    const initMatch = url.pathname.match(INIT_PATH_RE);
    if (initMatch && request.method === "POST") {
      return handleInit(request, env, decodeURIComponent(initMatch[1]!));
    }

    const wsMatch = url.pathname.match(WS_PATH_RE);
    if (wsMatch) {
      return handleWs(request, env, decodeURIComponent(wsMatch[1]!));
    }

    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;

async function handleInit(
  request: Request,
  env: Env,
  sessionId: string,
): Promise<Response> {
  let setup: Setup;
  try {
    setup = (await request.json()) as Setup;
  } catch {
    return json({ ok: false, reason: "bad-json" }, 400);
  }

  const validation = validateSetup(setup);
  if (validation) return json({ ok: false, reason: validation }, 400);

  const result = await initSession(env, sessionId, setup);
  return json(result, result.ok ? 200 : 500);
}

async function handleWs(
  request: Request,
  env: Env,
  sessionId: string,
): Promise<Response> {
  if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
    return new Response("expected websocket upgrade", { status: 426 });
  }
  // Rewrite the upstream path to /ws — that's where cc-ws-server mounts
  // its upgrade handler (packages/server/src/server.ts:189).
  const upstreamUrl = new URL(request.url);
  upstreamUrl.pathname = "/ws";
  const upstream = new Request(upstreamUrl, request);
  const sandbox = getSandbox(env.Sandbox as unknown as DurableObjectNamespace<SandboxBinding>, sessionId, {
    normalizeId: true,
  });
  return sandbox.wsConnect(upstream, BRIDGE_PORT);
}

function validateSetup(setup: unknown): string | null {
  if (!setup || typeof setup !== "object") return "setup-not-object";
  const s = setup as Record<string, unknown>;
  const claude = s.claude as Record<string, unknown> | undefined;
  if (!claude || typeof claude !== "object") return "missing-claude";
  if (claude.kind !== "oauth" && claude.kind !== "api-key") return "bad-claude-kind";
  if (typeof claude.value !== "string" || claude.value.length === 0) return "bad-claude-value";
  if (s.github !== undefined) {
    const gh = s.github as Record<string, unknown>;
    if (typeof gh.pat !== "string" || gh.pat.length === 0) return "bad-github-pat";
    if (typeof gh.repoUrl !== "string" || !gh.repoUrl.startsWith("https://github.com/")) {
      return "bad-github-repo-url";
    }
  }
  return null;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
