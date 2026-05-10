# cc-ws-web

Bun-hosted WebSocket bridge to the `claude` CLI plus a set of framework libraries and reference apps that consume it. Started as a single-file spike (`server.ts` + `client.tsx`); now a workspace where the bridge, the reactive client, and the embeddable UI ship as separate packages.

## Quick start

```sh
bun install
bun run dev          # boots the Svelte reference app at http://localhost:5173
                     # bridge runs separately on :3000 (see apps/web/package.json)
```

Each app and package is wired as a Bun workspace under `packages/*` and `apps/*`.

## Repository layout

### `packages/` — published libraries

| Package | What it is |
| ------- | ---------- |
| [`@somewhatintelligent/cc-ws-server`](packages/server)  | Bun WebSocket server. Spawns one `claude` child per WS connection, pumps NDJSON between stdio and the wire. Ships with a `cc-ws-server` CLI bin. |
| [`@somewhatintelligent/cc-ws-client`](packages/client)  | Framework-agnostic reactive client. Wraps the wire protocol in nanostores atoms (messages, status, permissions, tasks, hooks, mode, model, …). |
| [`@somewhatintelligent/cc-ws-react`](packages/react)    | React adapter. `useCcSession(session)` hook over `@nanostores/react`. |
| [`@somewhatintelligent/cc-ws-svelte`](packages/svelte)  | Svelte adapter. Typed context injection over the nanostores atoms (which already implement Svelte's store contract). |
| [`@somewhatintelligent/cc-ws-element`](packages/element) | `<cc-ws-chat>` Custom Element. Drop-in shadow-DOM-isolated chat UI; works in any framework. Built from the Svelte UI in `packages/element/src/`. |

### `apps/` — reference hosts

| App | Stack | Notes |
| --- | ----- | ----- |
| [`apps/web`](apps/web)             | Svelte 5 + Vite | Mounts `packages/element/src/App.svelte` directly. Also produces the embed bundle via `packages/element`'s `vite build`. |
| [`apps/web-react`](apps/web-react) | React 19 + Bun.serve | Single-process app: Bun serves the HTML + bundled `client.tsx` and hosts the bridge at `/ws`. Demo of `@somewhatintelligent/cc-ws-react`. |

## How it works

```
┌─────────────────┐   WebSocket (NDJSON)   ┌──────────────────────────┐
│ browser UI      │◀─────────────────────▶│ cc-ws-server (Bun)       │
│ (React/Svelte/  │                        │   spawns →               │
│  custom elem)   │                        │   claude --print         │
└─────────────────┘                        │     --input-format       │
                                           │     stream-json …        │
                                           └──────────────────────────┘
```

- **Bridge** owns the `claude` child process. WS open → spawn; WS close → kill. `_local` control frames let the client request a kill+respawn for new/continue/resume sessions.
- **Client** reconstructs streaming assistant deltas, queues `can_use_tool` permission prompts, exposes `set_permission_mode` / `set_model` / `set_thinking_effort` / `interrupt` controls, and persists session state to `localStorage`.
- **UI layer** (any of `cc-ws-react`, `cc-ws-svelte`, `cc-ws-element`) just subscribes to the atoms.

## Running individual apps

```sh
# Svelte reference (Vite dev server + bridge in one tab via concurrently)
bun --filter './apps/web' dev

# React reference (Bun serves HTML + bridge from one process)
bun --filter './apps/web-react' dev

# Build the <cc-ws-chat> embed bundle
bun --filter '@somewhatintelligent/cc-ws-element' build
```

## Limitations

- Designed for local dev / sandboxed deployment. The bridge has no auth — put it behind something (Cloudflare Sandbox container, an authenticated proxy, etc.) before exposing it.
- One WS = one `claude` child = one session.
- Relies on the host already being OAuth-authed at `~/.claude/.credentials.json`.
