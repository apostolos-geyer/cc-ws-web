/**
 * `ClaudeProcess` driven via `bufferTransport`. No binary, no network.
 *
 * Validates:
 *   - `start()` sends `initialize`, transitions to `ready` after success ack.
 *   - `end()` sends `end_session`, transitions to `ended` after success ack.
 *   - Validation tiers behave as documented:
 *       off          → never rejects
 *       discriminator→ rejects unknown literals, accepts known ones
 *       strict       → rejects field-level mismatches against the schema
 *   - stream_event hot-path bypass behaves as documented.
 *   - onStateChange fires on transitions.
 *   - snapshotMetrics returns counters.
 */

import { describe, test, expect } from "bun:test";
import { bufferTransport } from "../src/transport/buffer";
import { ClaudeProcess } from "../src/process";

function ack(requestId: string) {
  return {
    type: "control_response",
    response: { subtype: "success", request_id: requestId },
  };
}

function extractRequestId(frame: unknown): string | null {
  if (!frame || typeof frame !== "object") return null;
  const f = frame as { request_id?: unknown };
  return typeof f.request_id === "string" ? f.request_id : null;
}

describe("ClaudeProcess.start / end", () => {
  test("start() sends initialize and transitions to ready on success ack", async () => {
    const h = bufferTransport();
    const proc = new ClaudeProcess(h.transport, { validation: "off" });
    const states: string[] = [];
    proc.onStateChange((s) => states.push(s));
    expect(proc.getState()).toBe("idle");

    const startPromise = proc.start();

    // Drain the outbound initialize, then synthesize the success response.
    // start() awaits the ack; we have to feed before awaiting.
    await new Promise((r) => setTimeout(r, 0));
    const outbound = h.drain();
    expect(outbound.length).toBe(1);
    const reqId = extractRequestId(outbound[0]);
    expect(reqId).not.toBeNull();
    h.feed(ack(reqId!));
    await startPromise;
    expect(proc.getState()).toBe("ready");
    expect(states).toEqual(["ready"]);
  });

  test("end() sends end_session and transitions to ended on success ack", async () => {
    const h = bufferTransport();
    const proc = new ClaudeProcess(h.transport, { validation: "off" });
    const startP = proc.start();
    await new Promise((r) => setTimeout(r, 0));
    const initFrame = h.drain()[0];
    h.feed(ack(extractRequestId(initFrame)!));
    await startP;
    expect(proc.getState()).toBe("ready");

    const endP = proc.end();
    await new Promise((r) => setTimeout(r, 0));
    const endFrame = h.drain()[0];
    expect(endFrame).toMatchObject({
      type: "control_request",
      request: { subtype: "end_session" },
    });
    h.feed(ack(extractRequestId(endFrame)!));
    await endP;
    expect(proc.getState()).toBe("ended");
  });

  test("end() before start() transitions idle → ended without sending a frame", async () => {
    const h = bufferTransport();
    const proc = new ClaudeProcess(h.transport, { validation: "off" });
    await proc.end();
    expect(proc.getState()).toBe("ended");
    expect(h.drain()).toEqual([]);
  });
});

describe("ClaudeProcess validation tiers", () => {
  test("off mode passes any frame to handlers", () => {
    const h = bufferTransport();
    const proc = new ClaudeProcess(h.transport, { validation: "off" });
    const seen: unknown[] = [];
    proc.onFrame((f) => seen.push(f));
    h.feed({ type: "totally_unknown_type" });
    expect(seen).toHaveLength(1);
  });

  test("discriminator mode rejects frames with unknown type", () => {
    const h = bufferTransport();
    const proc = new ClaudeProcess(h.transport, { validation: "discriminator" });
    const seen: unknown[] = [];
    proc.onFrame((f) => seen.push(f));
    h.feed({ type: "absolutely_no_such_type" });
    expect(seen).toEqual([]);
    expect(proc.snapshotMetrics().framesRejected).toBe(1);
  });

  test("discriminator mode accepts known type literals", () => {
    const h = bufferTransport();
    const proc = new ClaudeProcess(h.transport, { validation: "discriminator" });
    const seen: unknown[] = [];
    proc.onFrame((f) => seen.push(f));
    h.feed({ type: "control_response", response: { subtype: "success", request_id: "x" } });
    expect(seen).toHaveLength(1);
    expect(proc.snapshotMetrics().framesPassed).toBe(1);
  });

  test("strict mode rejects field-level mismatch on a known type", () => {
    const h = bufferTransport();
    const proc = new ClaudeProcess(h.transport, { validation: "strict" });
    const seen: unknown[] = [];
    proc.onFrame((f) => seen.push(f));
    // control_response shape requires a `response` field. Missing → reject.
    h.feed({ type: "control_response" });
    expect(seen).toEqual([]);
    expect(proc.snapshotMetrics().framesRejected).toBeGreaterThanOrEqual(1);
  });
});

describe("ClaudeProcess stream_event hot path", () => {
  test("default: stream_event passes envelope-only without strict field check", () => {
    const h = bufferTransport();
    const proc = new ClaudeProcess(h.transport, {
      validation: "strict",
      validateStreamEvents: false,
    });
    const seen: unknown[] = [];
    proc.onFrame((f) => seen.push(f));
    h.feed({ type: "stream_event", event: { type: "anything" } });
    expect(seen).toHaveLength(1);
  });

  test("validateStreamEvents: true → full strict check applies", () => {
    const h = bufferTransport();
    const proc = new ClaudeProcess(h.transport, {
      validation: "strict",
      validateStreamEvents: true,
    });
    const seen: unknown[] = [];
    proc.onFrame((f) => seen.push(f));
    // Bare `{ type: "stream_event" }` will most likely fail full validation
    // (missing required fields). At minimum, envelope-only would have
    // rejected when event is missing.
    h.feed({ type: "stream_event" });
    // we don't know exact shape of stream_event schema, but field-validation
    // mode should reject more aggressively than envelope-only.
    expect(proc.snapshotMetrics().framesRejected).toBeGreaterThanOrEqual(1);
    expect(seen).toEqual([]);
  });
});

describe("ClaudeProcess metrics", () => {
  test("onMetrics emits snapshots at the configured interval", async () => {
    const h = bufferTransport();
    const proc = new ClaudeProcess(h.transport, { validation: "off" });
    const snaps: unknown[] = [];
    const unsub = proc.onMetrics((snap) => snaps.push(snap), 25);
    h.feed({ type: "control_response", response: { subtype: "success", request_id: "x" } });
    await new Promise((r) => setTimeout(r, 80));
    unsub();
    expect(snaps.length).toBeGreaterThanOrEqual(1);
    const first = snaps[0] as { framesValidated: number; framesPassed: number };
    expect(first.framesValidated).toBeGreaterThanOrEqual(1);
    expect(first.framesPassed).toBeGreaterThanOrEqual(1);
  });
});
