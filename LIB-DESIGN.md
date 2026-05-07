# `@cc-ws/core` — framework-agnostic reactive client for Claude Code over WS

A reactive WS client that wraps a Claude Code child process running in `stream-json` mode. Frameworks consume reactive atoms; the core is framework-agnostic.

## Goals

- One reactive session API, useable from React, Svelte, Solid, Vue, vanilla.
- Cover the full surface the spike already uses: messages, streaming deltas, permission gate, mode/model/effort, interrupt, hooks, shell side-channel.
- First-class session lifecycle: new / continue / resume, not "always `--continue`".
- Reactivity primitive is **nanostores** atoms — lazy subscriptions with `onMount` lifecycle (open WS on first subscriber, close on last), first-party adapters for React/Svelte/Solid/Vue/Preact/Lit/Angular, designed for "ship a reactive store inside a library."
- The Bun bridge (the existing `server.ts`) ships as a peer module — the WS protocol is the contract; the bridge is one reference implementation.

## Folder layout

```
packages/
  core/                       # framework-agnostic
    src/
      index.ts                # public API: createCcSession
      session.ts              # session controller (atoms + methods)
      protocol.ts             # wire types: SDK control_request/response, _local frames
      messages.ts             # streaming reconstruction (assistant deltas → messages)
      permissions.ts          # can_use_tool queue + onCanUseTool dispatch
      controls.ts             # control_request helpers (set_permission_mode, set_model, ...)
      modes.ts                # PERMISSION_MODE_DEFS, EFFORT_DEFS, MODEL_DEFS, cycle order
      ws.ts                   # reconnecting WS wrapper, NDJSON framing
    package.json              # peerDeps: nanostores
  react/
    src/index.ts              # re-exports + thin wrapper around @nanostores/react
  svelte/
    src/index.ts              # @nanostores/svelte adapter
  solid/
    src/index.ts              # @nanostores/solid adapter
  bridge-bun/
    src/server.ts             # current server.ts, extracted; spawnClaude factory + protocol handler
    src/args.ts               # session-args → CLI args translation
```

For the spike: collapse to two folders — `core/` and `bridge-bun/` — and add framework adapters when a second consumer appears.

## Public API

### `createCcSession(options)`

```ts
import { createCcSession } from "@cc-ws/core";

const session = createCcSession({
  url: "ws://localhost:3000/ws",
  args: {
    mode: "new" | "continue" | { resume: sessionId: string },
    permissionMode: "default",
    model: "claude-opus-4-7",     // optional; defaults to whatever the binary picks
    effort: "high",               // optional; same
    includePartialMessages: true,
    includeHookEvents: true,
    permissionPromptTool: "stdio", // or null to disable can_use_tool routing
  },
  onCanUseTool: async ({ toolName, input, requestId }) => {
    // consumer renders UI, returns decision
    return { behavior: "allow" } | { behavior: "deny", message: "..." };
  },
  onError: (err) => { /* optional */ },
});
```

Returns:

```ts
type CcSession = {
  atoms: CcAtoms;
  connect: () => void;
  disconnect: () => void;
  sendMessage: (text: string) => void;
  sendShellContext: (command: string) => void;       // _local: shell, output injected as user message
  sendBashSideChannel: (command: string) => void;    // bash_command top-level frame, side-channel
  interrupt: () => Promise<void>;
  endSession: () => Promise<void>;
  setPermissionMode: (mode: PermissionMode) => Promise<void>;
  cyclePermissionMode: () => Promise<void>;
  setModel: (modelId: string) => Promise<void>;
  setEffort: (effort: EffortLevel) => Promise<void>; // triggers respawn
  setMaxThinkingTokens: (n: number) => Promise<void>;
  newSession: () => Promise<void>;                   // respawn with no --continue/--resume
  continueSession: () => Promise<void>;              // respawn with --continue
  resumeSession: (sessionId: string) => Promise<void>; // respawn with --resume <id>
  respondToPermission: (id: string, decision: PermissionDecision) => void;
};
```

### Atoms

All atoms are nanostores `atom<T>` or `computed<T>`. Frameworks subscribe via their adapter (`useStore` / `$store` / `from`).

```ts
type CcAtoms = {
  // connection
  status: ReadableAtom<"idle" | "connecting" | "open" | "respawning" | "closed" | "error">;
  lastError: ReadableAtom<string | null>;

  // session identity (from init message)
  sessionId: ReadableAtom<string | null>;
  cwd: ReadableAtom<string | null>;

  // conversation
  messages: ReadableAtom<MessageEntry[]>;
  // MessageEntry = user | assistant | tool_use | tool_result | system | streaming-assistant
  // streaming entries get patched in place as content_block_delta arrives

  // controls (what's currently active in the running child)
  activeMode: ReadableAtom<PermissionMode>;
  activeModel: ReadableAtom<string | null>;
  activeEffort: ReadableAtom<EffortLevel | null>;
  pendingMode: ReadableAtom<PermissionMode | null>;     // set during in-flight set_permission_mode
  modeError: ReadableAtom<string | null>;

  // permission gate
  pendingPermissions: ReadableAtom<PermissionRequest[]>; // can_use_tool queue
  // each: { id, toolName, input, requestId }

  // hooks
  hookEvents: ReadableAtom<HookEvent[]>;

  // shell side-channel
  shellEntries: ReadableAtom<ShellEntry[]>;

  // raw frame log (for the debug panel)
  trace: ReadableAtom<TraceFrame[]>;
};
```

