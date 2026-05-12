/**
 * `stdioTransport` round-trip tests via a fake stdin writer + a synthesized
 * `ReadableStream` on stdout. No child process needed.
 */

import { describe, test, expect } from "bun:test";
import { stdioTransport, type StdioWriter } from "../src/transport/stdio";

function makeStdoutWith(lines: string[]): ReadableStream<Uint8Array> {
  // Each line includes its trailing newline.
  const encoder = new TextEncoder();
  let idx = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (idx >= lines.length) {
        controller.close();
        return;
      }
      controller.enqueue(encoder.encode(lines[idx]));
      idx += 1;
    },
  });
}

class FakeStdin implements StdioWriter {
  written: string[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  write(chunk: any): number {
    const text =
      typeof chunk === "string"
        ? chunk
        : new TextDecoder().decode(chunk as Uint8Array);
    this.written.push(text);
    return text.length;
  }
  end() {
    /* no-op */
  }
}

describe("stdioTransport round-trip", () => {
  test("parses JSONL lines from stdout into onFrame", async () => {
    const stdout = makeStdoutWith([
      JSON.stringify({ frame: 1 }) + "\n",
      JSON.stringify({ frame: 2 }) + "\n",
    ]);
    const stdin = new FakeStdin();
    const t = stdioTransport({ stdin, stdout });
    const seen: unknown[] = [];
    t.onFrame((f) => seen.push(f));
    // Give the pump a chance to drain.
    await new Promise((r) => setTimeout(r, 20));
    expect(seen).toEqual([{ frame: 1 }, { frame: 2 }]);
  });

  test("send serializes the frame as JSONL on stdin", async () => {
    const stdout = makeStdoutWith([]);
    const stdin = new FakeStdin();
    const t = stdioTransport({ stdin, stdout });
    await t.send({ outgoing: true });
    expect(stdin.written.join("")).toBe(JSON.stringify({ outgoing: true }) + "\n");
  });

  test("ignores non-JSON lines (passes via onRawLine)", async () => {
    const raws: string[] = [];
    const stdout = makeStdoutWith(["not json\n", JSON.stringify({ a: 1 }) + "\n"]);
    const stdin = new FakeStdin();
    const t = stdioTransport({ stdin, stdout, onRawLine: (l) => raws.push(l) });
    const seen: unknown[] = [];
    t.onFrame((f) => seen.push(f));
    await new Promise((r) => setTimeout(r, 20));
    expect(seen).toEqual([{ a: 1 }]);
    expect(raws).toEqual(["not json"]);
  });

  test("close prevents further send and ends stdin", async () => {
    const stdout = makeStdoutWith([]);
    const stdin = new FakeStdin();
    const t = stdioTransport({ stdin, stdout });
    await t.close();
    expect(t.closed).toBe(true);
    await expect(t.send({})).rejects.toThrow(/send after close/);
  });
});
