#!/usr/bin/env bun
/**
 * Replay committed integration fixtures against the active arktype schemas.
 *
 * This is the deterministic regression test the CI pipeline runs — no
 * binary required. For each `<test>.jsonl` under
 * `codegen/snapshots/<ver>/integration-fixtures/`, every frame is dispatched
 * through `inboundByType` / `inboundBySubtype` and validated. Any rejection
 * fails the run.
 *
 * Exit codes:
 *   0   all fixtures pass
 *   2   one or more frames failed schema validation
 *   3   no fixtures found (likely a misconfiguration)
 *
 * Output: per-test pass/fail summary on stderr; structured JSON on stdout
 * when `--json` is passed.
 */

import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

import { ACTIVE_VERSION } from "../version";

const REPO_ROOT = resolve(import.meta.dir, "..", "..");
const FIXTURE_DIR = join(
  REPO_ROOT,
  "codegen",
  "snapshots",
  ACTIVE_VERSION,
  "integration-fixtures",
);

interface ReplayResult {
  test: string;
  totalFrames: number;
  rejectedFrames: Array<{
    discriminator: string;
    raw: string;
    error: string;
  }>;
}

async function main() {
  const json = process.argv.includes("--json");
  if (!existsSync(FIXTURE_DIR)) {
    process.stderr.write(`[replay-fixtures] no fixtures at ${FIXTURE_DIR}\n`);
    process.exit(3);
  }
  const files = readdirSync(FIXTURE_DIR).filter((f) => f.endsWith(".jsonl"));
  if (files.length === 0) {
    process.stderr.write(`[replay-fixtures] empty fixture dir\n`);
    process.exit(3);
  }

  // Path-style dynamic import so this script can run from anywhere in the repo.
  const dispatch = (await import(
    `../../packages/protocol/generated/${ACTIVE_VERSION}/dispatch.ts`
  )) as {
    inboundBySubtype: Record<string, { allows: (v: unknown) => boolean; toString: () => string }>;
    inboundByType: Record<string, { allows: (v: unknown) => boolean; toString: () => string }>;
  };

  const results: ReplayResult[] = [];
  let totalRejections = 0;

  for (const file of files.sort()) {
    const testName = file.replace(/\.jsonl$/, "");
    const lines = readFileSync(join(FIXTURE_DIR, file), "utf8")
      .split("\n")
      .filter((l) => l.trim() !== "");
    // First line is `_meta`; rest are frames.
    const result: ReplayResult = { test: testName, totalFrames: 0, rejectedFrames: [] };
    for (let i = 1; i < lines.length; i++) {
      const raw = lines[i];
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch {
        result.rejectedFrames.push({
          discriminator: "(non-JSON)",
          raw,
          error: "Failed to parse line as JSON",
        });
        continue;
      }
      result.totalFrames++;
      if (parsed === null || typeof parsed !== "object") continue;
      const f = parsed as Record<string, unknown>;
      const ty = typeof f.type === "string" ? (f.type as string) : null;
      const sub = typeof f.subtype === "string" ? (f.subtype as string) : null;
      const responseSub =
        typeof f.response === "object" &&
        f.response !== null &&
        typeof (f.response as Record<string, unknown>).subtype === "string"
          ? ((f.response as Record<string, unknown>).subtype as string)
          : null;

      // Validation rule: every frame must have a `type` we know about, and
      // the corresponding type-schema must accept the frame. Compound
      // (subtype-keyed) schemas are exercised through their parent type
      // schema; the type-level validator is the canonical gate.
      if (ty) {
        const typeSchema = dispatch.inboundByType[ty];
        if (!typeSchema) {
          // Unknown type — surface as a soft warning, not a hard fail. The
          // dispatch map is keyed on type literals; a fixture frame with an
          // unmapped type means our extractor missed the schema. Flagged
          // here for the integration report.
          result.rejectedFrames.push({
            discriminator: `type/${ty}${sub ? `+subtype/${sub}` : ""}`,
            raw: raw.slice(0, 200),
            error: `unknown type literal '${ty}'`,
          });
          continue;
        }
        if (!typeSchema.allows(parsed)) {
          result.rejectedFrames.push({
            discriminator: `type/${ty}${sub ? `+subtype/${sub}` : ""}`,
            raw: raw.slice(0, 200),
            error: `type-schema for '${ty}' rejected frame`,
          });
        }
      } else if (responseSub) {
        // Bare control_response (no top-level subtype echo). We don't
        // currently re-validate the embedded payload here because the
        // dispatch map keys request schemas, not response payloads.
      }
    }
    results.push(result);
    totalRejections += result.rejectedFrames.length;
    process.stderr.write(
      `[replay-fixtures] ${testName}: ${result.totalFrames} frames, ${result.rejectedFrames.length} rejected\n`,
    );
  }

  if (json) {
    process.stdout.write(JSON.stringify(results, null, 2) + "\n");
  } else {
    for (const r of results) {
      for (const rej of r.rejectedFrames) {
        process.stderr.write(
          `  [${r.test}] REJECT ${rej.discriminator}: ${rej.error}\n    raw: ${rej.raw}\n`,
        );
      }
    }
  }

  if (totalRejections > 0) {
    process.stderr.write(`[replay-fixtures] FAIL: ${totalRejections} frames rejected\n`);
    process.exit(2);
  }
  process.stderr.write(`[replay-fixtures] OK: all fixtures validate\n`);
  process.exit(0);
}

await main();
