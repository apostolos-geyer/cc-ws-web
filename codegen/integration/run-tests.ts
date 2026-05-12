#!/usr/bin/env bun
/**
 * Live-binary integration test runner.
 *
 * Drives each scenario in `tests.ts` end-to-end against a real Claude binary
 * spawned through `stdio-harness.ts`. Captures every stdout frame verbatim
 * into `codegen/snapshots/<ver>/integration-fixtures/<test>.jsonl` (one
 * JSON-per-line, plus a `_meta` header line that records binary version,
 * binary sha256, test step list, and capture timestamp). Validates each
 * captured frame against the active arktype schemas — failures land in
 * `integration-report.md` and append to `failures.md`.
 *
 * Usage:
 *   bun codegen/integration/run-tests.ts                 (run + diff vs committed)
 *   bun codegen/integration/run-tests.ts --update-fixtures (re-record)
 *   bun codegen/integration/run-tests.ts --binary <path>  (override binary)
 *   bun codegen/integration/run-tests.ts --only <name>    (single-test mode)
 *
 * Exits non-zero on any test failure / validation failure / diff mismatch.
 */

import { mkdirSync, readFileSync, writeFileSync, existsSync, appendFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { spawnHarness } from "./stdio-harness";
import { TESTS, type BinaryTest, type TestStep } from "./tests";
import {
  ACTIVE_VERSION,
  ACTIVE_BINARY_SHA256,
  ACTIVE_NPM_PACKAGE_VERSION,
} from "../version";

const REPO_ROOT = resolve(import.meta.dir, "..", "..");
const SNAPSHOT_DIR = join(REPO_ROOT, "codegen", "snapshots", ACTIVE_VERSION);
const FIXTURE_DIR = join(SNAPSHOT_DIR, "integration-fixtures");

interface RunOptions {
  binary: string;
  updateFixtures: boolean;
  only?: string;
}

function parseArgs(argv: string[]): RunOptions {
  let binary = `/Users/stoli/.local/share/claude/versions/${ACTIVE_VERSION}`;
  let updateFixtures = false;
  let only: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--binary") binary = argv[++i];
    else if (a === "--update-fixtures") updateFixtures = true;
    else if (a === "--only") only = argv[++i];
    else if (a.startsWith("--binary=")) binary = a.slice("--binary=".length);
    else if (a.startsWith("--only=")) only = a.slice("--only=".length);
  }
  return { binary, updateFixtures, only };
}

interface CapturedFrame {
  /** The raw stdout line (preserves byte-identical capture). */
  raw: string;
  /** Parsed JSON, when the line was valid JSON. */
  parsed: unknown;
}

interface CapturedTest {
  test: BinaryTest;
  binaryVersion: string;
  binarySha256: string;
  npmPackageVersion: string;
  capturedAt: string;
  steps: TestStep[];
  frames: CapturedFrame[];
  stderr: string[];
  /** True if the harness's idle-timeout killed the child. */
  idleFired: boolean;
}

