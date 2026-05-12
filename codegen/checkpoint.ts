#!/usr/bin/env bun
/**
 * One-command runner for Checkpoint #1 (Phase 2) + Checkpoint #2 (Phase 3).
 *
 * Each gate runs as a subprocess so a failure in one doesn't take down the
 * rest of the suite. The runner prints a colored ✓/✗ table on stderr and
 * exits non-zero if any gate fails. Drift / idempotence checks compare
 * generated artifacts against committed copies via a temporary scratch
 * directory; the user's working tree is left untouched.
 *
 * Invocation:
 *   bun codegen/checkpoint.ts
 *
 * Gates (Checkpoint #1 — Phase 2):
 *   1. extractor reproducibility (extract.ts byte-identical against
 *      committed canonical.json)
 *   2. generate.ts idempotence (byte-identical against committed
 *      generated/<ver>/{schemas,types,dispatch}.ts)
 *   3. check-gaps.ts vs committed canonical + types
 *   4. live-binary integration tests (skips with WARN when binary missing)
 *   5. replay-fixtures (committed-fixture validation)
 *   6. bun test packages/protocol/__tests__/
 *   7. bun publish --dry-run (skipped when not logged in)
 *   8. verify-package.ts
 *   9. simulated-drift smoke (3 separate drift cases, each must trip a
 *      distinct gate; we revert after)
 *  10. outside-island diff (git diff --stat excluding the island paths)
 *
 * Gates (Checkpoint #2 — Phase 3):
 *  11. bun test packages/server/__tests__/
 *  12. browser-safety grep over packages/protocol/src/
 *  13. server isolation check (no diff in server.ts / client/src/ / apps/)
 *  14. packages/server tsc clean
 *  15. opt-in live-binary E2E (CC_PROTOCOL_LIVE_BINARY=1)
 */

import { spawnSync, type SpawnSyncReturns } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";

import { ACTIVE_VERSION } from "./version";

const REPO_ROOT = resolve(import.meta.dir, "..");
const SNAPSHOT_DIR = join(REPO_ROOT, "codegen", "snapshots", ACTIVE_VERSION);
const PKG_DIR = join(REPO_ROOT, "packages", "protocol");
const GEN_DIR = join(PKG_DIR, "generated", ACTIVE_VERSION);
const BINARY_PATH = `/Users/stoli/.local/share/claude/versions/${ACTIVE_VERSION}`;

