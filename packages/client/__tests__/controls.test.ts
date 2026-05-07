import { describe, test, expect, beforeEach } from "bun:test";
import { createTestSession, createFakeWsClient, flush, type TestSession } from "./helpers";
import { createControlsClient } from "../src/controls";

let h: TestSession;

beforeEach(() => {
  h = createTestSession();
  h.session.connect();
});

describe("controls.request — direct unit tests", () => {
  test("generates a unique id, sends control_request, returns Promise", async () => {
    const ws = createFakeWsClient();
    ws.connect();
    const controls = createControlsClient(ws);
    // controls layer is normally wired by session.ts; in unit-mode we wire
    // it ourselves so pushFrame routes to ingest().
    ws.onFrame((f) => { controls.ingest(f); });

    const p = controls.request({ subtype: "interrupt" });
    expect(p).toBeInstanceOf(Promise);
    expect(ws.sentFrames.length).toBe(1);
    const sent = ws.sentFrames[0] as any;
    expect(sent.type).toBe("control_request");
    expect(typeof sent.request_id).toBe("string");
    expect(sent.request).toEqual({ subtype: "interrupt" });

    // Resolve so we don't leak a pending promise / timer
    ws.pushFrame({
      type: "control_response",
      response: { subtype: "success", request_id: sent.request_id, response: { ok: true } },
    } as any);
    const result = await p;
    expect(result.inner).toEqual({ ok: true });
  });

  test("matching success response resolves with { inner, wrapper }", async () => {
    const ws = createFakeWsClient();
    ws.connect();
    const controls = createControlsClient(ws);
    // controls layer is normally wired by session.ts; in unit-mode we wire
    // it ourselves so pushFrame routes to ingest().
    ws.onFrame((f) => { controls.ingest(f); });

    const p = controls.request({ subtype: "get_settings" });
    const reqId = (ws.sentFrames[0] as any).request_id;
    ws.pushFrame({
      type: "control_response",
      response: {
        subtype: "success",
        request_id: reqId,
        response: { effortLevel: "high" },
      },
    } as any);
    const { inner, wrapper } = await p;
    expect(inner).toEqual({ effortLevel: "high" });
    expect(wrapper).toMatchObject({ subtype: "success", request_id: reqId });
  });

  test("error response rejects with the error string", async () => {
    const ws = createFakeWsClient();
    ws.connect();
    const controls = createControlsClient(ws);
    // controls layer is normally wired by session.ts; in unit-mode we wire
    // it ourselves so pushFrame routes to ingest().
    ws.onFrame((f) => { controls.ingest(f); });

    const p = controls.request({ subtype: "interrupt" });
    const reqId = (ws.sentFrames[0] as any).request_id;
    ws.pushFrame({
      type: "control_response",
      response: { subtype: "error", request_id: reqId, error: "no active turn" },
    } as any);
    await expect(p).rejects.toBe("no active turn");
  });

  test("timeout fires after timeoutMs, rejects with timeout message", async () => {
    const ws = createFakeWsClient();
    ws.connect();
    const controls = createControlsClient(ws);
    // controls layer is normally wired by session.ts; in unit-mode we wire
    // it ourselves so pushFrame routes to ingest().
    ws.onFrame((f) => { controls.ingest(f); });

    const p = controls.request({ subtype: "interrupt" }, { timeoutMs: 5 });
    await expect(p).rejects.toMatch(/timed out after 5ms/);
  });

  test("request_id at outer envelope correlates", async () => {
    const ws = createFakeWsClient();
    ws.connect();
    const controls = createControlsClient(ws);
    // controls layer is normally wired by session.ts; in unit-mode we wire
    // it ourselves so pushFrame routes to ingest().
    ws.onFrame((f) => { controls.ingest(f); });

    const p = controls.request({ subtype: "interrupt" });
    const reqId = (ws.sentFrames[0] as any).request_id;
    ws.pushFrame({
      type: "control_response",
      // outer envelope carries request_id; inner does not
      request_id: reqId,
      response: { subtype: "success", response: { ok: true } },
    } as any);
    const result = await p;
    expect(result.inner).toEqual({ ok: true });
  });

  test("request_id at inner response also correlates", async () => {
    const ws = createFakeWsClient();
    ws.connect();
    const controls = createControlsClient(ws);
    // controls layer is normally wired by session.ts; in unit-mode we wire
    // it ourselves so pushFrame routes to ingest().
    ws.onFrame((f) => { controls.ingest(f); });

    const p = controls.request({ subtype: "interrupt" });
    const reqId = (ws.sentFrames[0] as any).request_id;
    ws.pushFrame({
      type: "control_response",
      response: { subtype: "success", request_id: reqId, response: { ok: true } },
    } as any);
    const result = await p;
    expect(result.inner).toEqual({ ok: true });
  });

  test("abortAll(reason) rejects every in-flight request and clears the map", async () => {
    const ws = createFakeWsClient();
    ws.connect();
    const controls = createControlsClient(ws);
    // controls layer is normally wired by session.ts; in unit-mode we wire
    // it ourselves so pushFrame routes to ingest().
    ws.onFrame((f) => { controls.ingest(f); });

    const p1 = controls.request({ subtype: "interrupt" });
    const p2 = controls.request({ subtype: "get_settings" });
    const reqId1 = (ws.sentFrames[0] as any).request_id;
    const reqId2 = (ws.sentFrames[1] as any).request_id;

    controls.abortAll("respawn");

    await expect(p1).rejects.toBe("respawn");
    await expect(p2).rejects.toBe("respawn");

    // Subsequent matching responses should be no-ops (map was cleared).
    // ingest returns false because the id isn't in flight.
    const handled1 = controls.ingest({
      type: "control_response",
      response: { subtype: "success", request_id: reqId1, response: {} },
    } as any);
    const handled2 = controls.ingest({
      type: "control_response",
      response: { subtype: "success", request_id: reqId2, response: {} },
    } as any);
    expect(handled1).toBe(false);
    expect(handled2).toBe(false);
  });
});

