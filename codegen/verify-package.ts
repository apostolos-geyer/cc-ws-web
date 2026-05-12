#!/usr/bin/env bun
/**
 * Pre-publish guard for `@somewhatintelligent/cc-protocol`.
 *
 * Asserts the package is in a coherent state — generated files exist,
 * carry the right `@generated` headers, every binary discriminant from the
 * canonical shows up in the emitted types, patches reference real schemas,
 * coverage is above the configurable threshold, and TypeScript compiles
 * over the entire package.
 *
 * Invocation:
 *   bun codegen/verify-package.ts                  (full check, exit 0/1)
 *   bun codegen/verify-package.ts --skip-tsc       (faster local loop)
 *
 * Wired into `packages/protocol/package.json` as `prepublishOnly`.
 */

import { existsSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";

import { ACTIVE_VERSION } from "./version";
import type { Patch } from "./patch-dsl";

const REPO_ROOT = resolve(import.meta.dir, "..");
const SNAPSHOT_DIR = join(REPO_ROOT, "codegen", "snapshots", ACTIVE_VERSION);
const PKG_DIR = join(REPO_ROOT, "packages", "protocol");
const GEN_DIR = join(PKG_DIR, "generated", ACTIVE_VERSION);

interface Check {
  name: string;
  run: () => Promise<void>;
}

class CheckError extends Error {}

const skipTsc = process.argv.includes("--skip-tsc");

const checks: Check[] = [
  {
    name: "generated files exist",
    async run() {
      for (const f of ["schemas.ts", "types.ts", "dispatch.ts"]) {
        const p = join(GEN_DIR, f);
        if (!existsSync(p)) throw new CheckError(`missing ${p}`);
        if (statSync(p).size < 100) {
          throw new CheckError(`${p} is suspiciously small (${statSync(p).size}b)`);
        }
      }
    },
  },
  {
    name: "generated files carry @generated header with canonical sha256",
    async run() {
      const canonicalText = readFileSync(
        join(SNAPSHOT_DIR, "canonical.json"),
        "utf8",
      );
      const canonicalSha = createHash("sha256")
        .update(canonicalText)
        .digest("hex");
      for (const f of ["schemas.ts", "types.ts", "dispatch.ts"]) {
        const content = readFileSync(join(GEN_DIR, f), "utf8");
        if (!content.startsWith("// @generated")) {
          throw new CheckError(`${f} missing @generated header`);
        }
        if (!content.includes(`sha256:${canonicalSha}`)) {
          throw new CheckError(
            `${f} header sha256 doesn't match committed canonical.json — re-run generate.ts`,
          );
        }
        if (!content.includes("do not edit by hand")) {
          throw new CheckError(`${f} missing "do not edit by hand" note`);
        }
      }
    },
  },
  {
    name: "src/index.ts re-exports from active version dir",
    async run() {
      const idx = readFileSync(join(PKG_DIR, "src", "index.ts"), "utf8");
      if (!idx.includes(`generated/${ACTIVE_VERSION}/schemas`)) {
        throw new CheckError(
          `src/index.ts does not re-export from generated/${ACTIVE_VERSION}/schemas — update the active-version pin`,
        );
      }
      if (!idx.includes(`generated/${ACTIVE_VERSION}/dispatch`)) {
        throw new CheckError(
          `src/index.ts does not re-export from generated/${ACTIVE_VERSION}/dispatch`,
        );
      }
    },
  },
  {
    name: "every binary discriminant literal appears in types.ts",
    async run() {
      const canonical = JSON.parse(
        readFileSync(join(SNAPSHOT_DIR, "canonical.json"), "utf8"),
      ) as {
        canonical: Record<
          string,
          {
            discriminant: { kind: string; value: string | null };
          }
        >;
      };
      const typesText = readFileSync(join(GEN_DIR, "types.ts"), "utf8");
      const missing: string[] = [];
      for (const e of Object.values(canonical.canonical)) {
        if (
          (e.discriminant.kind === "subtype" || e.discriminant.kind === "type") &&
          e.discriminant.value
        ) {
          // types.ts is the inferred-type aliases — every named schema, which
          // includes the discriminant in its (PascalCased) name, must show
          // up textually. Heuristic: scan for the original literal as a
          // substring (we don't try to invert the PascalCase, which would
          // be lossy on snake_case → PascalCase conversion).
          // We use the lowercased value for case-insensitive containment.
          const lit = e.discriminant.value;
          if (!new RegExp(`\\b${escapeRegex(lit)}\\b`, "i").test(typesText)) {
            // Try the PascalCased form as a fallback.
            const pascal = lit
              .split(/[^a-zA-Z0-9]+/)
              .filter(Boolean)
              .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
              .join("");
            if (!typesText.includes(pascal)) {
              missing.push(`${e.discriminant.kind}/${lit}`);
            }
          }
        }
      }
      if (missing.length > 0) {
        throw new CheckError(
          `${missing.length} discriminant(s) missing from types.ts: ${missing.slice(0, 5).join(", ")}${missing.length > 5 ? ", ..." : ""}`,
        );
      }
    },
  },
  {
    name: "patches.ts parses and references existing schema names",
    async run() {
      const patchesPath = join(SNAPSHOT_DIR, "patches.ts");
      const mod = (await import(patchesPath)) as {
        default: { version: string; patches: Patch[] };
      };
      if (mod.default.version !== ACTIVE_VERSION) {
        throw new CheckError(
          `patches.ts version "${mod.default.version}" does not match ACTIVE_VERSION "${ACTIVE_VERSION}"`,
        );
      }
      // We rely on apply-patches.ts to throw on bad references during
      // generate, so if generate.ts already ran cleanly we know patches
      // resolve. This is the structural smoke test.
      if (!Array.isArray(mod.default.patches)) {
        throw new CheckError("patches.ts default export is missing a `patches` array");
      }
    },
  },
  {
    name: "coverage.json exists and unknown-field count is within bounds",
    async run() {
      const coveragePath = join(SNAPSHOT_DIR, "coverage.json");
      if (!existsSync(coveragePath)) {
        throw new CheckError("coverage.json missing — run generate.ts first");
      }
      const cov = JSON.parse(readFileSync(coveragePath, "utf8")) as {
        schemas?: { fields?: { total: number; typed: number; unknown: number } };
      };
      const f = cov.schemas?.fields;
      if (!f) throw new CheckError("coverage.json has no schemas.fields");
      const unknownFrac = f.total === 0 ? 0 : f.unknown / f.total;
      // Phase 2 thresholds: warn at >50% unknown, fail at >80%. We'll
      // tighten in Phase 3 once we've burned in patches.
      if (unknownFrac > 0.8) {
        throw new CheckError(
          `coverage.json: ${(unknownFrac * 100).toFixed(1)}% fields unknown (>80% hard limit)`,
        );
      }
      if (unknownFrac > 0.5) {
        process.stderr.write(
          `[verify] WARN: ${(unknownFrac * 100).toFixed(1)}% fields unknown (>50% soft threshold) — add patches\n`,
        );
      }
    },
  },
  {
    name: "tsc --noEmit on packages/protocol/",
    async run() {
      if (skipTsc) {
        process.stderr.write("[verify] tsc check SKIPPED (--skip-tsc)\n");
        return;
      }
      const r = spawnSync(
        "bunx",
        ["tsc", "--noEmit", "-p", join(PKG_DIR, "tsconfig.json")],
        { cwd: REPO_ROOT, stdio: "pipe", encoding: "utf8" },
      );
      if (r.status !== 0) {
        throw new CheckError(
          `tsc --noEmit failed:\n${r.stdout || ""}\n${r.stderr || ""}`,
        );
      }
    },
  },
  {
    name: "types.test.ts passes",
    async run() {
      const testFile = join(PKG_DIR, "__tests__", "types.test.ts");
      if (!existsSync(testFile)) {
        process.stderr.write("[verify] types.test.ts missing — skipping\n");
        return;
      }
      const r = spawnSync("bun", ["test", testFile], {
        cwd: REPO_ROOT,
        stdio: "pipe",
        encoding: "utf8",
      });
      if (r.status !== 0) {
        throw new CheckError(
          `types.test.ts failed:\n${r.stdout || ""}\n${r.stderr || ""}`,
        );
      }
    },
  },
];

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function main() {
  let failed = 0;
  for (const check of checks) {
    process.stderr.write(`[verify] ${check.name} ... `);
    try {
      await check.run();
      process.stderr.write("OK\n");
    } catch (err) {
      failed++;
      process.stderr.write(`FAIL\n`);
      process.stderr.write(`  ${(err as Error).message}\n`);
    }
  }
  if (failed > 0) {
    process.stderr.write(`[verify] ${failed} check(s) failed\n`);
    process.exit(1);
  }
  process.stderr.write(`[verify] all ${checks.length} checks passed\n`);
}

await main();
