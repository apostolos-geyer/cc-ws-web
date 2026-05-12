/**
 * The headline test — `ClaudeClient` ↔ `ClaudeProcess` over `inMemoryPair`.
 *
 * No binary, no network, no WS. The two principals share the same in-memory
 * channel: `client` lives on transport A, `proc` on transport B.
 *
 * In production, `proc` sits between a `ClaudeClient` (over WS) and a real
 * binary (over `spawnTransport`); the server bridges the two. For this
 * universal test, we don't bridge — instead, the test acts as the "fake
 * binary" feeding frames into `proc`'s side of the pair, and assertions
 * confirm both principals end up in the expected state.
 *
 * Three flavors:
 *   1. Round-trip: client.setModel("opus") + a fake ack — confirms intent
 *      methods and the correlator work over a live transport.
 *   2. Process validation: discriminator-mode `proc` sees the client's
 *      control_request frames on its side of the pair; metrics confirm
 *      no rejections.
 *   3. FrameDriver replay: pre-recorded frames pushed through `b.send`
 *      arrive at `client` and drive state updates.
 */

import { describe, test, expect } from "bun:test";
import { inMemoryPair } from "../src/transport/in-memory-pair";
import { ClaudeClient } from "../src/client";
import { ClaudeProcess } from "../src/process";

async function tick() {
  await new Promise((r) => setTimeout(r, 0));
}

describe("inMemoryPair: ClaudeClient ↔ ClaudeProcess", () => {
  test("client.setPermissionMode round-trips through the in-memory pair", async () => {
    const [a, b] = inMemoryPair();
    const client = new ClaudeClient(a);
    const seenOnBinarySide: unknown[] = [];

    // Fake "binary" side: every control_request gets an ack.
    b.onFrame((frame) => {
      seenOnBinarySide.push(frame);
      if (
        frame &&
        typeof frame === "object" &&
        (frame as { type?: string }).type === "control_request"
      ) {
        const rid = (frame as { request_id?: string }).request_id;
        void b.send({
          type: "control_response",
          response: { subtype: "success", request_id: rid },
        });
      }
    });

    await client.setPermissionMode("plan");
    expect(client.getSnapshot().lastPermissionMode).toBe("plan");
    expect(seenOnBinarySide).toHaveLength(1);
  });

  test("ClaudeProcess on the other side validates outbound frames", async () => {
    const [a, b] = inMemoryPair();
    const client = new ClaudeClient(a);
    const proc = new ClaudeProcess(b, { validation: "discriminator" });

    // Acks for every control_request — same fake-binary pattern.
    b.onFrame((frame) => {
      if (
        frame &&
        typeof frame === "object" &&
        (frame as { type?: string }).type === "control_request"
      ) {
        const rid = (frame as { request_id?: string }).request_id;
        void b.send({
          type: "control_response",
          response: { subtype: "success", request_id: rid },
        });
      }
    });

    await client.setModel("opus");
    expect(client.getSnapshot().lastModel).toBe("opus");
    // proc saw the inbound control_request on its side; validation passed.
    expect(proc.snapshotMetrics().framesRejected).toBe(0);
    expect(proc.snapshotMetrics().framesPassed).toBeGreaterThan(0);
  });

  test("FrameDriver: a binary-side feed propagates state into ClaudeClient", async () => {
    const [a, b] = inMemoryPair();
    const client = new ClaudeClient(a);

    // Pre-recorded "binary" frames — sample of what a real session emits.
    const fakeBinaryFrames = [
      {
        type: "control_response",
        response: { subtype: "success", request_id: "req-1", response: { commands: [] } },
      },
      { type: "system", subtype: "init", session_id: "sess-e2e" },
      { type: "assistant", message: { role: "assistant", content: "ok" } },
    ];
    for (const f of fakeBinaryFrames) {
      await b.send(f);
    }
    await tick();
    const snap = client.getSnapshot();
    expect(snap.sessionId).toBe("sess-e2e");
    expect(snap.messages).toHaveLength(1);
  });
});
