/**
 * For each fixture under `codegen/snapshots/<ver>/integration-fixtures/`,
 * spin up a `ClaudeProcess` over a `bufferTransport`, feed every frame
 * from the fixture, and assert zero validation rejections (in
 * `discriminator` mode — the production default).
 *
 * The `_meta` header line of each fixture is skipped — it's not a wire
 * frame.
 */

import { describe, test, expect } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { bufferTransport } from "../src/transport/buffer";
import { ClaudeProcess } from "../src/process";
import { ACTIVE_VERSION } from "../src/version";

const FIXTURE_DIR = resolve(
  import.meta.dir,
  "..",
  "..",
  "..",
  "codegen",
  "snapshots",
  ACTIVE_VERSION,
  "integration-fixtures",
);

describe("ClaudeProcess validates committed fixtures (discriminator mode)", () => {
  if (!existsSync(FIXTURE_DIR)) {
    test.skip("no fixtures committed", () => {});
    return;
  }
  const files = readdirSync(FIXTURE_DIR).filter((f) => f.endsWith(".jsonl"));
  for (const file of files) {
    const name = file.replace(/\.jsonl$/, "");
    test(`${name}`, () => {
      const lines = readFileSync(join(FIXTURE_DIR, file), "utf8")
        .split("\n")
        .filter((l) => l.trim());
      const h = bufferTransport();
      const proc = new ClaudeProcess(h.transport, { validation: "discriminator" });
      const passed: unknown[] = [];
      proc.onFrame((f) => passed.push(f));
      // Skip the _meta line at index 0.
      for (let i = 1; i < lines.length; i++) {
        let parsed: unknown;
        try {
          parsed = JSON.parse(lines[i]);
        } catch {
          continue;
        }
        h.feed(parsed);
      }
      const m = proc.snapshotMetrics();
      // Allow up to 0 rejections — discriminator mode is the production default.
      expect(m.framesRejected).toBe(0);
      expect(m.framesPassed).toBeGreaterThan(0);
    });
  }
});
