/**
 * `wsServerTransport` round-trip via a fake `ServerWebSocket` implementing
 * the small surface we actually use.
 */

import { describe, test, expect } from "bun:test";
import { wsServerTransport } from "../src/transport/ws-server";

class FakeServerWs {
  sent: string[] = [];
  closed = false;
  data: Record<string, unknown> = {};
  send(text: string): number {
    this.sent.push(text);
    return text.length;
  }
  close(): void {
    this.closed = true;
  }
}

describe("wsServerTransport", () => {
  test("send writes a JSON-stringified frame on ws.send", async () => {
    const ws = new FakeServerWs();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const t = wsServerTransport(ws as any);
    await t.send({ a: 1 });
    expect(ws.sent).toEqual([JSON.stringify({ a: 1 })]);
  });

  test("deliver parses string messages and forwards to onFrame", () => {
    const ws = new FakeServerWs();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const t = wsServerTransport(ws as any);
    const seen: unknown[] = [];
    t.onFrame((f) => seen.push(f));
    t.deliver(JSON.stringify({ b: 2 }));
    expect(seen).toEqual([{ b: 2 }]);
  });

  test("deliver parses Uint8Array messages", () => {
    const ws = new FakeServerWs();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const t = wsServerTransport(ws as any);
    const seen: unknown[] = [];
    t.onFrame((f) => seen.push(f));
    t.deliver(new TextEncoder().encode(JSON.stringify({ c: 3 })));
    expect(seen).toEqual([{ c: 3 }]);
  });

  test("close calls ws.close and rejects subsequent send", async () => {
    const ws = new FakeServerWs();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const t = wsServerTransport(ws as any);
    await t.close();
    expect(ws.closed).toBe(true);
    await expect(t.send({})).rejects.toThrow(/send after close/);
  });

  test("shutdown flips closed without invoking ws.close", () => {
    const ws = new FakeServerWs();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const t = wsServerTransport(ws as any);
    t.shutdown();
    expect(t.closed).toBe(true);
    expect(ws.closed).toBe(false);
  });

  test("non-JSON deliveries are silently dropped", () => {
    const ws = new FakeServerWs();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const t = wsServerTransport(ws as any);
    const seen: unknown[] = [];
    t.onFrame((f) => seen.push(f));
    t.deliver("not json");
    expect(seen).toEqual([]);
  });
});
