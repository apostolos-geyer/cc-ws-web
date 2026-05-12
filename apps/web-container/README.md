# apps/web-container

A third reference app, alongside [`apps/web`](../web) and [`apps/web-react`](../web-react), demonstrating the cc-ws stack **running entirely inside a Cloudflare Sandbox container**.

The simplest deployable shape that mirrors the production pattern used in [slopbox](https://github.com/apostolos-geyer/Apostoli.ca) — same `@cloudflare/sandbox` SDK, same per-session credential injection, same Worker-mediated GitHub PAT pattern — minus the auth, the database, the multi-tenant orchestration, and the prod env configs.

## What it shows

1. **`@cloudflare/sandbox` + `<cc-ws-chat>` end-to-end.** A single Workers app spawns a per-session sandbox container, runs `cc-ws-server` inside it as the WebSocket bridge, and serves the chat UI as static assets in front. One `vite dev` command runs everything.
2. **Per-session credential injection.** The operator's Claude OAuth token / API key is supplied by the browser, posted to the worker on session init, and baked into the sandbox session's env via `createSession({ env: { CLAUDE_CODE_OAUTH_TOKEN | ANTHROPIC_API_KEY: ... } })`. The credential lives in a single stack frame on the worker — no D1, no DO storage, no `.dev.vars`.
3. **PAT-as-outbound-proxy.** If a GitHub repo URL + PAT are supplied, the worker registers a per-instance `setOutboundByHost("github.com", "githubAuth", { pat })` on the Sandbox DO. The container runs **plain** `git clone https://github.com/...` — the worker's outbound handler injects `Authorization: Basic base64("x-access-token:" + pat)` in flight. The PAT never enters the container's filesystem or environment.
4. **Container can act autonomously.** With Claude creds in env + a cloned repo + `git config user.name/email` set + the PAT-injecting outbound handler in place, `claude` running inside the container can `git commit` and `git push` on its own. There is **no app-layer commit / PR plumbing** — the demo's frontend is just `<cc-ws-chat>`. The substrate is the point.
5. **Idempotent `/init`.** Re-calling `/init/:sessionId` for the same sessionId attaches to the existing sandbox and restarts the bridge in place — never spins a duplicate container. Survives page reloads, dev-server restarts, and "Clear credentials" cycles without leaking resources.

## What it doesn't show (intentional cuts vs slopbox)

- No auth (bouncer, OAuth, sessions).
- No D1, no Drizzle, no migrations.
- No orchestrator as a separate worker — collapsed into one app.
- No prod/staging envs in `wrangler.jsonc`. Demo only.
- No multi-sandbox UI / dashboard. **One sessionId per browser, write-once.** The id is generated on first page load and never changes — that's how reconnects work without server-side session tracking. If you want multi-sandbox listing, add a server-side index (D1 / KV / a singleton DO).
- No exposed preview URLs (`exposePort` / `proxyToSandbox`). Just `wsConnect` from the worker to the bridge port.
- No `<cc-ws-chat>`-adjacent UI for commits/PRs/repo state. Demonstrates the *substrate*, not application features.
- **No destroy endpoint.** Containers sleep via the SDK's `sleepAfter` idle timer; resetting browser state does NOT shut down the backend container. Demos only — production code would expose `sandbox.destroy()`.

## Architecture

```
Browser (Svelte SPA)
  ├─ localStorage["cc-ws-container.setup"]    = { claude: {kind, value}, github?: {pat, repoUrl}, git?: ... }
  ├─ localStorage["cc-ws-container.sessionId"] = crypto.randomUUID()  (write-once)
  │
  ▼ POST /init/:sessionId  (setup as JSON body — idempotent)
Worker (src/worker.ts → src/setup-flow.ts)
  ├─ getSandbox(env.Sandbox, sessionId)
  ├─ try sandbox.createSession({ id, env: { [envKey]: claudeCredValue }, cwd })
  │   └─ on SessionAlreadyExistsError: fall back to sandbox.getSession(id)  (reused=true; skip clone)
  ├─ if github: sandbox.setOutboundByHost("github.com", "githubAuth", { pat })  (always — overwrites)
  ├─ if github AND fresh: session.exec("git clone <url> /workspace/repo")
  ├─ if github AND fresh: session.exec("git config user.name|email ...")
  └─ session.startProcess("cc-ws-server", { processId:"cc-ws-bridge", env:{PORT:"9999"}, cwd })
         + proc.waitForPort(9999, { mode: "tcp" })   (idempotent on processId)
  │
  ▼ GET /ws/:sessionId  (WS upgrade)
Worker
  └─ sandbox.wsConnect(req, 9999)   // path rewritten to /ws upstream
  │
  ▼ inside the container
cc-ws-server (Bun) on :9999
  └─ on `_local:respawn`, Bun.spawn("claude", args)
     ├─ inherits CLAUDE_CODE_OAUTH_TOKEN | ANTHROPIC_API_KEY from session env
     └─ cwd defaults to /workspace/repo (if repo cloned) or /workspace
```

### Why port 9999 and not 3000

`@cloudflare/sandbox`'s `wsConnect` reserves port 3000 for its own control plane (`packages/sandbox/src/sandbox.ts:494` in the SDK source — `validatePort` throws if you pass 3000). Slopbox uses 9999 for the chat bridge specifically to avoid this. Routing the bridge through 3000 produced silent "Container not listening" loops and binary-bytes-as-JSON crashes during early development. The Dockerfile `EXPOSE`s 9999 and `cc-ws-server` is started with `PORT=9999`.

### Why `export { ContainerProxy }`

The Sandbox subclass declares `interceptHttps = true` + `outboundByHost`. The runtime's `applyOutboundInterception()` (`@cloudflare/containers/dist/lib/container.js:1158`) requires `ctx.exports.ContainerProxy` to be a top-level export on the worker. The SDK's canonical example (`examples/authentication/src/index.ts`) does this. Note that slopbox-orchestrator omits the export — that's a latent gap, not guidance.

## Run

```bash
# from the workspace root
bun install

# build the embed bundle that the SPA imports (only needs to be done once)
bun --filter '@somewhatintelligent/cc-ws-element' build

# start the demo: vite serves the SPA, @cloudflare/vite-plugin runs the worker,
# wrangler boots the sandbox container on first /init/:id POST
bun --filter './apps/web-container' dev
```

Open the URL vite prints, fill the form (Claude credential, optionally a GitHub repo URL + PAT), submit. The sandbox boots, optionally clones the repo, starts the bridge, and the chat UI gates open. Reload the page at any time — it reconnects to the existing container.

> First boot pulls `docker.io/cloudflare/sandbox:0.9.2` and installs npm globals; takes a minute or two. Subsequent inits reuse the image layers.

The `dev` script also pins the egress-proxy container image digest via `MINIFLARE_CONTAINER_EGRESS_IMAGE` — same value slopbox-orchestrator uses. Without that pin, miniflare can pull a fresher proxy image that mismatches the sandbox runtime protocol and the container fails to start with a generic "Container failed to start".

### Required: Docker

`wrangler dev` runs the container locally via Docker (or Docker-compatible runtime — Colima, OrbStack, Rancher Desktop all work). Make sure Docker is running before `bun dev`.

## Reconnect / clear semantics

The header has two buttons:

- **Retry init** (only visible if init failed) — re-runs `/init` on the **same sessionId**. The worker's idempotent path attaches to the existing container if one exists, or creates one if not. Never generates a new id.
- **Clear credentials** — wipes the `cc-ws-container.setup` localStorage entry (returns to the setup form) but **keeps the sessionId**. Re-submitting the form re-runs `/init` on the same id and reconnects to the existing container.

There is no UI path that generates a new sessionId, because there is no destroy endpoint — generating a new id would orphan the existing container. The id is **write-once per browser**, deliberately.

## Files

```
src/                # worker side
  worker.ts          # fetch routing: /init/:id, /ws/:id, else → ASSETS
  sandbox.ts         # Sandbox subclass with github outbound handler + ContainerProxy export
  setup-flow.ts      # idempotent createSession/getSession + clone + startProcess
  worker-env.ts      # Env binding types

client/              # browser side
  main.ts            # mounts Svelte App + side-effect-imports @somewhatintelligent/cc-ws-element
  App.svelte
  SetupForm.svelte
  SessionPanel.svelte
  SessionStatus.svelte
  Chat.svelte        # <cc-ws-chat> with inline-style theme tokens (pierce shadow DOM)
  stores/
    setup.ts         # Setup persisted to localStorage
    session.ts       # write-once sessionId + init status

Dockerfile           # FROM cloudflare/sandbox:0.9.2 + claude + cc-ws-server, EXPOSE 9999
wrangler.jsonc       # one worker, one container class, one DO binding, ASSETS
vite.config.ts       # svelte + @cloudflare/vite-plugin
```
