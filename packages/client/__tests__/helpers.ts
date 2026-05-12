// Test harness: in-memory fake Transport + helpers for spinning up CcSession
// instances without a real WebSocket / DOM / fetch. Tests inject the fake
// via the `testTransport` option on createCcSession.

import { atom, type WritableAtom } from "nanostores";
import {
  createCcSession,
  type CcSession,
  type CcSessionOptions,
  type StorageLike,
  type WsStatus,
} from "../src/index";

export interface FakeTransport {
  send(frame: unknown): Promise<void>;
  onFrame(handler: (frame: unknown) => void): () => void;
  close(): Promise<void>;
  readonly closed: boolean;
  // Public read-only window into everything send() has been called with,
  // in order. Tests assert against this.
  sentFrames: unknown[];
  // Push a fake inbound frame; fans out to every registered onFrame handler.
  pushFrame(frame: unknown): void;
  // Number of currently subscribed handlers (sanity for unsub tests).
  handlerCount(): number;
  // Status atom (mirrors the test seam plumbing).
  status: WritableAtom<WsStatus>;
  lastError: WritableAtom<string | null>;
}

export function createFakeTransport(): FakeTransport {
  const status: WritableAtom<WsStatus> = atom<WsStatus>("idle");
  const lastError: WritableAtom<string | null> = atom<string | null>(null);
  const handlers = new Set<(f: unknown) => void>();
  const sentFrames: unknown[] = [];
  let closed = false;

  const t: FakeTransport = {
    sentFrames,
    status,
    lastError,
    async send(frame: unknown) {
      sentFrames.push(frame);
    },
    onFrame(handler) {
      handlers.add(handler);
      return () => {
        handlers.delete(handler);
      };
    },
    async close() {
      closed = true;
    },
    get closed() {
      return closed;
    },
    pushFrame(frame: unknown) {
      for (const h of [...handlers]) {
        try { h(frame); } catch (err) { console.error("[fake] handler", err); }
      }
    },
    handlerCount() {
      return handlers.size;
    },
  };
  return t;
}

export type MemoryStorage = StorageLike & {
  store: Map<string, string>;
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
  ws: FakeTransport;
  storage: MemoryStorage | null;
};

export type TestSessionOverrides = Partial<Omit<CcSessionOptions, "testTransport">> & {
  testTransport?: FakeTransport;
  // null disables persistence (no storage at all).
  storage?: MemoryStorage | null;
};

export function createTestSession(overrides: TestSessionOverrides = {}): TestSession {
  const ws = overrides.testTransport ?? createFakeTransport();
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
    testTransport: {
      transport: ws,
      status: ws.status,
      lastError: ws.lastError,
    },
  });

  return { session, ws, storage };
}
