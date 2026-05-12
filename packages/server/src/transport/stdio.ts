/**
 * `stdioTransport({ stdin, stdout })` — a `Transport` over a stdin
 * writer + stdout reader pair. Used by `spawnTransport` to bind a child
 * process's stdio, and directly by tests that want to round-trip frames
 * through fake streams.
 *
 * Inbound stdout (a `ReadableStream<Uint8Array>`) is decoded as UTF-8,
 * line-buffered, parsed as JSONL, and dispatched to `onFrame` handlers.
 * Outbound frames are JSON-stringified, newline-terminated, and written
 * to `stdin` (a `StdioWriter` — see below).
 *
 * `StdioWriter` is a small shape that subsumes Bun's `FileSink` (which is
 * what `Bun.spawn({ stdin: "pipe" })` hands you) and the
 * `WritableStreamDefaultWriter` from Web Streams. It lets tests fake
 * stdin with whatever shape is most convenient.
 */

import type { Frame, Transport } from "@somewhatintelligent/cc-protocol/transport";
import { LineParser, frameToLine } from "@somewhatintelligent/cc-protocol/process";

/**
 * Minimal writable-stdin shape. Matches both Bun's `FileSink` and a
 * promoted `WritableStreamDefaultWriter<Uint8Array>` if you call
 * `.getWriter()` on the latter.
 */
// Loose by design: Bun's `FileSink.write` accepts string | ArrayBufferView |
// ArrayBuffer | SharedArrayBuffer; the W3C WritableStreamDefaultWriter is
// `write(chunk: any)`. Use `any` for the chunk so both shapes assignable.
export interface StdioWriter {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  write(chunk: any): number | Promise<number> | Promise<void> | undefined | void;
  end?(): unknown;
}

export interface StdioTransportOptions {
  stdin: StdioWriter;
  stdout: ReadableStream<Uint8Array>;
  /** Optional handler for non-JSON lines on stdout (e.g. log noise). */
  onRawLine?: (line: string) => void;
}

export function stdioTransport(opts: StdioTransportOptions): Transport {
  const handlers = new Set<(frame: Frame) => void>();
  let closed = false;

  const reader = opts.stdout.getReader();
  const decoder = new TextDecoder();
  const parser = new LineParser();

  // Background pump — reads bytes off stdout, line-parses, dispatches.
  (async () => {
    try {
      while (!closed) {
        const { value, done } = await reader.read();
        if (done) break;
        if (!value) continue;
        const chunk = decoder.decode(value, { stream: true });
        for (const line of parser.push(chunk)) {
          let parsed: unknown;
          try {
            parsed = JSON.parse(line);
          } catch {
            if (opts.onRawLine) opts.onRawLine(line);
            continue;
          }
          for (const h of [...handlers]) h(parsed);
        }
      }
    } catch {
      // pump failure — surface as transport close.
    } finally {
      closed = true;
      try {
        const trailing = parser.flush();
        if (trailing && opts.onRawLine) opts.onRawLine(trailing);
      } catch {
        // ignore
      }
    }
  })();

  return {
    async send(frame: Frame): Promise<void> {
      if (closed) throw new Error("stdioTransport: send after close");
      const line = frameToLine(frame);
      const r = opts.stdin.write(line);
      if (r && typeof (r as Promise<unknown>).then === "function") {
        await r;
      }
    },
    onFrame(handler) {
      handlers.add(handler);
      return () => {
        handlers.delete(handler);
      };
    },
    async close(): Promise<void> {
      if (closed) return;
      closed = true;
      try {
        opts.stdin.end?.();
      } catch {
        // ignore
      }
      try {
        await reader.cancel();
      } catch {
        // ignore
      }
      handlers.clear();
    },
    get closed() {
      return closed;
    },
  };
}
