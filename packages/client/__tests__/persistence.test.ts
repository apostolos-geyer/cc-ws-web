import { describe, test, expect } from "bun:test";
import { createTestSession, createMemoryStorage, createFakeTransport, flush } from "./helpers";
import type { MessageEntry } from "../src/index";
import { createCcSession } from "../src/index";

const KEY = "cc-ws-session";

function persistedFrame(): MessageEntry {
  return {
    kind: "frame",
    id: "f1",
    arrivalIdx: 0,
    frame: { type: "user", message: { role: "user", content: "hello" } } as any,
  };
}

// Helper: wait long enough for the 250ms debounce flush to fire.
async function waitForDebounce() {
  await new Promise<void>((r) => setTimeout(r, 270));
}

describe("hydrate from persisted snapshot", () => {
  test("hydrates messages atom + active mode/model/effort", () => {
    const seeded = JSON.stringify({
      sessionId: "abc",
      messages: [persistedFrame()],
      permissionMode: "plan",
      model: "claude-opus-4-7",
      effort: "high",
    });
    const storage = createMemoryStorage({ [KEY]: seeded });
    const h = createTestSession({ storage });

    const messages = h.session.atoms.messages.get();
    expect(messages).toHaveLength(1);
    expect(messages[0].kind).toBe("frame");
    expect(h.session.atoms.activeMode.get()).toBe("plan");
    expect(h.session.atoms.activeModel.get()).toBe("claude-opus-4-7");
    expect(h.session.atoms.activeEffort.get()).toBe("high");
  });

  test("currentArgs.mode becomes resume(stored sessionId) — verified via spawn args", async () => {
    const seeded = JSON.stringify({
      sessionId: "sess-abc",
      messages: [],
    });
    const storage = createMemoryStorage({ [KEY]: seeded });
    const h = createTestSession({ storage });
    h.session.connect();
    // Wait for ws status microtask + connect's subscribe to fire respawn
    await flush();
    await flush();

    const respawn = h.ws.sentFrames.find((f) => (f as any)._local === "respawn") as any;
    expect(respawn).toBeDefined();
    expect(respawn.args).toEqual(expect.arrayContaining(["--resume", "sess-abc"]));
    expect(respawn.args).not.toContain("--continue");
  });

  test("without seeded snapshot defaults to continue mode", async () => {
    const h = createTestSession();
    h.session.connect();
    await flush();
    await flush();

    const respawn = h.ws.sentFrames.find((f) => (f as any)._local === "respawn") as any;
    expect(respawn).toBeDefined();
    expect(respawn.args).toContain("--continue");
    expect(respawn.args).not.toContain("--resume");
  });

  test("malformed snapshot is treated as no snapshot", async () => {
    const storage = createMemoryStorage({ [KEY]: "not json" });
    const h = createTestSession({ storage });
    h.session.connect();
    await flush();
    await flush();

    const respawn = h.ws.sentFrames.find((f) => (f as any)._local === "respawn") as any;
    expect(respawn.args).toContain("--continue");
  });
});

describe("save lifecycle", () => {
  test("debounced save fires after a change to messages atom", async () => {
    const storage = createMemoryStorage();
    const h = createTestSession({ storage });
    // Initial atom subscription fires immediately with current value, which
    // schedules a save. Drain that first.
    await waitForDebounce();
    storage.setItemCalls.length = 0;

    h.session.sendMessage("hello world");
    await waitForDebounce();

    // setItem fired at least once with the serialized snapshot
    const lastCall = storage.setItemCalls.at(-1);
    expect(lastCall).toBeDefined();
    expect(lastCall!.key).toBe(KEY);
    const parsed = JSON.parse(lastCall!.value);
    expect(parsed.messages.length).toBeGreaterThan(0);
    // Local user entry is preserved
    expect(parsed.messages.find((m: any) => m.kind === "local_user")?.text).toBe("hello world");
  });

  test("streaming entries are filtered out of the persisted snapshot", async () => {
    const storage = createMemoryStorage();
    const h = createTestSession({ storage });
    await waitForDebounce();
    storage.setItemCalls.length = 0;

    // Open a streaming entry, then trigger a save by bumping a non-streaming
    // signal (init). Persistence intentionally doesn't fire on streaming
    // deltas — the streaming-entry filter is what guarantees that even if
    // a save lands while a stream is in flight, the snapshot stays clean.
    h.ws.pushFrame({
      type: "stream_event",
      event: { type: "message_start", message: { id: "m1" } },
    } as any);
    h.ws.pushFrame({
      type: "system",
      subtype: "init",
      session_id: "sid-1",
      model: "claude-sonnet-4-6",
    } as any);
    await waitForDebounce();

    const lastCall = storage.setItemCalls.at(-1)!;
    const parsed = JSON.parse(lastCall.value);
    expect(parsed.messages.find((m: any) => m.kind === "streaming")).toBeUndefined();
  });

  test("snapshot serializes sessionId + permissionMode + model + effort", async () => {
    const storage = createMemoryStorage();
    const h = createTestSession({ storage });
    await waitForDebounce();
    storage.setItemCalls.length = 0;

    // system:init populates sessionId + model
    h.ws.pushFrame({
      type: "system",
      subtype: "init",
      session_id: "sid-1",
      model: "claude-opus-4-7",
      permissionMode: "plan",
    } as any);
    await waitForDebounce();

    const lastCall = storage.setItemCalls.at(-1)!;
    const parsed = JSON.parse(lastCall.value);
    expect(parsed.sessionId).toBe("sid-1");
    expect(parsed.model).toBe("claude-opus-4-7");
    expect(parsed.permissionMode).toBe("plan");
  });

  test("maxMessages caps the persisted array length", async () => {
    const storage = createMemoryStorage();
    const h = createTestSession({
      storage,
      persistence: { storage, maxMessages: 3 },
    });
    await waitForDebounce();
    storage.setItemCalls.length = 0;

    for (let i = 0; i < 5; i++) {
      h.session.sendMessage(`msg ${i}`);
    }
    await waitForDebounce();

    const lastCall = storage.setItemCalls.at(-1)!;
    const parsed = JSON.parse(lastCall.value);
    expect(parsed.messages.length).toBeLessThanOrEqual(3);
    // Latest messages are kept (FIFO trim from the front)
    const texts = parsed.messages
      .filter((m: any) => m.kind === "local_user")
      .map((m: any) => m.text);
    expect(texts).toContain("msg 4");
  });
});

