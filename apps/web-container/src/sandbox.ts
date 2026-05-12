// Sandbox subclass that intercepts outbound HTTPS to github.com so we can
// inject a per-session GitHub PAT *at the Worker boundary*. The PAT never
// enters the container's filesystem or environment — the container runs
// plain `git clone https://github.com/owner/repo.git`, this handler
// rewrites the Authorization header in flight.
//
// Pattern copied from @cloudflare/sandbox's docs and from the slopbox
// production setup (see Apostoli.ca/services/slopbox-orchestrator/src/sandbox.ts).
// `setOutboundByHost("github.com", "githubAuth", { pat })` on the DO
// resolves `ctx.params` here so each session can supply its own PAT
// without it ever crossing the worker→container boundary.

import { Sandbox as BaseSandbox } from "@cloudflare/sandbox";
import type { Env } from "./worker-env";

// `static outboundByHost` is typed against the platform's default `Env`
// from worker-configuration.d.ts, which fights with our generic. Keep the
// handler signature permissive (env: unknown) — it doesn't read env anyway,
// the PAT rides on ctx.params.
type GithubAuthCtx = {
  containerId: string;
  className: string;
  params?: { pat?: string };
};

const githubAuthHandler = (
  req: Request,
  _env: unknown,
  ctx: GithubAuthCtx,
): Promise<Response> => {
  const pat = ctx.params?.pat;
  const next = new Request(req);
  if (pat) {
    next.headers.set("Authorization", `Basic ${btoa(`x-access-token:${pat}`)}`);
    next.headers.set("User-Agent", "git/cc-ws-container-demo");
  }
  return fetch(next);
};

export class Sandbox extends BaseSandbox<Env> {
  // Required so HTTPS to github.com is intercepted by the outbound handler.
  // Without this, HTTPS bypasses the proxy entirely and the container
  // would need credentials of its own.
  interceptHttps = true;

  static outboundByHost = { "github.com": githubAuthHandler };
  // Registry referenced by setOutboundByHost(hostname, methodName, params)
  // — required for the per-instance PAT override at session-create time.
  static outboundHandlers = { githubAuth: githubAuthHandler };
}
