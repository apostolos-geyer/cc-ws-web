/**
 * Opt-in: live binary E2E. Set `CC_PROTOCOL_LIVE_BINARY=1` to run.
 *
 * Drives a small subset of the integration catalog through
 * `new ClaudeProcess(spawnTransport({...}))`. CI doesn't run this; local
 * + the regen workflow do.
 *
 * The catalog is intentionally minimal — `initialize → get_settings →
 * end_session` exercises the full I/O path without any token cost. If
 * this test fails locally, run `bun codegen/integration/run-tests.ts`
 * for the richer diagnostic.
 */

import { describe, test, expect } from "bun:test";
import { existsSync } from "node:fs";
import { ClaudeProcess } from "@somewhatintelligent/cc-protocol/process";
import { ClaudeClient } from "@somewhatintelligent/cc-protocol/client";
import { spawnTransport } from "../src/transport/spawn";

const LIVE = process.env.CC_PROTOCOL_LIVE_BINARY === "1";
const BINARY = "/Users/stoli/.local/share/claude/versions/2.1.139";

describe("live binary E2E (opt-in)", () => {
  if (!LIVE) {
    test.skip("CC_PROTOCOL_LIVE_BINARY != 1 — skipping", () => {});
    return;
  }
  if (!existsSync(BINARY)) {
    test.skip(`binary not at ${BINARY}`, () => {});
    return;
  }

  test("initialize → get_settings → end_session", async () => {
    // Two-principal wiring against the real binary:
    //   client (a) ←→ stdio transport (b) ←→ real binary
    // ClaudeProcess wraps the same transport as the client? No — in
    // production, the server has one transport to the binary
    // (`spawnTransport`) and another to the consumer (`wsServerTransport`)
    // — the server bridges. For a simple e2e where consumer and server
    // are the same process, we *just* use ClaudeProcess directly against
    // the spawn transport, and skip ClaudeClient. That's the typical
    // server-side configuration anyway.
    const childT = spawnTransport({
      binary: BINARY,
      args: ["--no-session-persistence", "--permission-mode", "plan"],
    });
    const proc = new ClaudeProcess(childT, { validation: "discriminator" });
    await proc.start();
    expect(proc.getState()).toBe("ready");

    // Drive a get_settings via the client API. To do that we need a
    // peer-side client too — wire one over the same transport, just
    // listening on a different "side". But spawnTransport's other side
    // is the binary; there's no in-memory pair. The proper test for
    // "client + process over a real binary" requires the server bridge.
    //
    // For a simpler signal, just send a control_request manually via
    // proc.send() and observe the response.
    const seen: unknown[] = [];
    proc.onFrame((f) => seen.push(f));
    await proc.send({
      type: "control_request",
      request_id: "live-1",
      request: { subtype: "get_settings" },
    });
    // Give the binary a beat.
    await new Promise((r) => setTimeout(r, 1500));
    // Tear down.
    await proc.end();
    expect(proc.getState()).toBe("ended");
    expect(seen.length).toBeGreaterThan(0);
  }, 30_000);
});
