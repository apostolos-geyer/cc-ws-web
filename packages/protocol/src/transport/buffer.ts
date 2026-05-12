/**
 * `bufferTransport()` — a pure in-memory transport for unit tests.
 *
 * Synchronous: `feed(frame)` invokes every registered `onFrame` handler
 * before returning; `transport.send(frame)` pushes onto an internal queue
 * that `drain()` reads. There is no async tickling, no microtask hop —
 * tests can script exact wire sequences and assert exact ordering.
 *
 * `closed` flips on the first call to `close()`. Further `send()` calls
 * reject; further `feed()` calls become no-ops (so a test cleanup that
 * over-fires won't throw).
 */
import type { Frame, Transport } from "./index";

export interface BufferTransportHandle {
  /** The `Transport` to hand to `ClaudeClient` / `ClaudeProcess`. */
  transport: Transport;
  /** Inject an inbound frame — synchronously invokes every onFrame handler. */
  feed(frame: Frame): void;
  /** Return all frames sent via `transport.send` since the last drain, then empty. */
  drain(): Frame[];
  /** Number of frames currently waiting in the outbound queue. */
  readonly outboundCount: number;
  /** Mirror of `transport.closed`. */
  readonly closed: boolean;
}

export function bufferTransport(): BufferTransportHandle {
  const outbound: Frame[] = [];
  const handlers = new Set<(frame: Frame) => void>();
  let closed = false;

  const transport: Transport = {
    async send(frame: Frame): Promise<void> {
      if (closed) throw new Error("bufferTransport: send after close");
      outbound.push(frame);
    },
    onFrame(handler) {
      handlers.add(handler);
      return () => {
        handlers.delete(handler);
      };
    },
    async close(): Promise<void> {
      closed = true;
      // Drop handlers so any straggling feed() calls are no-ops.
      handlers.clear();
    },
    get closed() {
      return closed;
    },
  };

  return {
    transport,
    feed(frame: Frame): void {
      if (closed) return;
      // Snapshot to avoid issues if a handler unsubscribes mid-iteration.
      for (const h of [...handlers]) h(frame);
    },
    drain(): Frame[] {
      const out = outbound.slice();
      outbound.length = 0;
      return out;
    },
    get outboundCount() {
      return outbound.length;
    },
    get closed() {
      return closed;
    },
  };
}
