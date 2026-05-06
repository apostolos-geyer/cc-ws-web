# cc-ws-web

Spike: prove `claude --print --input-format stream-json` is workable as a bidirectional WebSocket-driven chat surface. macOS-local only.

## Run

```sh
bun install
bun run dev
```

Open http://localhost:3000. Type a prompt, click Send. Interrupt button cancels the in-flight turn.

## What it is

- `server.ts`: Bun.serve static + `/ws`. On WS open, spawns `claude --continue --print --input-format stream-json --output-format stream-json --verbose` and pipes stdout NDJSON -> WS, WS messages -> stdin NDJSON.
- `client.tsx`: React 19 single-file UI. Renders assistant turns (markdown), tool_use cards, can_use_tool approve/deny widget, Interrupt button.

## Known limitations (by design)

- No auth, no CORS — localhost only.
- No reconnect; refresh kills the conversation.
- One WS = one `claude --continue` child = one session.
- Relies on the user already being OAuth-authed at `~/.claude/.credentials.json`.
- No tests, no eslint, no prettier, no design system.