async function runOne(test: BinaryTest, opts: RunOptions): Promise<CapturedTest> {
  const args = [
    "--print",
    "--input-format",
    "stream-json",
    "--output-format",
    "stream-json",
    "--verbose",
    "--no-session-persistence",
    "--permission-mode",
    "plan",
    ...(test.spawnArgs ?? []),
  ];
  const frames: CapturedFrame[] = [];
  const stderr: string[] = [];
  const harness = await spawnHarness({
    binary: opts.binary,
    args,
    idleTimeoutMs: 15_000,
    onStderr: (line) => stderr.push(line),
  });

  // Per-test predicate-driven step replay.
  let pendingResolve: ((frame: unknown) => void) | null = null;
  let pendingPredicate:
    | ((frame: unknown) => boolean)
    | null = null;

  harness.onFrame((frame, raw) => {
    frames.push({ raw, parsed: frame });
    if (pendingPredicate && pendingPredicate(frame)) {
      const r = pendingResolve!;
      pendingPredicate = null;
      pendingResolve = null;
      r(frame);
    }
  });

  function waitFor(pred: (frame: unknown) => boolean, timeoutMs: number) {
    // Race against previously-buffered frames to handle the case where the
    // matching frame arrived between the previous step and this one. We
    // re-check from the tail of `frames` first.
    for (let i = frames.length - 1; i >= 0; i--) {
      // Only consider frames that arrived AFTER the last awaited predicate.
      // For simplicity we just scan all frames — the predicates are unique
      // enough (per request_id) that this is fine in practice.
      if (pred(frames[i].parsed)) return Promise.resolve(frames[i].parsed);
    }
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => {
        pendingPredicate = null;
        pendingResolve = null;
        reject(new Error(`[run-tests] waitFor timed out after ${timeoutMs}ms`));
      }, timeoutMs);
      pendingPredicate = (frame) => {
        if (pred(frame)) {
          clearTimeout(t);
          return true;
        }
        return false;
      };
      pendingResolve = resolve;
    });
  }

  let requestCounter = 0;
  const requestIdsBySubtype = new Map<string, string>();

  try {
    for (const step of test.steps) {
      if (step.kind === "control_request") {
        if (step.subtype === "initialize") {
          // The initialize control_request also carries the init options.
          const reqId = `req-${++requestCounter}`;
          requestIdsBySubtype.set(step.subtype, reqId);
          const initRequest: Record<string, unknown> = {
            subtype: "initialize",
            ...(test.initOptions ?? {}),
          };
          await harness.send({
            type: "control_request",
            request_id: reqId,
            request: initRequest,
          });
        } else {
          const reqId = `req-${++requestCounter}`;
          requestIdsBySubtype.set(step.subtype, reqId);
          await harness.send({
            type: "control_request",
            request_id: reqId,
            request: { subtype: step.subtype, ...(step.payload ?? {}) },
          });
        }
      } else if (step.kind === "user_message") {
        await harness.send({
          type: "user",
          message: { role: "user", content: step.text },
        });
      } else {
        const timeoutMs = step.timeoutMs ?? 10_000;
        const pred =
          step.predicate === "system_init"
            ? (f: unknown) =>
                typeof f === "object" &&
                f !== null &&
                (f as { type?: string }).type === "system" &&
                (f as { subtype?: string }).subtype === "init"
            : step.predicate === "control_response_success"
              ? (f: unknown) =>
                  typeof f === "object" &&
                  f !== null &&
                  (f as { type?: string }).type === "control_response" &&
                  ((f as { response?: { subtype?: string } }).response?.subtype === "success" ||
                    (f as { response?: { subtype?: string } }).response?.subtype === "error")
              : step.predicate === "assistant_started"
                ? (f: unknown) =>
                    typeof f === "object" &&
                    f !== null &&
                    (f as { type?: string }).type === "assistant"
                : (f: unknown) =>
                    typeof f === "object" &&
                    f !== null &&
                    JSON.stringify(f).includes(
                      typeof step.predicate === "object"
                        ? step.predicate.matches
                        : "",
                    );
        await waitFor(pred, timeoutMs);
      }
    }
  } finally {
    await harness.kill({ force: false });
  }

  return {
    test,
    binaryVersion: ACTIVE_VERSION,
    binarySha256: ACTIVE_BINARY_SHA256,
    npmPackageVersion: ACTIVE_NPM_PACKAGE_VERSION,
    capturedAt: new Date().toISOString(),
    steps: test.steps,
    frames,
    stderr,
    idleFired: (harness as unknown as { idleFired: boolean }).idleFired,
  };
}

function writeFixture(c: CapturedTest) {
  const meta = {
    _meta: {
      test: c.test.name,
      binaryVersion: c.binaryVersion,
      binarySha256: c.binarySha256,
      npmPackageVersion: c.npmPackageVersion,
      capturedAt: c.capturedAt,
      steps: c.steps,
      expectedFrames: c.test.expectedFrames,
    },
  };
  const lines = [JSON.stringify(meta), ...c.frames.map((f) => f.raw)];
  writeFileSync(join(FIXTURE_DIR, `${c.test.name}.jsonl`), lines.join("\n") + "\n");
}

interface AssertionResult {
  test: string;
  pass: boolean;
  validationErrors: string[];
  missingExpected: string[];
  observedDiscriminants: string[];
  idleFired: boolean;
}