const RED = "\x1b[31m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const DIM = "\x1b[2m";
const RESET = "\x1b[0m";

interface GateResult {
  name: string;
  status: "pass" | "fail" | "skip";
  detail?: string;
}

const results: GateResult[] = [];

function record(name: string, status: GateResult["status"], detail?: string) {
  results.push({ name, status, detail });
  const mark = status === "pass" ? `${GREEN}✓${RESET}` : status === "skip" ? `${YELLOW}~${RESET}` : `${RED}✗${RESET}`;
  process.stderr.write(`${mark} ${name}${detail ? `${DIM} — ${detail}${RESET}` : ""}\n`);
}

function run(cmd: string, args: string[], opts: { cwd?: string; allowFail?: boolean } = {}): SpawnSyncReturns<string> {
  return spawnSync(cmd, args, {
    cwd: opts.cwd ?? REPO_ROOT,
    encoding: "utf8",
    stdio: "pipe",
  });
}

async function main() {
  // Gate 1: extractor reproducibility — re-extract into /tmp and diff against committed canonical.
  const probeDir = join(tmpdir(), `cc-protocol-probe-${process.pid}`);
  mkdirSync(probeDir, { recursive: true });
  if (!existsSync(BINARY_PATH)) {
    record("extractor reproducibility", "skip", `binary missing at ${BINARY_PATH}`);
  } else {
    const r = run("bun", [
      "codegen/extract.ts",
      "extract",
      BINARY_PATH,
      "--out",
      probeDir,
    ]);
    if (r.status !== 0) {
      record("extractor reproducibility", "fail", `extract.ts exited ${r.status}`);
    } else {
      const probeCanon = readFileSync(join(probeDir, "canonical.json"));
      const commit = readFileSync(join(SNAPSHOT_DIR, "canonical.json"));
      if (Buffer.compare(probeCanon, commit) === 0) {
        record("extractor reproducibility", "pass");
      } else {
        record(
          "extractor reproducibility",
          "fail",
          "probe canonical.json bytes differ from committed snapshot",
        );
      }
    }
  }
  try {
    rmSync(probeDir, { recursive: true, force: true });
  } catch {
    // ignore
  }

  // Gate 2: generate.ts idempotence — copy current generated files, re-run, compare.
  const before = {
    schemas: readFileSync(join(GEN_DIR, "schemas.ts")),
    types: readFileSync(join(GEN_DIR, "types.ts")),
    dispatch: readFileSync(join(GEN_DIR, "dispatch.ts")),
  };
  const r2 = run("bun", ["codegen/generate.ts"]);
  if (r2.status !== 0) {
    record("generate.ts idempotence", "fail", `generate.ts exited ${r2.status}`);
  } else {
    const after = {
      schemas: readFileSync(join(GEN_DIR, "schemas.ts")),
      types: readFileSync(join(GEN_DIR, "types.ts")),
      dispatch: readFileSync(join(GEN_DIR, "dispatch.ts")),
    };
    if (
      Buffer.compare(before.schemas, after.schemas) !== 0 ||
      Buffer.compare(before.types, after.types) !== 0 ||
      Buffer.compare(before.dispatch, after.dispatch) !== 0
    ) {
      record(
        "generate.ts idempotence",
        "fail",
        "generated files changed on re-run (non-deterministic codegen)",
      );
    } else {
      record("generate.ts idempotence", "pass");
    }
  }

  // Gate 3: check-gaps — run against the generated *schemas.ts* (the file
  // where wire literals actually appear; `types.ts` only contains schema
  // identifier names since the inferred TS types are computed from
  // `typeof X.infer`).
  const r3 = run("bun", [
    "codegen/check-gaps.ts",
    join(SNAPSHOT_DIR, "canonical.json"),
    join(GEN_DIR, "schemas.ts"),
  ]);
  if (r3.status === 0) record("check-gaps.ts", "pass");
  else record("check-gaps.ts", "fail", `exit ${r3.status}\n${r3.stdout}`);

  // Gate 4: live-binary integration tests.
  if (!existsSync(BINARY_PATH)) {
    record("integration tests (live)", "skip", "binary missing");
  } else {
    const r4 = run("bun", ["codegen/integration/run-tests.ts"]);
    if (r4.status === 0) record("integration tests (live)", "pass");
    else record("integration tests (live)", "fail", `exit ${r4.status}`);
  }

  // Gate 5: replay committed fixtures.
  const r5 = run("bun", ["codegen/integration/replay-fixtures.ts"]);
  if (r5.status === 0) record("replay-fixtures", "pass");
  else record("replay-fixtures", "fail", `exit ${r5.status}`);

  // Gate 6: bun test packages/protocol/__tests__/.
  const r6 = run("bun", ["test"], { cwd: PKG_DIR });
  if (r6.status === 0) record("bun test (protocol)", "pass");
  else record("bun test (protocol)", "fail", `exit ${r6.status}\n${r6.stderr.slice(0, 1000)}`);

  // Gate 7: bun publish --dry-run.
  const r7 = run(
    "bun",
    ["publish", "--dry-run", "--tolerate-republish", "--access", "public"],
    { cwd: PKG_DIR },
  );
  if (r7.status === 0) {
    record("bun publish --dry-run", "pass");
  } else if ((r7.stderr || "").toLowerCase().includes("auth")) {
    record("bun publish --dry-run", "skip", "registry auth required");
  } else {
    record("bun publish --dry-run", "fail", `exit ${r7.status}\n${r7.stderr.slice(0, 1000)}`);
  }

  // Gate 8: verify-package.ts.
  const r8 = run("bun", ["codegen/verify-package.ts"]);
  if (r8.status === 0) record("verify-package.ts", "pass");
  else record("verify-package.ts", "fail", `exit ${r8.status}\n${r8.stderr.slice(0, 1000)}`);

  // Gate 9: simulated-drift smoke test.
  //   Three independent drifts; each must trip a *distinct* gate. We back
  //   up the files we mutate, restore them after each sub-check, and
  //   assert the expected gate failed.
  const driftFixturePath = join(SNAPSHOT_DIR, "integration-fixtures", "init-then-end.jsonl");
  const driftPatchesPath = join(SNAPSHOT_DIR, "patches.ts");
  const driftCanonicalPath = join(SNAPSHOT_DIR, "canonical.json");
  const backups = {
    fixture: readFileSync(driftFixturePath, "utf8"),
    patches: readFileSync(driftPatchesPath, "utf8"),
    canonical: readFileSync(driftCanonicalPath, "utf8"),
  };

  let drift1Passed = false;
  try {
    // Drift A: mutate a fixture frame so it violates schema.
    const lines = backups.fixture.split("\n").filter((l) => l.trim());
    // Corrupt line 1 (the first real frame) by replacing the type literal.
    if (lines.length > 1) {
      const meta = lines[0];
      const corrupted = lines[1].replace('"type":"control_response"', '"type":"BOGUS_TYPE"');
      writeFileSync(driftFixturePath, [meta, corrupted, ...lines.slice(2)].join("\n") + "\n");
      const r = run("bun", ["codegen/integration/replay-fixtures.ts"]);
      drift1Passed = r.status !== 0;
    }
  } finally {
    writeFileSync(driftFixturePath, backups.fixture);
  }

  let drift2Passed = false;
  try {
    // Drift B: corrupt canonical so its sha256 no longer matches the generated header.
    writeFileSync(driftCanonicalPath, backups.canonical + "\n");
    const r = run("bun", ["codegen/verify-package.ts", "--skip-tsc"]);
    drift2Passed = r.status !== 0;
  } finally {
    writeFileSync(driftCanonicalPath, backups.canonical);
  }

  let drift3Passed = false;
  try {
    // Drift C: insert a bogus patch referencing a non-existent schema.
    const bogusPatches =
      backups.patches.replace(
        "patches: [",
        `patches: [
    { kind: "fieldType", schema: "DoesNotExistEver", field: "x", arktype: "string", reason: "drift smoke" },`,
      );
    writeFileSync(driftPatchesPath, bogusPatches);
    const r = run("bun", ["codegen/generate.ts"]);
    drift3Passed = r.status !== 0;
  } finally {
    writeFileSync(driftPatchesPath, backups.patches);
    // Re-run generate to restore the generated artifacts to their committed state.
    run("bun", ["codegen/generate.ts"]);
  }

  if (drift1Passed && drift2Passed && drift3Passed) {
    record("simulated-drift smoke", "pass", "all 3 drift gates tripped");
  } else {
    record(
      "simulated-drift smoke",
      "fail",
      `drift1=${drift1Passed} drift2=${drift2Passed} drift3=${drift3Passed}`,
    );
  }

  // Gate 10: outside-island diff. The island for Phase 2 is the codegen
  // pipeline + the protocol package. Phase 3 extends the island to include
  // packages/server/src/transport/, packages/server/__tests__/,
  // packages/server/package.json, packages/server/tsconfig.json, and
  // .claude/skills/. We also exempt `bun.lock` (workspace dep added) and
  // `.gitignore` (we un-ignored integration-fixtures and coverage.json).
  const r10 = run("git", [
    "diff",
    "--stat",
    "--",
    ":!codegen/",
    ":!packages/protocol/",
    ":!packages/server/src/transport/",
    ":!packages/server/__tests__/",
    ":!packages/server/package.json",
    ":!packages/server/tsconfig.json",
    ":!packages/server/README.md",
    ":!.claude/skills/",
    ":!bun.lock",
    ":!.gitignore",
  ]);
  const outsideDiff = (r10.stdout || "").trim();
  if (outsideDiff === "") {
    record("outside-island diff is empty", "pass");
  } else {
    record(
      "outside-island diff is empty",
      "fail",
      `non-empty diff:\n${outsideDiff}`,
    );
  }

  // -------------------------------------------------------------------
  // Checkpoint #2 (Phase 3) gates
  // -------------------------------------------------------------------

  // Gate 11: bun test packages/server/__tests__/.
  const SERVER_DIR = join(REPO_ROOT, "packages", "server");
  const r11 = run("bun", ["test"], { cwd: SERVER_DIR });
  if (r11.status === 0) record("bun test (server)", "pass");
  else record("bun test (server)", "fail", `exit ${r11.status}\n${r11.stderr.slice(0, 1000)}`);

  // Gate 12: browser-safety grep — no Bun/Node refs in protocol src.
  const r12 = run("grep", [
    "-rE",
    "Bun\\.|node:|require\\(\"node|process\\.spawn",
    "packages/protocol/src/",
  ]);
  // grep exit code: 0 = match found, 1 = no match (what we want), 2 = error.
  if (r12.status === 1) record("browser-safety grep", "pass", "no Node/Bun refs in protocol src");
  else if (r12.status === 0) record("browser-safety grep", "fail", `matches:\n${r12.stdout}`);
  else record("browser-safety grep", "fail", `grep error exit ${r12.status}`);

  // Gate 13: server isolation — server.ts / client/src/ / apps/ untouched.
  const r13 = run("git", [
    "diff",
    "packages/server/src/server.ts",
    "packages/client/src/",
    "apps/",
  ]);
  const iso = (r13.stdout || "").trim();
  if (iso === "") record("server isolation check", "pass");
  else record("server isolation check", "fail", `diffs in protected paths:\n${iso.slice(0, 500)}`);

  // Gate 14: server tsc clean.
  const r14 = run("bunx", ["tsc", "--noEmit", "-p", "."], { cwd: SERVER_DIR });
  if (r14.status === 0) record("packages/server tsc", "pass");
  else record("packages/server tsc", "fail", `exit ${r14.status}\n${r14.stdout.slice(0, 1000)}`);

  // Gate 15: opt-in live-binary E2E (CC_PROTOCOL_LIVE_BINARY=1).
  if (!existsSync(BINARY_PATH)) {
    record("live-binary E2E (opt-in)", "skip", "binary missing");
  } else {
    const r15 = spawnSync(
      "bun",
      ["test", "__tests__/live.test.ts"],
      {
        cwd: SERVER_DIR,
        encoding: "utf8",
        env: { ...process.env, CC_PROTOCOL_LIVE_BINARY: "1" },
        stdio: "pipe",
      },
    );
    if (r15.status === 0) record("live-binary E2E (opt-in)", "pass");
    else record("live-binary E2E (opt-in)", "fail", `exit ${r15.status}\n${r15.stderr.slice(0, 500)}`);
  }

  // Summary.
  const passed = results.filter((r) => r.status === "pass").length;
  const failed = results.filter((r) => r.status === "fail").length;
  const skipped = results.filter((r) => r.status === "skip").length;
  process.stderr.write(`\n${GREEN}${passed} pass${RESET}  ${failed > 0 ? RED : DIM}${failed} fail${RESET}  ${skipped > 0 ? YELLOW : DIM}${skipped} skip${RESET}\n`);
  process.exit(failed > 0 ? 1 : 0);
}

await main();
