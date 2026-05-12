#!/usr/bin/env bun
/**
 * CI gates that don't need the claude binary.
 *
 * Runs three committed-artifact validators in sequence:
 *   1. `check-gaps.ts` — canonical.json vs generated types: every named
 *      schema in canonical is exported by types.ts, with the same
 *      discriminator + field set.
 *   2. `verify-package.ts` — package.json, exports map, browser-safety
 *      grep, etc.
 *   3. `integration/replay-fixtures.ts` — replays the recorded fixtures
 *      through `ClaudeProcess` against `bufferTransport` and asserts no
 *      validation rejections.
 *
 * Plus two `tsc --noEmit` runs for the protocol and server packages.
 *
 * Each gate runs in a subprocess so a stack trace from one doesn't
 * pollute another. Any nonzero exit short-circuits.
 */

import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { ACTIVE_VERSION } from "./version";

const repoRoot = resolve(import.meta.dir, "..");

interface Gate {
  name: string;
  cmd: string[];
}

const canonicalPath = resolve(repoRoot, `codegen/snapshots/${ACTIVE_VERSION}/canonical.json`);
// check-gaps runs against schemas.ts — that's where wire literals appear
// (types.ts only re-exports the inferred TS types via `typeof X.infer`).
const generatedSchemasPath = resolve(repoRoot, `packages/protocol/generated/${ACTIVE_VERSION}/schemas.ts`);

const gates: Gate[] = [
  {
    name: "check-gaps",
    cmd: ["bun", "codegen/check-gaps.ts", canonicalPath, generatedSchemasPath],
  },
  {
    name: "verify-package",
    cmd: ["bun", "codegen/verify-package.ts"],
  },
  {
    name: "replay-fixtures",
    cmd: ["bun", "codegen/integration/replay-fixtures.ts"],
  },
  {
    name: "tsc protocol",
    cmd: ["bunx", "tsc", "--noEmit", "-p", "packages/protocol/tsconfig.json"],
  },
  {
    name: "tsc server",
    cmd: ["bunx", "tsc", "--noEmit", "-p", "packages/server/tsconfig.json"],
  },
];

let allOk = true;
for (const gate of gates) {
  const start = Date.now();
  process.stdout.write(`[ci-checks] ${gate.name}: `);
  const result = spawnSync(gate.cmd[0]!, gate.cmd.slice(1), {
    cwd: repoRoot,
    stdio: ["ignore", "pipe", "pipe"],
    encoding: "utf8",
  });
  const ms = Date.now() - start;
  if (result.status === 0) {
    process.stdout.write(`ok (${ms}ms)\n`);
  } else {
    allOk = false;
    process.stdout.write(`FAIL (${ms}ms)\n`);
    if (result.stdout) process.stdout.write(`--- stdout ---\n${result.stdout}\n`);
    if (result.stderr) process.stderr.write(`--- stderr ---\n${result.stderr}\n`);
  }
}

if (!allOk) {
  process.exit(1);
}
console.log("[ci-checks] all gates green");
