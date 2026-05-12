/**
 * Bun-test wrapper around `codegen/integration/replay-fixtures.ts`.
 *
 * Loads each committed `<test>.jsonl` under
 * `codegen/snapshots/<ver>/integration-fixtures/`, validates every frame
 * against the active dispatch maps, and reports per-fixture pass/fail
 * counts. Zero failures expected once Phase 2 is done.
 */

import { describe, test, expect } from "bun:test";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";

import {
  ACTIVE_VERSION,
  inboundByType,
  inboundBySubtype,
} from "../src/index";

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

describe("replay committed integration fixtures", () => {
  if (!existsSync(FIXTURE_DIR)) {
    test.skip("no fixtures committed — re-run `bun codegen/integration/run-tests.ts --update-fixtures`", () => {});
    return;
  }
  const files = readdirSync(FIXTURE_DIR).filter((f) => f.endsWith(".jsonl"));
  if (files.length === 0) {
    test.skip("fixture dir is empty", () => {});
    return;
  }
  for (const file of files) {
    const testName = file.replace(/\.jsonl$/, "");
    test(`${testName} fixture validates`, () => {
      const lines = readFileSync(join(FIXTURE_DIR, file), "utf8")
        .split("\n")
        .filter((l) => l.trim() !== "");
      // First line is `_meta`.
      const rejections: string[] = [];
      for (let i = 1; i < lines.length; i++) {
        const raw = lines[i];
        let parsed: unknown;
        try {
          parsed = JSON.parse(raw);
        } catch {
          rejections.push(`non-JSON line: ${raw.slice(0, 100)}`);
          continue;
        }
        if (!parsed || typeof parsed !== "object") continue;
        const f = parsed as Record<string, unknown>;
        const ty = typeof f.type === "string" ? (f.type as string) : null;
        if (!ty) continue;
        const schema = inboundByType[ty];
        if (!schema) {
          rejections.push(`unknown type literal '${ty}' in fixture`);
          continue;
        }
        if (!schema.allows(parsed)) {
          rejections.push(
            `type-schema for '${ty}' rejected frame: ${raw.slice(0, 200)}`,
          );
        }
      }
      // We also assert dispatch.inboundBySubtype is populated (sanity).
      expect(Object.keys(inboundBySubtype).length).toBeGreaterThan(0);
      if (rejections.length > 0) {
        throw new Error(
          `Fixture ${testName} had ${rejections.length} validation failures:\n${rejections.join("\n")}`,
        );
      }
    });
  }
});
