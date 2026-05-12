// The permissions aggregator lives in `@cc-protocol/client/permissions`
// and is exercised by `packages/protocol/__tests__/state-aggregation.test.ts`.
// These tests cover the cc-ws-client session-level wrapping: end-to-end
// onCanUseTool delivery + the UI queue path via `respondToPermission`.

import { describe, test, expect } from "bun:test";
import { createTestSession, flush } from "./helpers";

function canUseToolFrame(id: string, toolName: string, input: any) {
  return {
    type: "control_request",
    request_id: id,
    request: { subtype: "can_use_tool", tool_name: toolName, input },
  };
}

describe("session: onCanUseTool callback", () => {
  test("delivers PendingPermission to callback and replies with verdict", async () => {
    const decisions: any[] = [];
    const h = createTestSession({
      onCanUseTool: async (req) => {
        decisions.push(req);
        return { behavior: "allow", updatedInput: { merged: true } };
      },
    });
    h.session.connect();
    await flush();
    h.ws.pushFrame(canUseToolFrame("rq1", "Bash", { cmd: "ls" }) as any);
    await flush();
    await flush();

    expect(decisions).toHaveLength(1);
    expect(decisions[0]).toMatchObject({ id: "rq1", toolName: "Bash", input: { cmd: "ls" } });

    const reply = h.ws.sentFrames.find((f) => (f as any).type === "control_response") as any;
    expect(reply).toBeDefined();
    expect(reply.response).toMatchObject({
      subtype: "success",
      request_id: "rq1",
      response: { behavior: "allow", updatedInput: { merged: true } },
    });
    // UI queue stays empty because the callback short-circuited it.
    expect(h.session.atoms.pendingPermissions.get()).toEqual([]);
  });

  test("deny verdict propagates with message", async () => {
    const h = createTestSession({
      onCanUseTool: () => ({ behavior: "deny", message: "no thanks" }),
    });
    h.session.connect();
    h.ws.pushFrame(canUseToolFrame("rq1", "Bash", { cmd: "rm -rf" }) as any);
    await flush();
    await flush();

    const reply = h.ws.sentFrames.find((f) => (f as any).type === "control_response") as any;
    expect(reply.response.response).toEqual({ behavior: "deny", message: "no thanks" });
  });
});

describe("session: UI queue path (no onCanUseTool)", () => {
  test("populates atoms.pendingPermissions; respondToPermission drains and replies", async () => {
    const h = createTestSession();
    h.session.connect();
    await flush();
    h.ws.pushFrame(canUseToolFrame("rq1", "Bash", { cmd: "ls" }) as any);
    await flush();

    const queue = h.session.atoms.pendingPermissions.get();
    expect(queue).toHaveLength(1);
    expect(queue[0]).toMatchObject({ id: "rq1", toolName: "Bash", input: { cmd: "ls" } });

    h.session.respondToPermission("rq1", { behavior: "allow" });
    await flush();

    expect(h.session.atoms.pendingPermissions.get()).toEqual([]);
    const reply = h.ws.sentFrames.find((f) => (f as any).type === "control_response") as any;
    expect(reply.response.response).toMatchObject({
      behavior: "allow",
      updatedInput: { cmd: "ls" },
    });
  });

  test("respondToPermission with unknown id is a no-op", async () => {
    const h = createTestSession();
    h.session.connect();
    h.session.respondToPermission("nope", { behavior: "allow" });
    await flush();
    const responses = h.ws.sentFrames.filter((f) => (f as any).type === "control_response");
    expect(responses).toHaveLength(0);
  });
});