describe("session-level setPermissionMode", () => {
  test("flips activeMode on success; pendingMode set then cleared", async () => {
    const session = h.session;
    expect(session.atoms.activeMode.get()).toBe("default");

    const p = session.setPermissionMode("plan");
    // Pending should be set immediately
    expect(session.atoms.pendingMode.get()).toBe("plan");

    // Find the set_permission_mode request
    const sent = h.ws.sentFrames.find(
      (f) => (f as any).type === "control_request" && (f as any).request?.subtype === "set_permission_mode",
    ) as any;
    expect(sent).toBeDefined();

    h.ws.pushFrame({
      type: "control_response",
      response: { subtype: "success", request_id: sent.request_id, response: {} },
    } as any);

    await p;
    expect(session.atoms.activeMode.get()).toBe("plan");
    expect(session.atoms.pendingMode.get()).toBeNull();
    expect(session.atoms.modeError.get()).toBeNull();
  });

  test("leaves activeMode on error; sets modeError; pendingMode cleared", async () => {
    const session = h.session;
    // dontAsk is NOT in CYCLE_ORDER — error path bypasses auto-skip.
    const p = session.setPermissionMode("dontAsk");
    expect(session.atoms.pendingMode.get()).toBe("dontAsk");

    const sent = h.ws.sentFrames.find(
      (f) => (f as any).type === "control_request" && (f as any).request?.subtype === "set_permission_mode",
    ) as any;
    h.ws.pushFrame({
      type: "control_response",
      response: { subtype: "error", request_id: sent.request_id, error: "mode forbidden" },
    } as any);
    await p;
    expect(session.atoms.activeMode.get()).toBe("default");
    expect(session.atoms.pendingMode.get()).toBeNull();
    expect(session.atoms.modeError.get()).toMatch(/mode forbidden/);
  });

  test("auto-skip on cycle: failed bypassPermissions skips to auto", async () => {
    const session = h.session;
    const p = session.setPermissionMode("bypassPermissions");
    const firstSent = h.ws.sentFrames.find(
      (f) => (f as any).type === "control_request" && (f as any).request?.subtype === "set_permission_mode",
    ) as any;
    expect(firstSent.request.mode).toBe("bypassPermissions");
    h.ws.pushFrame({
      type: "control_response",
      response: { subtype: "error", request_id: firstSent.request_id, error: "forbidden" },
    } as any);
    await p;
    // After failure, a setTimeout(0) re-fires setPermissionMode("auto").
    await flush();
    await flush();

    const allModeSets = h.ws.sentFrames.filter(
      (f) => (f as any).type === "control_request" && (f as any).request?.subtype === "set_permission_mode",
    ) as any[];
    expect(allModeSets.length).toBeGreaterThanOrEqual(2);
    expect(allModeSets[1].request.mode).toBe("auto");

    // Resolve the auto attempt successfully
    h.ws.pushFrame({
      type: "control_response",
      response: { subtype: "success", request_id: allModeSets[1].request_id, response: {} },
    } as any);
    await flush();
    expect(session.atoms.activeMode.get()).toBe("auto");
  });
});
