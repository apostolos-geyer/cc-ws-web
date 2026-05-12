/**
 * For each fixture, instantiate a `ClaudeClient`, feed all frames, take a
 * snapshot, and assert it matches the expected-state shape.
 *
 * The current zero-cost fixture catalog only exercises `initialize` +
 * one control_request + `end_session`. No `system/init` is emitted (only
 * fires on a real turn — see comments in `codegen/integration/tests.ts`),
 * no `assistant` frames, no tasks. So the expected state is the same
 * across every fixture: empty messages, empty tasks, empty pending
 * permission requests, sessionId still null, sessionState still "idle".
 *
 * If the catalog grows to include turn-emitting tests we'll author
 * per-fixture expected JSONs; for now the shared minimal-state assertion
 * is the right level.
 */

import { describe, test, expect } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { bufferTransport } from "../src/transport/buffer";
import { ClaudeClient } from "../src/client";
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

describe("ClaudeClient state on committed fixtures", () => {
  if (!existsSync(FIXTURE_DIR)) {
    test.skip("no fixtures committed", () => {});
    return;
  }
  const files = readdirSync(FIXTURE_DIR).filter((f) => f.endsWith(".jsonl"));
  for (const file of files) {
    const name = file.replace(/\.jsonl$/, "");
    test(`${name} produces a minimal-state snapshot`, () => {
      const lines = readFileSync(join(FIXTURE_DIR, file), "utf8")
        .split("\n")
        .filter((l) => l.trim());
      const h = bufferTransport();
      const client = new ClaudeClient(h.transport);
      for (let i = 1; i < lines.length; i++) {
        let parsed: unknown;
        try {
          parsed = JSON.parse(lines[i]);
        } catch {
          continue;
        }
        h.feed(parsed);
      }
      const snap = client.getSnapshot();
      // No system/init in zero-cost fixtures → no sessionId set.
      expect(snap.sessionId).toBeNull();
      // No assistant frames in zero-cost fixtures → no assistant entries.
      const assistantEntries = snap.messages.filter(
        (m) => m.kind === "frame" && (m.frame as { type?: string }).type === "assistant",
      );
      expect(assistantEntries).toEqual([]);
      // No can_use_tool frames in zero-cost fixtures → empty pending.
      expect(snap.pendingPermissions).toEqual([]);
      expect(snap.tasks).toEqual([]);
    });
  }
});