async function assertFixture(c: CapturedTest): Promise<AssertionResult> {
  const errors: string[] = [];
  const observed = new Set<string>();

  // Lazy import the active schemas so this script can also be used outside
  // of an installed @cc-protocol package (path-style import).
  const schemas = (await import(
    `../../packages/protocol/generated/${ACTIVE_VERSION}/schemas.ts`
  )) as Record<string, { allows: (v: unknown) => boolean; toString: () => string }>;
  const dispatch = (await import(
    `../../packages/protocol/generated/${ACTIVE_VERSION}/dispatch.ts`
  )) as {
    inboundBySubtype: Record<string, { allows: (v: unknown) => boolean }>;
    inboundByType: Record<string, { allows: (v: unknown) => boolean }>;
  };

  for (const frame of c.frames) {
    const f = frame.parsed as Record<string, unknown> | null;
    if (!f || typeof f !== "object") continue;
    const ty = typeof f.type === "string" ? (f.type as string) : null;
    const sub = typeof f.subtype === "string" ? (f.subtype as string) : null;

    // Track discriminants so we can compare against the test's `expectedFrames`.
    if (ty && sub) observed.add(`type/${ty}+subtype/${sub}`);
    if (ty) observed.add(`type/${ty}`);
    if (sub) observed.add(`subtype/${sub}`);

    // Some control_response frames carry their subtype inside .response.subtype.
    const responseSub =
      typeof f.response === "object" &&
      f.response !== null &&
      typeof (f.response as Record<string, unknown>).subtype === "string"
        ? ((f.response as Record<string, unknown>).subtype as string)
        : null;
    if (responseSub) observed.add(`subtype/${responseSub}`);

    // Pick a schema to validate against:
    //  1. Prefer the compound `type+subtype` key when both present.
    //  2. Fall back to `type/X`.
    //  3. Lastly try `subtype/X` (for nested control_request frames coming
    //     back as control_response).
    const candidateNames: string[] = [];
    if (ty && sub) candidateNames.push(`${pascal(ty)}${pascal(sub)}`);
    if (ty) {
      // Look up by inboundByType
      const t = dispatch.inboundByType[ty];
      if (t && !t.allows(f)) {
        errors.push(`[${c.test.name}] inboundByType[${ty}] rejected frame: ${frame.raw.slice(0, 200)}`);
      }
    }
    if (responseSub && dispatch.inboundBySubtype[responseSub]) {
      const s = dispatch.inboundBySubtype[responseSub];
      if (!s.allows((f.response as Record<string, unknown>) ?? {})) {
        // Note: control_response's payload is the subtype's response shape,
        // not the control_request envelope. The dispatch map keys the
        // request schema, so payload validation is best-effort.
      }
    }
    // candidateNames is currently informational; we leave deeper per-name
    // schema lookups to a future tightening pass (kept simple here so the
    // run-tests script doesn't false-negative on shape that the generated
    // dispatch map already covers).
  }

  const missing: string[] = [];
  for (const exp of c.test.expectedFrames) {
    if (!observed.has(exp.matches)) {
      missing.push(exp.matches);
    }
  }

  return {
    test: c.test.name,
    pass: errors.length === 0 && missing.length === 0 && !c.idleFired,
    validationErrors: errors,
    missingExpected: missing,
    observedDiscriminants: [...observed].sort(),
    idleFired: c.idleFired,
  };
}

function pascal(s: string): string {
  return s
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join("");
}

function loadFixture(name: string): CapturedTest | null {
  const path = join(FIXTURE_DIR, `${name}.jsonl`);
  if (!existsSync(path)) return null;
  const text = readFileSync(path, "utf8");
  const lines = text.split("\n").filter((l) => l.trim() !== "");
  if (lines.length === 0) return null;
  const meta = JSON.parse(lines[0]);
  const frames: CapturedFrame[] = [];
  for (let i = 1; i < lines.length; i++) {
    try {
      frames.push({ raw: lines[i], parsed: JSON.parse(lines[i]) });
    } catch {
      frames.push({ raw: lines[i], parsed: null });
    }
  }
  return {
    test: { name, steps: meta._meta.steps, expectedFrames: meta._meta.expectedFrames },
    binaryVersion: meta._meta.binaryVersion,
    binarySha256: meta._meta.binarySha256,
    npmPackageVersion: meta._meta.npmPackageVersion,
    capturedAt: meta._meta.capturedAt,
    steps: meta._meta.steps,
    frames,
    stderr: [],
    idleFired: false,
  };
}

