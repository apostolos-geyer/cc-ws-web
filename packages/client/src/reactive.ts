/**
 * `createReactiveClient(opts)` — thin nanostores facade over
 * `ClaudeClient` from `@somewhatintelligent/cc-protocol/client`.
 *
 * This is the *new* additive entry point introduced in Phase 4. The
 * pre-existing `createCcSession` continues to be the canonical higher-level
 * API: it owns session-mode lifecycle (`continue`/`resume`/`new`), shell
 * side-channel, message-timeline state, hooks, persistence, etc. — none of
 * which `ClaudeClient` knows about by design.
 *
 * `createReactiveClient` is useful when you want minimal overhead and just
 * need:
 *   - a `ClaudeClient` instance wired to a WebSocket transport,
 *   - a nanostores `atom` mirroring `client.getSnapshot()` for templating,
 *   - optional `reconnect` config.
 *
 * For typical UI consumers, prefer `createCcSession`.
 */

import { atom, type ReadableAtom } from "nanostores";
import { ClaudeClient, type ClientState, type ClaudeClientOptions } from "@somewhatintelligent/cc-protocol/client";
import { wsClientTransport, type ExpBackoff } from "@somewhatintelligent/cc-protocol/transport/ws-client";

export type { ClientState, ClaudeClientOptions };

export interface ReactiveClientOptions extends ClaudeClientOptions {
  url: string;
  reconnect?: ExpBackoff;
  protocols?: string | string[];
}

export interface ReactiveClient {
  client: ClaudeClient;
  /** Live snapshot atom; updates on every state mutation. */
  state: ReadableAtom<ClientState>;
  /** Convenience derived atoms — read-only mirrors of common fields. */
  sessionId: ReadableAtom<string | null>;
  sessionState: ReadableAtom<ClientState["sessionState"]>;
  messages: ReadableAtom<unknown[]>;
  tasks: ReadableAtom<ClientState["tasks"]>;
  pendingPermissions: ReadableAtom<ClientState["pendingPermissionRequests"]>;
  /** Tear down the underlying transport + client. */
  dispose: () => Promise<void>;
}

export function createReactiveClient(opts: ReactiveClientOptions): ReactiveClient {
  const transport = wsClientTransport(opts.url, {
    reconnect: opts.reconnect,
    protocols: opts.protocols,
  });
  const client = new ClaudeClient(transport, {
    onPermissionRequest: opts.onPermissionRequest,
    requestTimeoutMs: opts.requestTimeoutMs,
  });

  const state = atom<ClientState>(client.getSnapshot());
  client.onStateChange((snap) => state.set(snap));

  // Derived atoms — simple subscribers that re-set on every change. This
  // is intentionally not memoized: state mutations are infrequent at the
  // human-interaction rate, and atom.set() is cheap.
  const sessionId = atom<string | null>(state.get().sessionId);
  const sessionState = atom<ClientState["sessionState"]>(state.get().sessionState);
  const messages = atom<unknown[]>(state.get().messages);
  const tasks = atom<ClientState["tasks"]>(state.get().tasks);
  const pendingPermissions = atom<ClientState["pendingPermissionRequests"]>(
    state.get().pendingPermissionRequests,
  );
  state.subscribe((s) => {
    sessionId.set(s.sessionId);
    sessionState.set(s.sessionState);
    messages.set(s.messages);
    tasks.set(s.tasks);
    pendingPermissions.set(s.pendingPermissionRequests);
  });

  return {
    client,
    state,
    sessionId,
    sessionState,
    messages,
    tasks,
    pendingPermissions,
    async dispose() {
      await client.dispose();
      await transport.close();
    },
  };
}
