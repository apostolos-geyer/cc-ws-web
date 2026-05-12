/**
 * `spawnTransport` against a `cat`-like child — a small Bun script that
 * pipes stdin to stdout. Doesn't require the claude binary.
 */

import { describe, test, expect } from "bun:test";
import { spawnTransport } from "../src/transport/spawn";

describe("spawnTransport with a cat-like child", () => {
  test("round-trips a frame through the child's stdio", async () => {
    // A tiny Bun one-liner that reads stdin and writes the same bytes back
    // line-by-line. This works because spawnTransport adds the canonical
    // claude args; the child ignores them.
    const t = spawnTransport({
      binary: process.execPath, // bun binary
      args: ["-e", "for await (const chunk of Bun.stdin.stream()) { Bun.stdout.write(chunk); }"],
      rawArgs: true,
    });
    const seen: unknown[] = [];
    t.onFrame((f) => {
      seen.push(f);
    });
    await t.send({ ping: 1 });
    await t.send({ ping: 2 });
    // Allow the loopback round-trip.
    await new Promise((r) => setTimeout(r, 200));
    // Tear down — close stdin so the child exits.
    await t.close();
    expect(seen).toContainEqual({ ping: 1 });
    expect(seen).toContainEqual({ ping: 2 });
  });

  test("exposes pid and exited promise", async () => {
    const t = spawnTransport({
      binary: process.execPath,
      args: ["-e", "setTimeout(() => process.exit(0), 50);"],
      rawArgs: true,
    });
    expect(typeof t.pid).toBe("number");
    expect(t.pid).toBeGreaterThan(0);
    const code = await t.exited;
    expect(typeof code).toBe("number");
  });
});