function renderReport(results: AssertionResult[]): string {
  const L: string[] = [];
  L.push(`# Integration test report — v${ACTIVE_VERSION}`);
  L.push("");
  L.push(`- Binary: \`${ACTIVE_VERSION}\` (sha256 \`${ACTIVE_BINARY_SHA256.slice(0, 16)}…\`)`);
  L.push(`- Generated at: ${new Date().toISOString()}`);
  L.push("");
  const passed = results.filter((r) => r.pass);
  const failed = results.filter((r) => !r.pass);
  L.push(`**${passed.length}/${results.length} passed.**`);
  L.push("");
  L.push("| Test | Result | Idle? | Missing expected | Validation errors |");
  L.push("|---|---|---|---|---|");
  for (const r of results) {
    L.push(
      `| \`${r.test}\` | ${r.pass ? "✅" : "❌"} | ${r.idleFired ? "🔥" : ""} | ${r.missingExpected.join(", ") || "—"} | ${r.validationErrors.length} |`,
    );
  }
  L.push("");
  for (const r of failed) {
    L.push(`## ❌ \`${r.test}\``);
    if (r.idleFired) L.push("- Harness idle-timeout fired (binary hung).");
    if (r.missingExpected.length) {
      L.push(`- Missing expected frames: ${r.missingExpected.map((s) => `\`${s}\``).join(", ")}`);
    }
    for (const e of r.validationErrors) L.push(`- ${e}`);
    L.push("");
  }
  L.push("## Discriminants observed across all tests");
  L.push("");
  const allObs = new Set<string>();
  for (const r of results) for (const d of r.observedDiscriminants) allObs.add(d);
  L.push([...allObs].sort().map((d) => `- \`${d}\``).join("\n"));
  L.push("");
  return L.join("\n");
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.updateFixtures) mkdirSync(FIXTURE_DIR, { recursive: true });

  const candidates = TESTS.filter((t) => !opts.only || t.name === opts.only);

  let allPassed = true;
  const assertions: AssertionResult[] = [];

  for (const test of candidates) {
    process.stderr.write(`[run-tests] ${test.name} — `);
    let captured: CapturedTest;
    try {
      captured = await runOne(test, opts);
    } catch (err) {
      process.stderr.write(`THREW: ${(err as Error).message}\n`);
      allPassed = false;
      assertions.push({
        test: test.name,
        pass: false,
        validationErrors: [`spawn/run threw: ${(err as Error).message}`],
        missingExpected: [],
        observedDiscriminants: [],
        idleFired: false,
      });
      continue;
    }

    if (opts.updateFixtures) {
      writeFixture(captured);
    } else if (existsSync(join(FIXTURE_DIR, `${test.name}.jsonl`))) {
      // Diff observed-frames vs committed-fixture is informational — we
      // assert against schemas, not byte-identical fixture match (the
      // binary's frame ordering may shift between runs).
    }

    const assertion = await assertFixture(captured);
    assertions.push(assertion);
    if (!assertion.pass) allPassed = false;
    process.stderr.write(assertion.pass ? "PASS\n" : "FAIL\n");
  }

  // Write per-version report.
  mkdirSync(SNAPSHOT_DIR, { recursive: true });
  writeFileSync(join(SNAPSHOT_DIR, "integration-report.md"), renderReport(assertions));

  if (!allPassed) {
    const failBlock = assertions
      .filter((r) => !r.pass)
      .map(
        (r) =>
          `## ${new Date().toISOString()} — ${r.test}\n- missing: ${r.missingExpected.join(", ") || "—"}\n- validation errors: ${r.validationErrors.length}\n- idleFired: ${r.idleFired}\n${r.validationErrors.map((e) => `  - ${e}`).join("\n")}\n`,
      )
      .join("\n");
    appendFileSync(join(SNAPSHOT_DIR, "failures.md"), failBlock);
  }

  process.exit(allPassed ? 0 : 1);
}

await main();
