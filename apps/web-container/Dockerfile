FROM docker.io/cloudflare/sandbox:0.9.2

# Base image ships Bun + Node 20 + a debian userland with git preinstalled.
# We add:
#   - @anthropic-ai/claude-code: the `claude` CLI on $PATH, which the bridge
#     spawns per WS session.
#   - @somewhatintelligent/cc-ws-server: the WebSocket bridge, installed as a
#     global `cc-ws-server` binary so `session.startProcess("cc-ws-server", ...)`
#     resolves directly.
#
# Credentials (Claude OAuth/API key, GitHub PAT) are NEVER baked into the
# image. The Claude credential is injected per-session via
# `sandbox.createSession({ env })` — see src/setup-flow.ts. The GitHub PAT
# is injected at the Worker boundary via `setOutboundByHost("github.com",
# ...)` — see src/sandbox.ts. The container itself never sees the PAT.
RUN npm install -g @anthropic-ai/claude-code @somewhatintelligent/cc-ws-server@0.1.4

# Port 9999 — NOT 3000. The @cloudflare/sandbox SDK reserves port 3000 for
# its own control plane; sandbox.wsConnect refuses to route to it. Matches
# slopbox-orchestrator/Dockerfile:13 exactly.
EXPOSE 9999
