/**
 * `inMemoryPair()` — two connected `Transport`s, one for each principal.
 *
 * `A.send(frame)` synchronously delivers to every `B.onFrame` handler, and
 * vice versa. Closing either side propagates: `A.close()` flips both
 * `closed` flags and rejects subsequent `send()` calls on either end.
 *
 * This is the test-only seam that lets you wire up `new ClaudeClient(a) +
 * new ClaudeProcess(b)` with zero IO. Together with the
 * scripted fixture-replay pattern, it produces the headline
 * `e2e-in-memory` test.
 */
import type { Frame, Transport } from "./index";

export function inMemoryPair(): [Transport, Transport] {
  const handlersA = new Set<(frame: Frame) => void>();
  const handlersB = new Set<(frame: Frame) => void>();
  let closed = false;

  const transportA: Transport = {
    async send(frame: Frame): Promise<void> {
      if (closed) throw new Error("inMemoryPair: send after close");
      for (const h of [...handlersB]) h(frame);
    },
    onFrame(handler) {
      handlersA.add(handler);
      return () => {
        handlersA.delete(handler);
      };
    },
    async close(): Promise<void> {
      closed = true;
      handlersA.clear();
      handlersB.clear();
    },
    get closed() {
      return closed;
    },
  };

  const transportB: Transport = {
    async send(frame: Frame): Promise<void> {
      if (closed) throw new Error("inMemoryPair: send after close");
      for (const h of [...handlersA]) h(frame);
    },
    onFrame(handler) {
      handlersB.add(handler);
      return () => {
        handlersB.delete(handler);
      };
    },
    async close(): Promise<void> {
      closed = true;
      handlersA.clear();
      handlersB.clear();
    },
    get closed() {
      return closed;
    },
  };

  return [transportA, transportB];
}
