// Test harness: in-memory fake WsClient + helpers for spinning up CcSession
// instances without a real WebSocket / DOM / fetch. Tests inject the fake
// via the `wsClient` option (added in session.ts).

import { atom, type WritableAtom } from "nanostores";
import { createCcSession, type CcSession, type CcSessionOptions, type StorageLike } from "../src/session";
import type { InboundFrame, OutboundFrame } from "../src/protocol";
import type { WsClient, WsStatus } from "../src/ws";

export type FakeWsClient = WsClient & {
  // Public read-only window into everything send() has been called with,
  // in order. Tests assert against this.
  sentFrames: OutboundFrame[];
  // Push a fake inbound frame; fans out to every registered onFrame handler.
  pushFrame: (frame: InboundFrame) => void;
  // Number of currently subscribed handlers (sanity for unsub tests).
  handlerCount: () => number;
};

export function createFakeWsClient(): FakeWsClient {
  const status: WritableAtom<WsStatus> = atom<WsStatus>("idle");
  const lastError: WritableAtom<string | null> = atom<string | null>(null);
  const handlers = new Set<(f: InboundFrame) => void>();
  const sentFrames: OutboundFrame[] = [];

  function connect() {
    // Defer to a microtask so callers that subscribe to status AFTER
    // calling connect() see the "open" transition (matches the real WS,
    // whose onopen fires async).
    status.set("connecting");
    queueMicrotask(() => {
      status.set("open");
    });
  }

  function disconnect() {
    status.set("closed");
  }

  function send(frame: OutboundFrame) {
    sentFrames.push(frame);
  }

  function onFrame(handler: (f: InboundFrame) => void): () => void {
    handlers.add(handler);
    return () => {
      handlers.delete(handler);
    };
  }

  function pushFrame(frame: InboundFrame) {
    for (const h of handlers) h(frame);
  }

  return {
    status,
    lastError,
    connect,
    disconnect,
    send,
    onFrame,
    sentFrames,
    pushFrame,
    handlerCount: () => handlers.size,
  };
}

export type MemoryStorage = StorageLike & {
  // Underlying map; tests can poke at it directly to seed or assert.
  store: Map<string, string>;
  // Spy counters.
  setItemCalls: Array<{ key: string; value: string }>;
  removeItemCalls: string[];
};

export function createMemoryStorage(seed?: Record<string, string>): MemoryStorage {
  const store = new Map<string, string>();
  if (seed) for (const [k, v] of Object.entries(seed)) store.set(k, v);
  const setItemCalls: Array<{ key: string; value: string }> = [];
  const removeItemCalls: string[] = [];
  return {
    store,
    setItemCalls,
    removeItemCalls,
    getItem: (key) => (store.has(key) ? store.get(key)! : null),
    setItem: (key, value) => {
      store.set(key, value);
      setItemCalls.push({ key, value });
    },
    removeItem: (key) => {
      store.delete(key);
      removeItemCalls.push(key);
    },
  };
}

// Yield to microtasks so atom subscribers + control_request promise
// resolutions settle. Two awaits because some chains (controls.request →
// catch → setTimeout(0) → setPermissionMode) span a setTimeout(0).
export async function flush() {
  await new Promise<void>((r) => setTimeout(r, 0));
  await Promise.resolve();
}

export type TestSession = {
  session: CcSession;
  ws: FakeWsClient;
  storage: MemoryStorage | null;
};

export type TestSessionOverrides = Partial<Omit<CcSessionOptions, "wsClient">> & {
  wsClient?: FakeWsClient;
  // null disables persistence (no storage at all).
  storage?: MemoryStorage | null;
};

export function createTestSession(overrides: TestSessionOverrides = {}): TestSession {
  const ws = overrides.wsClient ?? createFakeWsClient();
  // Resolve storage: explicit null = pass `persistence: false`; explicit
  // override = use it; default = create a fresh memory storage.
  let storage: MemoryStorage | null;
  let persistence: CcSessionOptions["persistence"];
  if (overrides.persistence === false) {
    storage = null;
    persistence = false;
  } else if (overrides.storage === null) {
    storage = null;
    persistence = false;
  } else if (overrides.storage) {
    storage = overrides.storage;
    persistence = { ...(typeof overrides.persistence === "object" ? overrides.persistence : {}), storage };
  } else if (typeof overrides.persistence === "object" && overrides.persistence?.storage) {
    storage = overrides.persistence.storage as MemoryStorage;
    persistence = overrides.persistence;
  } else {
    storage = createMemoryStorage();
    persistence = { ...(typeof overrides.persistence === "object" ? overrides.persistence : {}), storage };
  }

  const session = createCcSession({
    url: overrides.url ?? "ws://test/",
    args: overrides.args,
    onCanUseTool: overrides.onCanUseTool,
    onTrace: overrides.onTrace,
    persistence,
    wsClient: ws,
  });

  return { session, ws, storage };
}
