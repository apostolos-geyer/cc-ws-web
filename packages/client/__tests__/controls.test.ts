// The low-level controls correlator now lives in `@cc-protocol/client`
// (RequestIdCorrelator) and is exercised by
// `packages/protocol/__tests__/client.test.ts`. These tests cover the
// cc-ws-client wrapping behaviour: setPermissionMode flipping its atom
// pair, cycle-mode auto-skip on error, etc.

import { describe, test, expect, beforeEach } from "bun:test";
import { createTestSession, flush, type TestSession } from "./helpers";

let h: TestSession;

beforeEach(() => {
  h = createTestSession();
  h.session.connect();
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
