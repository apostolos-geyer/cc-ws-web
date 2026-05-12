/**
 * Universal JSONL framing helpers.
 *
 * Both `stdioTransport` (runtime) and `wsServerTransport` (runtime) need
 * to parse line-delimited JSON off a byte stream. These helpers are
 * universal (no runtime-specific Buffer / stream APIs) and live in
 * `@cc-protocol` so the runtime adapters can re-use them.
 */

/**
 * Stateful line splitter — feed bytes (as decoded text) chunk by chunk;
 * yields complete lines as they become available.
 *
 * Usage:
 *   const lp = new LineParser();
 *   for (const line of lp.push(chunk)) { ... }
 */
export class LineParser {
  private buf = "";

  *push(chunk: string): Generator<string, void, undefined> {
    this.buf += chunk;
    let nl: number;
    while ((nl = this.buf.indexOf("\n")) >= 0) {
      const line = this.buf.slice(0, nl);
      this.buf = this.buf.slice(nl + 1);
      if (line.length > 0) yield line;
    }
  }

  /** Flush any partial trailing line. Use on stream close. */
  flush(): string | null {
    if (this.buf.length === 0) return null;
    const out = this.buf;
    this.buf = "";
    return out;
  }
}

/** Serialize a frame to a single newline-terminated JSONL line. */
export function frameToLine(frame: unknown): string {
  return JSON.stringify(frame) + "\n";
}

/**
 * Parse a JSONL line into an object. Returns `null` on parse failure so
 * the caller can decide whether to log + drop or surface to a handler.
 */
export function parseLine(line: string): unknown | null {
  try {
    return JSON.parse(line);
  } catch {
    return null;
  }
}
