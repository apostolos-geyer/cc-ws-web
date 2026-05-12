/**
 * Contract tests for the universal transports.
 *
 * `bufferTransport`:
 *   - feed() invokes all registered onFrame handlers synchronously
 *   - drain() returns sent frames in order, then empties
 *   - close() makes subsequent send() reject; closed flag flips
 *   - unsubscribe from onFrame works
 *
 * `inMemoryPair`:
 *   - A.send → B.onFrame, B.send → A.onFrame
 *   - close on either side propagates
 *   - multiple onFrame handlers all receive each frame
 */

import { describe, test, expect } from "bun:test";
import { bufferTransport } from "../src/transport/buffer";
import { inMemoryPair } from "../src/transport/in-memory-pair";

describe("bufferTransport", () => {
  test("feed delivers synchronously to all handlers", () => {
    const h = bufferTransport();
    const received: unknown[][] = [[], []];
    h.transport.onFrame((f) => received[0].push(f));
    h.transport.onFrame((f) => received[1].push(f));
    h.feed({ ping: 1 });
    h.feed({ ping: 2 });
    expect(received[0]).toEqual([{ ping: 1 }, { ping: 2 }]);
    expect(received[1]).toEqual([{ ping: 1 }, { ping: 2 }]);
  });

  test("drain returns sent frames in order, then empties", async () => {
    const h = bufferTransport();
    await h.transport.send({ a: 1 });
    await h.transport.send({ a: 2 });
    expect(h.outboundCount).toBe(2);
    const out = h.drain();
    expect(out).toEqual([{ a: 1 }, { a: 2 }]);
    expect(h.outboundCount).toBe(0);
    expect(h.drain()).toEqual([]);
  });

  test("close flips closed flag and makes send reject", async () => {
    const h = bufferTransport();
    expect(h.closed).toBe(false);
    await h.transport.close();
    expect(h.closed).toBe(true);
    expect(h.transport.closed).toBe(true);
    await expect(h.transport.send({})).rejects.toThrow(/send after close/);
  });

  test("feed after close is a no-op", () => {
    const h = bufferTransport();
    const received: unknown[] = [];
    h.transport.onFrame((f) => received.push(f));
    h.transport.close();
    h.feed({ won: "t arrive" });
    expect(received).toEqual([]);
  });

  test("unsubscribe from onFrame works", () => {
    const h = bufferTransport();
    const received: unknown[] = [];
    const unsub = h.transport.onFrame((f) => received.push(f));
    h.feed({ first: 1 });
    unsub();
    h.feed({ second: 2 });
    expect(received).toEqual([{ first: 1 }]);
  });
});

describe("inMemoryPair", () => {
  test("A.send delivers to B.onFrame and vice versa", async () => {
    const [a, b] = inMemoryPair();
    const aRecv: unknown[] = [];
    const bRecv: unknown[] = [];
    a.onFrame((f) => aRecv.push(f));
    b.onFrame((f) => bRecv.push(f));
    await a.send({ from: "a" });
    await b.send({ from: "b" });
    expect(bRecv).toEqual([{ from: "a" }]);
    expect(aRecv).toEqual([{ from: "b" }]);
  });

  test("close on either side propagates", async () => {
    const [a, b] = inMemoryPair();
    await a.close();
    expect(a.closed).toBe(true);
    expect(b.closed).toBe(true);
    await expect(b.send({})).rejects.toThrow(/send after close/);
  });

  test("multiple onFrame handlers on the same side all receive", async () => {
    const [a, b] = inMemoryPair();
    const r1: unknown[] = [];
    const r2: unknown[] = [];
    b.onFrame((f) => r1.push(f));
    b.onFrame((f) => r2.push(f));
    await a.send({ x: 1 });
    expect(r1).toEqual([{ x: 1 }]);
    expect(r2).toEqual([{ x: 1 }]);
  });

  test("unsubscribe", async () => {
    const [a, b] = inMemoryPair();
    const r: unknown[] = [];
    const unsub = b.onFrame((f) => r.push(f));
    await a.send({ x: 1 });
    unsub();
    await a.send({ x: 2 });
    expect(r).toEqual([{ x: 1 }]);
  });
});