### Static metadata exports

```ts
export const PERMISSION_MODE_DEFS: readonly { value: PermissionMode; label: string; inCycle: boolean }[];
export const EFFORT_DEFS: readonly { value: EffortLevel; label: string }[];     // low, medium, high, xhigh, max
export const MODEL_DEFS: readonly { value: string; label: string }[];           // includes [1m] variants
export const CYCLE_ORDER: readonly PermissionMode[];                            // mode cycle for shift+tab
export function nextCycleMode(current: PermissionMode): PermissionMode;
```

These mirror the binary's canonical order so the consumer's dropdowns/key handlers don't reinvent them.

## Wire-protocol contract (between core and bridge)

The lib is bridge-agnostic but assumes this contract on the WS:

### Bridge → client (NDJSON, one JSON object per line)

- All `SDKMessage` frames from the Claude Code child (system/init, assistant, user, result, stream_event).
- Control responses: `{ "type":"control_response", "response": { "subtype":"...", "request_id":"...", ... } }`.
- Local replies: `{ "_local":"shellResult"|"respawnResult", ... }`.

### Client → bridge

- Forwarded to claude stdin: full `stream-json` frames (user messages, control_requests).
- Intercepted locally:
  - `{ "_local":"shell", "command":"...", "requestId":"..." }` → bridge runs locally, returns `shellResult`.
  - `{ "_local":"respawn", "args":["--print", ...], "requestId":"..." }` → bridge kills child, spawns with args replacing `BASE_CLAUDE_ARGS` (or appending — see "Respawn semantics" below).

### Respawn semantics (proposed change to current bridge)

Today's `BASE_CLAUDE_ARGS` hardcodes `--continue`. To support new/resume, drop `--continue` from BASE and have the lib always send a `_local: respawn` on `connect()` carrying the session args:

```json
{ "_local": "respawn", "args": ["--continue"] }
{ "_local": "respawn", "args": ["--resume", "01HXYZ..."] }
{ "_local": "respawn", "args": [] }
```

Initial spawn at WS-open then becomes a placeholder that immediately gets respawned. Or: bridge waits for the first `_local: respawn` before spawning at all (simpler, no wasted process).

## Streaming reconstruction

The current `streamingRef + streamTick` force-rerender hack disappears: streaming deltas mutate the appropriate `messages` atom entry. Consumers using nanostores re-render naturally on each delta because the atom emits.

```ts
// inside core/messages.ts
function applyStreamEvent(messages, event) {
  switch (event.event.type) {
    case "message_start": /* push streaming-assistant placeholder */;
    case "content_block_start": /* attach block */;
    case "content_block_delta": /* append text/json/thinking delta to current block */;
    case "content_block_stop": /* finalize block */;
    case "message_stop": /* mark streaming entry as final */;
  }
}
```

A debounce option (`streamingFlushMs?: number`) on `createCcSession` lets consumers throttle re-renders for very high-frequency deltas if perf matters.

## Permission gate — two ways to consume

**Promise-style (default):**

```ts
createCcSession({
  onCanUseTool: async ({ toolName, input }) => {
    const ok = confirm(`Allow ${toolName}?`);
    return ok ? { behavior: "allow" } : { behavior: "deny", message: "user denied" };
  },
});
```

**Queue-style (consumer renders inline UI):**

```ts
// don't pass onCanUseTool
useStore(session.atoms.pendingPermissions); // [{ id, toolName, input }]
// when user clicks approve/deny:
session.respondToPermission(id, { behavior: "allow" });
```

Internally the promise-style just consumes the queue and resolves the registered promise.

## Framework adapters

```ts
// React
import { useCcAtom } from "@cc-ws/react";
const messages = useCcAtom(session.atoms.messages);

// Svelte
import { atomStore } from "@cc-ws/svelte";
const messages = atomStore(session.atoms.messages); // $messages
```

Each adapter is a 10-line file delegating to `@nanostores/<framework>`. Could even skip and let consumers use `@nanostores/react` directly — the adapters only exist to re-export types.

## Open questions / decisions deferred

1. **Reconnecting WS**: should the lib auto-reconnect on close, or leave it to the consumer? Lean: leave to consumer for v0; add `reconnect: true` option later.
2. **Multiple concurrent sessions per process**: out of scope for v0. One `createCcSession` = one child.
3. **Storage of session list / session resumption from disk**: out of scope. Consumer asks the user / queries `claude --list-sessions` separately.
4. **MCP / hooks config injection**: today the bridge bakes in `--include-hook-events`. For real use we'd want to pass MCP servers and hook commands via flags or config file at respawn time. Defer until needed.
5. **Bridge target beyond Bun**: a Cloudflare-Sandbox bridge for slopbox uses the same protocol but spawns inside a container. The contract above should be sufficient; verify by porting.

## Migration plan

1. Land the doc, agree on shape.
2. Spike: extract `ws.ts` + `messages.ts` + atoms for `status`, `messages` only — leave the rest in `client.tsx`. Validate the seam.
3. Move controls (`set_permission_mode` / `set_model` / respawn) into core.
4. Move permission gate.
5. Move hooks + shell.
6. Delete the now-dead React-state in `client.tsx`; rewire to `useCcAtom`.
7. (Future) Extract bridge into its own package; document the protocol as the seam.

Step 2 is the high-leverage decision point — if the seam feels right with just status + messages, the rest follows mechanically.
