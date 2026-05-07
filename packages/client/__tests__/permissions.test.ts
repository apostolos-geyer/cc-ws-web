import { describe, test, expect, beforeEach, spyOn } from "bun:test";
import { createTestSession, createFakeWsClient, flush } from "./helpers";
import { createPermissionsController } from "../src/permissions";

function canUseToolFrame(id: string, toolName: string, input: any) {
  return {
    type: "control_request",
    request_id: id,
    request: { subtype: "can_use_tool", tool_name: toolName, input },
  };
}

describe("permissions: callback path", () => {
  test("allow decision replies with success+allow+updatedInput", async () => {
    const ws = createFakeWsClient();
    ws.connect();
    const decisions: any[] = [];
    const ctrl = createPermissionsController({
      ws,
      onCanUseTool: async (req) => {
        decisions.push(req);
        return { behavior: "allow", updatedInput: { merged: true } };
      },
    });
    ctrl.ingest(canUseToolFrame("rq1", "Bash", { cmd: "ls" }) as any);
    await flush();
    await flush();

    expect(decisions).toHaveLength(1);
    expect(decisions[0]).toMatchObject({ id: "rq1", toolName: "Bash", input: { cmd: "ls" } });
    expect(ws.sentFrames).toHaveLength(1);
    expect(ws.sentFrames[0]).toMatchObject({
      type: "control_response",
      response: {
        subtype: "success",
        request_id: "rq1",
        response: { behavior: "allow", updatedInput: { merged: true } },
      },
    });
    expect(ctrl.pendingPermissions.get()).toEqual([]);
  });

  test("allow without updatedInput falls back to original input", async () => {
    const ws = createFakeWsClient();
    ws.connect();
    const ctrl = createPermissionsController({
      ws,
      onCanUseTool: () => ({ behavior: "allow" }),
    });
    ctrl.ingest(canUseToolFrame("rq2", "Bash", { cmd: "ls" }) as any);
    await flush();

    expect((ws.sentFrames[0] as any).response.response).toEqual({
      behavior: "allow",
      updatedInput: { cmd: "ls" },
    });
  });

  test("deny decision replies with success+deny+message", async () => {
    const ws = createFakeWsClient();
    ws.connect();
    const ctrl = createPermissionsController({
      ws,
      onCanUseTool: async () => ({ behavior: "deny", message: "no thanks" }),
    });
    ctrl.ingest(canUseToolFrame("rq1", "Bash", { cmd: "rm -rf" }) as any);
    await flush();

    expect(ws.sentFrames[0]).toMatchObject({
      type: "control_response",
      response: {
        subtype: "success",
        request_id: "rq1",
        response: { behavior: "deny", message: "no thanks" },
      },
    });
  });

  test("deny without message falls back to default", async () => {
    const ws = createFakeWsClient();
    ws.connect();
    const ctrl = createPermissionsController({
      ws,
      onCanUseTool: async () => ({ behavior: "deny" }),
    });
    ctrl.ingest(canUseToolFrame("rq1", "Bash", {}) as any);
    await flush();

    expect((ws.sentFrames[0] as any).response.response).toEqual({
      behavior: "deny",
      message: "Denied by user",
    });
  });

  test("callback throws → falls back to deny with 'handler error'", async () => {
    const errSpy = spyOn(console, "error").mockImplementation(() => {});
    const ws = createFakeWsClient();
    ws.connect();
    const ctrl = createPermissionsController({
      ws,
      onCanUseTool: async () => {
        throw new Error("boom");
      },
    });
    ctrl.ingest(canUseToolFrame("rq1", "Bash", {}) as any);
    await flush();
    await flush();

    expect(ws.sentFrames[0]).toMatchObject({
      type: "control_response",
      response: {
        subtype: "success",
        request_id: "rq1",
        response: { behavior: "deny", message: "handler error" },
      },
    });
    errSpy.mockRestore();
  });
});

describe("permissions: queue path (no callback)", () => {
  test("populates pendingPermissions atom; respond() drains and replies", async () => {
    const ws = createFakeWsClient();
    ws.connect();
    const ctrl = createPermissionsController({ ws });

    ctrl.ingest(canUseToolFrame("rq1", "Bash", { cmd: "ls" }) as any);
    expect(ctrl.pendingPermissions.get()).toHaveLength(1);
    expect(ctrl.pendingPermissions.get()[0]).toMatchObject({
      id: "rq1",
      toolName: "Bash",
      input: { cmd: "ls" },
    });
    expect(ws.sentFrames).toHaveLength(0);

    ctrl.respond("rq1", { behavior: "allow" });
    expect(ctrl.pendingPermissions.get()).toEqual([]);
    expect(ws.sentFrames).toHaveLength(1);
    expect((ws.sentFrames[0] as any).response.response).toMatchObject({
      behavior: "allow",
      updatedInput: { cmd: "ls" },
    });
  });

  test("respond() with unknown id is a no-op", () => {
    const ws = createFakeWsClient();
    ws.connect();
    const ctrl = createPermissionsController({ ws });
    ctrl.respond("nope", { behavior: "allow" });
    expect(ws.sentFrames).toHaveLength(0);
  });

  test("clearQueue() empties without replying (regression: stale queue on respawn)", () => {
    const ws = createFakeWsClient();
    ws.connect();
    const ctrl = createPermissionsController({ ws });

    ctrl.ingest(canUseToolFrame("rq1", "Bash", {}) as any);
    ctrl.ingest(canUseToolFrame("rq2", "Edit", {}) as any);
    expect(ctrl.pendingPermissions.get()).toHaveLength(2);

    ctrl.clearQueue();
    expect(ctrl.pendingPermissions.get()).toEqual([]);
    expect(ws.sentFrames).toHaveLength(0);
  });
});

describe("permissions: ingest filtering", () => {
  test("non-can_use_tool control_requests are not handled", () => {
    const ws = createFakeWsClient();
    ws.connect();
    const ctrl = createPermissionsController({ ws });
    const handled = ctrl.ingest({
      type: "control_request",
      request_id: "x",
      request: { subtype: "other" },
    } as any);
    expect(handled).toBe(false);
    expect(ctrl.pendingPermissions.get()).toEqual([]);
  });

  test("non-control_request frames are not handled", () => {
    const ws = createFakeWsClient();
    ws.connect();
    const ctrl = createPermissionsController({ ws });
    const handled = ctrl.ingest({ type: "user", message: { role: "user", content: "hi" } } as any);
    expect(handled).toBe(false);
  });
});

describe("permissions: end-to-end via session", () => {
  test("session with onCanUseTool callback delivers and replies", async () => {
    const decisions: any[] = [];
    const h = createTestSession({
      onCanUseTool: async (req) => {
        decisions.push(req);
        return { behavior: "allow" };
      },
    });
    h.session.connect();
    h.ws.pushFrame(canUseToolFrame("rq1", "Bash", { cmd: "ls" }) as any);
    await flush();

    const reply = h.ws.sentFrames.find((f) => (f as any).type === "control_response");
    expect(reply).toBeDefined();
    expect((reply as any).response.request_id).toBe("rq1");
  });
});