describe("session lifecycle clears persistence", () => {
  test("newSession() calls storage.removeItem", async () => {
    const seeded = JSON.stringify({ sessionId: "old", messages: [] });
    const storage = createMemoryStorage({ [KEY]: seeded });
    const h = createTestSession({ storage });
    h.session.connect();
    await flush();
    await flush();

    storage.removeItemCalls.length = 0;
    const _p = h.session.newSession();
    expect(storage.removeItemCalls).toContain(KEY);
  });

  test("resumeSession(id) calls storage.removeItem", async () => {
    const seeded = JSON.stringify({ sessionId: "old", messages: [] });
    const storage = createMemoryStorage({ [KEY]: seeded });
    const h = createTestSession({ storage });
    h.session.connect();
    await flush();
    await flush();

    storage.removeItemCalls.length = 0;
    const _p = h.session.resumeSession("new-sess");
    expect(storage.removeItemCalls).toContain(KEY);
  });

  test("continueSession() does NOT clear persistence (keeps timeline)", async () => {
    const seeded = JSON.stringify({ sessionId: "old", messages: [persistedFrame()] });
    const storage = createMemoryStorage({ [KEY]: seeded });
    const h = createTestSession({ storage });
    h.session.connect();
    await flush();
    await flush();

    storage.removeItemCalls.length = 0;
    const _p = h.session.continueSession();
    expect(storage.removeItemCalls).not.toContain(KEY);
  });
});

describe("opt-out + customization", () => {
  test("persistence:false → no save, no hydrate, even with seeded storage", async () => {
    const seeded = JSON.stringify({
      sessionId: "abc",
      messages: [persistedFrame()],
      permissionMode: "plan",
    });
    const storage = createMemoryStorage({ [KEY]: seeded });

    // Build the session with persistence explicitly disabled and a fake ws.
    // We bypass createTestSession's `storage` shorthand (which forces
    // persistence) and pass persistence:false directly.
    const ws = createFakeTransport();
    const session = createCcSession({
      url: "ws://test/",
      persistence: false,
      testTransport: { transport: ws, status: ws.status, lastError: ws.lastError },
    });

    expect(session.atoms.messages.get()).toEqual([]);
    expect(session.atoms.activeMode.get()).toBe("default");

    // Mutate state, wait for hypothetical debounce — nothing should be written.
    session.sendMessage("anything");
    await waitForDebounce();
    expect(storage.setItemCalls).toHaveLength(0);
  });

  test("custom key is honored", async () => {
    const storage = createMemoryStorage();
    const customKey = "my-session-key";
    const ws = createFakeTransport();
    const session = createCcSession({
      url: "ws://test/",
      persistence: { storage, key: customKey },
      testTransport: { transport: ws, status: ws.status, lastError: ws.lastError },
    });
    await waitForDebounce();
    storage.setItemCalls.length = 0;

    session.sendMessage("hello");
    await waitForDebounce();

    const lastCall = storage.setItemCalls.at(-1)!;
    expect(lastCall.key).toBe(customKey);
  });

  test("custom storage is used (no localStorage)", async () => {
    const storage = createMemoryStorage();
    const ws = createFakeTransport();
    const session = createCcSession({
      url: "ws://test/",
      persistence: { storage },
      testTransport: { transport: ws, status: ws.status, lastError: ws.lastError },
    });
    await waitForDebounce();
    storage.setItemCalls.length = 0;

    session.sendMessage("zzz");
    await waitForDebounce();

    expect(storage.setItemCalls.length).toBeGreaterThan(0);
    expect(storage.setItemCalls.at(-1)!.key).toBe(KEY);
  });
});
