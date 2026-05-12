#!/usr/bin/env bun
/**
 * Codegen driver — turns the canonical + patches for the active version into
 * three committed TypeScript files under
 * `packages/protocol/generated/<ACTIVE_VERSION>/`:
 *
 *   - `schemas.ts`   : top-level arktype `const X = type({...})` declarations.
 *   - `types.ts`     : `export type X = typeof X.infer` for each named schema.
 *   - `dispatch.ts`  : O(1) discriminator-keyed maps (subtype/X → schema,
 *                     type/X → schema) for the Phase 3 ClaudeProcess.
 *
 * The output is byte-stable: running generate twice with no input changes
 * produces identical bytes (idempotence is part of Checkpoint #1). Stable
 * sort order on schemas + deterministic-only translation makes that hold.
 *
 * Per-field translation walks the canonical's `rhs` expression strings (the
 * extractor's V2 record of each `<zod>.<call>(...)` body) and lowers them to
 * arktype expressions. Patterns we handle:
 *
 *   <ns>.string()                 → "string"
 *   <ns>.string().optional()      → " ?" key + "string"
 *   <ns>.string().nullable()      → "string | null"
 *   <ns>.boolean(), .number()     → "boolean", "number"
 *   <ns>.literal("X")             → "'X'"
 *   <ns>.literal(true|false|0|1)  → "true"|"false"|"0"|"1"
 *   <ns>.array(<inner>)           → inner + "[]"  (when inner is primitive)
 *   <ns>.array(<NamedSchema()>)   → cross-ref array
 *   <ns>.enum([...])              → "'a' | 'b' | ..."
 *   <ns>.lazy(()=> Ident())       → cross-ref
 *   Ident()                       → cross-ref (bare call expression)
 *   <ns>.record(k, v)             → Record-like shape
 *   <ns>.unknown(), .any()        → "unknown"
 *   <ns>.null()                   → "null"
 *
 * Anything we can't translate falls through to `"unknown"` and gets reported
 * in the coverage summary so a patch author knows exactly which fields still
 * need an override. Patched fields (sentinel `__PATCH__:`) skip translation
 * and use the patch's arktype expression literally.
 *
 * Invocation:
 *   bun codegen/generate.ts
 *
 * Exits non-zero when:
 *   - any discriminant-keyed schema (subtype/X or type/X+subtype/Y) has zero
 *     typed fields (forces the author to write at least one patch per
 *     discriminator — empty union members are a lurking footgun).
 *
 * Writes `codegen/snapshots/<ACTIVE_VERSION>/coverage.json` alongside the
 * generated files; prints a coverage summary on stderr.
 */

import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { createHash } from "node:crypto";

import {
  applyPatches,
  type AnnotatedCanonical,
  type AnnotatedSchema,
  type CanonicalSnapshot,
} from "./apply-patches";
import { ACTIVE_VERSION } from "./version";
import type { Patch } from "./patch-dsl";

const REPO_ROOT = resolve(import.meta.dir, "..");
const SNAPSHOT_DIR = join(REPO_ROOT, "codegen", "snapshots", ACTIVE_VERSION);
const OUT_DIR = join(
  REPO_ROOT,
  "packages",
  "protocol",
  "generated",
  ACTIVE_VERSION,
);

/**
 * Result of translating one canonical RHS into an arktype expression.
 *
 * `kind` distinguishes how the result must be embedded in an enclosing object
 * literal:
 *   - `"string"` : a valid arktype DSL string (e.g. `"string"`, `"'X'"`,
 *                  `"Record<string, string>"`, `"string[]"`). Embeds as a
 *                  JS string literal: `"foo": '<value>'`.
 *   - `"expr"`   : a JavaScript expression (e.g. a bare identifier
 *                  `AnonX` or a method-call chain `AnonX.array()` or an
 *                  inline `{ "[string]": AnonX }`). Embeds verbatim:
 *                  `"foo": <value>`.
 *   - `"never"`  : an `arktype` schema sub-expression that itself returns a
 *                  schema (e.g. `type.Record(...)`). Same handling as `expr`.
 */
type ArktypeExpression =
  | { kind: "string"; value: string }
  | { kind: "expr"; value: string };

interface PerFieldResult {
  fieldName: string;
  optional: boolean;
  /** The arktype expression as it ends up rendered into schemas.ts. */
  arktype: string;
  /** Original RHS string (for error reporting); null when patched. */
  rhs: string | null;
  /** True when generator fell through to "unknown" because no rule matched. */
  unresolved: boolean;
}

interface PerSchemaResult {
  key: string;
  emittedName: string;
  schemaKind: string;
  expression: string;
  isReference: boolean;
  fields: PerFieldResult[];
  unresolvedFieldCount: number;
  typedFieldCount: number;
  isDiscriminantKeyed: boolean;
  /** Other emittedNames this schema references (for topological sort). */
  references: string[];
}

async function main() {
  const canonicalPath = join(SNAPSHOT_DIR, "canonical.json");
  const patchesPath = join(SNAPSHOT_DIR, "patches.ts");
  const canonicalRaw = readFileSync(canonicalPath, "utf8");
  const canonical: CanonicalSnapshot = JSON.parse(canonicalRaw);
  const canonicalSha = createHash("sha256")
    .update(canonicalRaw)
    .digest("hex");

  const patchModule = (await import(patchesPath)) as {
    default: { version: string; patches: Patch[] };
  };
  if (patchModule.default.version !== ACTIVE_VERSION) {
    throw new Error(
      `[generate] patches.ts version "${patchModule.default.version}" does not match ACTIVE_VERSION "${ACTIVE_VERSION}"`,
    );
  }
  const annotated = applyPatches(canonical, patchModule.default.patches);

  const schemas: PerSchemaResult[] = [];
  for (const [, entry] of annotated.entries) {
    schemas.push(emitSchema(entry, annotated));
  }
  // Topological sort: a schema must be declared before any other schema that
  // references it. arktype evaluates `type({...})` eagerly at module load,
  // so forward refs throw `ReferenceError`. Falls back to alphabetical order
  // for ties (deterministic; same input → same output).
  const sorted = topoSort(schemas);
  schemas.length = 0;
  schemas.push(...sorted);

  mkdirSync(OUT_DIR, { recursive: true });

  writeFileSync(join(OUT_DIR, "schemas.ts"), renderSchemasTs(schemas, canonicalSha));
  writeFileSync(join(OUT_DIR, "types.ts"), renderTypesTs(schemas, canonicalSha));
  writeFileSync(
    join(OUT_DIR, "dispatch.ts"),
    renderDispatchTs(annotated, canonicalSha),
  );

  const coverage = computeCoverage(schemas, annotated.appliedPatchCount);
  writeFileSync(
    join(SNAPSHOT_DIR, "coverage.json"),
    JSON.stringify(coverage, null, 2) + "\n",
  );

  // Print stderr summary.
  const totalFields = coverage.schemas.fields.total;
  const typedFields = coverage.schemas.fields.typed;
  const unknownFields = totalFields - typedFields;
  process.stderr.write(
    `[generate] ${typedFields}/${totalFields} fields typed (${unknownFields} unknown); ` +
      `${coverage.patchesApplied} patches applied; ` +
      `${coverage.schemas.discriminantKeyed.fullyTyped}/${coverage.schemas.discriminantKeyed.total} ` +
      `discriminant-keyed schemas fully typed\n`,
  );
  if (unknownFields > 0) {
    process.stderr.write(
      `[generate] ${coverage.unknownFields.slice(0, 10).map((f) => `${f.schema}.${f.field}`).join(", ")}` +
        (coverage.unknownFields.length > 10 ? `, ...` : "") +
        ` — see codegen/snapshots/${ACTIVE_VERSION}/coverage.json for the full list (add fieldType patches in patches.ts)\n`,
    );
  }

  // Hard gate: any discriminant-keyed schema with zero typed fields = exit non-zero.
  const zeroFieldDiscrim = schemas.filter(
    (s) =>
      s.isDiscriminantKeyed &&
      s.schemaKind === "object" &&
      s.fields.length > 0 &&
      s.typedFieldCount === 0,
  );
  if (zeroFieldDiscrim.length > 0) {
    process.stderr.write(
      `[generate] FAIL: discriminant-keyed schemas with ZERO typed fields — author at least one patch per:\n`,
    );
    for (const s of zeroFieldDiscrim) {
      process.stderr.write(`  - ${s.emittedName} (${s.key})\n`);
    }
    process.exit(2);
  }
}

// ============================================================================
// Per-field translation
// ============================================================================

/**
 * Parse a single canonical RHS expression string into an arktype expression
 * plus an "optional" flag. Returns `null` when no rule matched (caller fills
 * in `"unknown"` and flags coverage).
 *
 * The returned expression carries a `kind` discriminator (`"string"` /
 * `"expr"`) so the schema emitter knows whether to render the value as a
 * quoted arktype-DSL string or as a bare JavaScript expression.
 */
function translateRhs(
  rhs: string,
  annotated: AnnotatedCanonical,
): { arktype: ArktypeExpression; optional: boolean } | null {
  // Patched RHS (sentinel applied by apply-patches): trust the patch's
  // arktype literal verbatim — these are author-vetted strings.
  if (rhs.startsWith("__PATCH__:")) {
    const rest = rhs.slice("__PATCH__:".length);
    // Patches default to the "string" embedding (quoted arktype DSL string).
    // Authors who need a JS-expression embedding (e.g. cross-references to
    // another schema constant) can prefix with `expr:` — we'll detect and
    // strip it here. Authors marking optional fields append `?`.
    let body = rest;
    let optional = false;
    if (body.endsWith("?")) {
      optional = true;
      body = body.slice(0, -1);
    }
    if (body.startsWith("expr:")) {
      return { arktype: { kind: "expr", value: body.slice("expr:".length) }, optional };
    }
    return { arktype: { kind: "string", value: body }, optional };
  }

  // Strip `.describe(...)` wrappers — they're documentation, not structure.
  let body = rhs;
  body = stripCallSuffix(body, "describe");

  // Detect trailing `.optional()`.
  let optional = false;
  while (body.endsWith(".optional()")) {
    optional = true;
    body = body.slice(0, -".optional()".length);
  }

  // Detect trailing `.nullable()`.
  let nullable = false;
  while (body.endsWith(".nullable()")) {
    nullable = true;
    body = body.slice(0, -".nullable()".length);
  }

  // `.nullish()` is a Zod shorthand for `.nullable().optional()`.
  while (body.endsWith(".nullish()")) {
    optional = true;
    nullable = true;
    body = body.slice(0, -".nullish()".length);
  }

  // Strip further trailing wrappers we don't model. These zod calls don't
  // change the structural shape; arktype either has equivalents (we punt on
  // them for now) or treats the underlying type as-is.
  for (const w of [
    "default",
    "catch",
    "min",
    "max",
    "int",
    "positive",
    "negative",
    "trim",
    "url",
    "email",
    "uuid",
    "regex",
    "refine",
    "transform",
    "pipe",
    "brand",
    "readonly",
  ]) {
    body = stripCallSuffix(body, w);
  }

  const inner = translateInner(body, annotated);
  if (!inner) return null;

  if (nullable) {
    // Lift nullable into the expression: only valid for string-kind exprs;
    // for expr-kind we wrap with `.or("null")` chain (arktype's `.or` accepts
    // an arktype expression on the rhs). Inline object literals are wrapped
    // in `type(...)` first so they have an `.or` method.
    if (inner.kind === "string") {
      return { arktype: { kind: "string", value: `${inner.value} | null` }, optional };
    }
    return {
      arktype: { kind: "expr", value: `${asSchemaExpr(inner.value)}.or("null")` },
      optional,
    };
  }

  return { arktype: inner, optional };
}

/**
 * Lift a JS expression to a "schema" expression — i.e. something with
 * arktype `Type`-like methods (`.or`, `.array`, ...). Bare identifiers
 * (schema constants) pass through; everything else is wrapped in `type(...)`.
 */
function asSchemaExpr(expr: string): string {
  if (/^[A-Z][\w$]*$/.test(expr)) return expr;
  return `type(${expr})`;
}

/**
 * Translate the inner non-optional, non-nullable, non-describe expression.
 */
function translateInner(
  body: string,
  annotated: AnnotatedCanonical,
): ArktypeExpression | null {
  const nsRe = /^([A-Za-z_$][\w$]{0,3})\./;

  // Zero-arg primitives: <ns>.<prim>()
  for (const prim of ["string", "boolean", "number", "bigint", "date", "unknown", "any", "null", "undefined", "void", "never"]) {
    if (new RegExp(`^${nsRe.source}${prim}\\(\\)$`).test(body)) {
      switch (prim) {
        case "string":
          return { kind: "string", value: "string" };
        case "boolean":
          return { kind: "string", value: "boolean" };
        case "number":
          return { kind: "string", value: "number" };
        case "bigint":
          return { kind: "string", value: "bigint" };
        case "date":
          return { kind: "string", value: "Date" };
        case "any":
        case "unknown":
          return { kind: "string", value: "unknown" };
        case "null":
          return { kind: "string", value: "null" };
        case "undefined":
          return { kind: "string", value: "undefined" };
        case "void":
          return { kind: "string", value: "undefined" };
        case "never":
          return { kind: "string", value: "never" };
      }
    }
  }

  // <ns>.literal(<value>)
  const litMatch = body.match(/^([A-Za-z_$][\w$]{0,3})\.literal\((.*)\)$/s);
  if (litMatch) {
    const value = litMatch[2];
    const strLit = value.match(/^"([^"\\]*(?:\\.[^"\\]*)*)"$/);
    if (strLit) return { kind: "string", value: `'${strLit[1].replace(/'/g, "\\'")}'` };
    const sqLit = value.match(/^'([^'\\]*(?:\\.[^'\\]*)*)'$/);
    if (sqLit) return { kind: "string", value: `'${sqLit[1]}'` };
    // Zod compiles `true` to `!0`, `false` to `!1` in the bundled artifact.
    if (value === "!0") return { kind: "string", value: "true" };
    if (value === "!1") return { kind: "string", value: "false" };
    if (value === "true") return { kind: "string", value: "true" };
    if (value === "false") return { kind: "string", value: "false" };
    if (/^-?\d+(\.\d+)?$/.test(value)) return { kind: "string", value };
    return null;
  }

  // <ns>.enum([...]) — translate only when every entry is a string literal.
  const enumMatch = body.match(/^([A-Za-z_$][\w$]{0,3})\.enum\(\[(.*)\]\)$/s);
  if (enumMatch) {
    const items = splitTopLevel(enumMatch[2], ",")
      .map((s) => s.trim())
      .filter(Boolean);
    const lits: string[] = [];
    for (const it of items) {
      const sl = it.match(/^"([^"\\]*(?:\\.[^"\\]*)*)"$/);
      if (sl) {
        lits.push(`'${sl[1].replace(/'/g, "\\'")}'`);
        continue;
      }
      const sql = it.match(/^'([^'\\]*(?:\\.[^'\\]*)*)'$/);
      if (sql) {
        lits.push(`'${sql[1]}'`);
        continue;
      }
      return null;
    }
    return lits.length > 0 ? { kind: "string", value: lits.join(" | ") } : null;
  }

  // <ns>.array(<inner>)
  const arrMatch = body.match(/^([A-Za-z_$][\w$]{0,3})\.array\((.*)\)$/s);
  if (arrMatch) {
    const inner = translateInner(arrMatch[2], annotated);
    if (!inner) return null;
    if (inner.kind === "string") {
      // arktype "T[]" — wrap unions / multi-token in parens for proper precedence.
      const needsParen = /[\s|]/.test(inner.value) && !inner.value.startsWith("(");
      const v = needsParen ? `(${inner.value})[]` : `${inner.value}[]`;
      return { kind: "string", value: v };
    }
    // Expression-kind inner. If it's a single identifier (a schema constant),
    // we can call `.array()` directly. Otherwise it's an inline object/record
    // literal that needs to be wrapped with `type(...)` first so we have a
    // schema to call `.array()` on.
    if (/^[A-Z][\w$]*$/.test(inner.value)) {
      return { kind: "expr", value: `${inner.value}.array()` };
    }
    return { kind: "expr", value: `type(${inner.value}).array()` };
  }

  // <ns>.record(<k>?, <v>)
  const recMatch = body.match(/^([A-Za-z_$][\w$]{0,3})\.record\((.*)\)$/s);
  if (recMatch) {
    const args = splitTopLevel(recMatch[2], ",");
    let v: ArktypeExpression | null;
    let k: ArktypeExpression | null = { kind: "string", value: "string" };
    if (args.length === 1) {
      v = translateInner(args[0].trim(), annotated);
    } else if (args.length === 2) {
      k = translateInner(args[0].trim(), annotated);
      v = translateInner(args[1].trim(), annotated);
    } else {
      return null;
    }
    if (!v || !k) return null;
    // arktype represents records as `{ "[<keyType>]": <valueType> }`.
    // When the value is a quoted arktype-DSL string with no schema refs we
    // can also use the equivalent `Record<keyType, valueType>` string form.
    if (
      v.kind === "string" &&
      k.kind === "string" &&
      !needsExprEmbed(v.value) &&
      !needsExprEmbed(k.value)
    ) {
      return { kind: "string", value: `Record<${k.value}, ${v.value}>` };
    }
    // Build an inline JS object literal that arktype's `type({...})` accepts:
    //   { "[string]": <valueSchema> }
    // The key is the literal property name `"[<keyArkType>]"` (a string), not a
    // computed-property expression — arktype uses string-keyed object props
    // for index signatures.
    const keyInner = k.kind === "string" ? k.value : "string";
    const valExpr = v.kind === "string" ? `"${v.value}"` : v.value;
    return {
      kind: "expr",
      value: `{ "[${keyInner}]": ${valExpr} }`,
    };
  }

  // <ns>.lazy(()=> <inner>) — purely a wrapper; recurse.
  const lazyMatch = body.match(/^([A-Za-z_$][\w$]{0,3})\.lazy\(\(\)=>(.*)\)$/s);
  if (lazyMatch) {
    return translateInner(lazyMatch[2].trim(), annotated);
  }

  // <ns>.union([a, b, ...])
  const unionMatch = body.match(/^([A-Za-z_$][\w$]{0,3})\.union\(\[(.*)\]\)$/s);
  if (unionMatch) {
    const members = splitTopLevel(unionMatch[2], ",")
      .map((s) => s.trim())
      .filter(Boolean);
    const translated: ArktypeExpression[] = [];
    for (const m of members) {
      const t = translateInner(m, annotated);
      if (!t) return null;
      translated.push(t);
    }
    if (translated.length === 0) return null;
    const allString = translated.every((t) => t.kind === "string");
    if (allString) {
      return { kind: "string", value: translated.map((t) => t.value).join(" | ") };
    }
    // Mixed: chain `.or(...)` calls. Each non-first member must be either a
    // schema reference (expr) or a quoted DSL string.
    const head = translated[0];
    const headExpr =
      head.kind === "expr"
        ? asSchemaExpr(head.value)
        : asTypeCallString(head.value);
    const tail = translated.slice(1).map((t) => {
      const arg = t.kind === "expr" ? t.value : `"${t.value}"`;
      return `.or(${arg})`;
    });
    return { kind: "expr", value: `${headExpr}${tail.join("")}` };
  }

  // Bare named-call cross-reference: `Ident()`.
  const callMatch = body.match(/^([A-Za-z_$][\w$]{0,5})\(\)$/);
  if (callMatch) {
    const ident = callMatch[1];
    for (const entry of annotated.entries.values()) {
      if (entry.minifiedIdThisVersion === ident) {
        return { kind: "expr", value: entry.emittedName };
      }
    }
    return null;
  }

  // Single-arg wrapper call: `Ident(<inner>)`. Common for helper wrappers
  // like `iI(...)` or `oI(...)` in the bundled artifact that re-wrap a
  // Zod expression with a tag for runtime behavior. The structural shape
  // is the inner type, so recurse on the inner.
  const wrapMatch = body.match(/^[A-Za-z_$][\w$]{0,5}\((.*)\)$/s);
  if (wrapMatch) {
    return translateInner(wrapMatch[1].trim(), annotated);
  }

  // Inline object: `<ns>.object({ k:<rhs>, ... })` /
  //                `<ns>.strictObject({ ... })` / `<ns>.looseObject({ ... })`.
  // Parsing nested objects lets us type the many anonymous-shape fields that
  // would otherwise need a dedicated patch. We only succeed when *every*
  // field translates; one unresolved field flips the whole inline shape to
  // `null` (and the caller falls back to `"unknown"`).
  const objMatch = body.match(
    /^([A-Za-z_$][\w$]{0,3})\.(object|strictObject|looseObject)\(\{(.*)\}\)$/s,
  );
  if (objMatch) {
    const inner = objMatch[3];
    const parsedFields = parseInlineObjectFields(inner);
    if (!parsedFields) return null;
    const parts: string[] = [];
    for (const { name, rhs: fRhs } of parsedFields) {
      const t = translateRhs(fRhs, annotated);
      if (!t) return null;
      const key = t.optional ? `"${name}?"` : `"${name}"`;
      parts.push(
        t.arktype.kind === "expr"
          ? `${key}: ${t.arktype.value}`
          : `${key}: "${t.arktype.value}"`,
      );
    }
    // We always return the JS-object form regardless of whether every field
    // is a primitive string kind — avoids escape headaches and parses the
    // same in arktype.
    return { kind: "expr", value: `{ ${parts.join(", ")} }` };
  }

  // Other structural calls we don't try to parse in V1.
  if (
    /^([A-Za-z_$][\w$]{0,3})\.(discriminatedUnion|preprocess|partialRecord|tuple|intersection|template|never|symbol|function|promise|instanceof)\b/.test(
      body,
    )
  ) {
    return null;
  }

  return null;
}

/**
 * Parse a comma-separated list of `<fieldName>:<rhs>` pairs from inside an
 * inline `<ns>.object({ ... })` body. Returns `null` when any pair is shaped
 * unexpectedly (e.g. computed-key syntax that V1 doesn't model).
 */
function parseInlineObjectFields(
  body: string,
): Array<{ name: string; rhs: string }> | null {
  const pairs = splitTopLevel(body, ",");
  const out: Array<{ name: string; rhs: string }> = [];
  for (const raw of pairs) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    // Match `<name>:<rhs>` with `<name>` either bare or quoted.
    const m = trimmed.match(/^(?:"([^"\\]+)"|'([^'\\]+)'|([A-Za-z_$][\w$]*))\s*:\s*([\s\S]+)$/);
    if (!m) return null;
    const name = m[1] ?? m[2] ?? m[3];
    out.push({ name, rhs: m[4] });
  }
  return out;
}

/**
 * Wrap an arktype DSL string as a `type("...")` call expression for use as
 * the head of a `.or(...)` chain.
 */
function asTypeCallString(s: string): string {
  return `type("${s.replace(/"/g, '\\"')}")`;
}

/**
 * Heuristic: does this arktype DSL string contain a non-built-in name that
 * arktype's string parser can't resolve? If yes, we must embed the value as
 * a JS expression instead of inlining it as a string. Built-in tokens:
 *   - primitive names (string, number, boolean, …)
 *   - literal quoted forms ('X')
 *   - structural keywords (Record, null, unknown, …)
 *
 * Anything else — a Pascal-cased word — is assumed to be a generated
 * schema name and forces an expression embedding.
 */
function needsExprEmbed(s: string): boolean {
  return /\b[A-Z][A-Za-z0-9_]*\b/.test(s.replace(/Record\b/g, ""));
}

/**
 * Remove a single `.<name>(<args>)` suffix (with balanced parens) from the
 * end of an expression. Used to strip `.describe(...)`, `.default(...)` etc.
 * Returns the body unchanged if no such suffix is present.
 */
function stripCallSuffix(body: string, name: string): string {
  const needle = `.${name}(`;
  let depth = 0;
  // Search for the right-most `.<name>(` such that the suffix matches up to the very end with balanced parens.
  for (let i = body.length - 1; i >= 0; i--) {
    const ch = body[i];
    if (ch === ")") depth++;
    else if (ch === "(") depth--;
    if (depth === 0 && body.startsWith(needle, i - needle.length + 1)) {
      // Check that the body after the closing paren is exactly empty.
      const start = i - needle.length + 1;
      // Find matching closing paren walking forward from `start + needle.length - 1` (the `(` position).
      let d = 0;
      let j = start + needle.length - 1;
      for (; j < body.length; j++) {
        if (body[j] === "(") d++;
        else if (body[j] === ")") {
          d--;
          if (d === 0) break;
        }
      }
      if (j === body.length - 1) {
        return body.slice(0, start);
      }
    }
  }
  return body;
}

/**
 * Split a string by `delim`, respecting top-level only (skip nested
 * brackets / parens / strings).
 */
function splitTopLevel(s: string, delim: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let strCh: string | null = null;
  let start = 0;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (strCh) {
      if (ch === "\\") {
        i++;
        continue;
      }
      if (ch === strCh) strCh = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      strCh = ch;
      continue;
    }
    if (ch === "(" || ch === "[" || ch === "{") depth++;
    else if (ch === ")" || ch === "]" || ch === "}") depth--;
    else if (depth === 0 && ch === delim) {
      out.push(s.slice(start, i));
      start = i + 1;
    }
  }
  out.push(s.slice(start));
  return out;
}

// ============================================================================
// Per-schema emission
// ============================================================================

function emitSchema(
  entry: AnnotatedSchema,
  annotated: AnnotatedCanonical,
): PerSchemaResult {
  const isDiscriminantKeyed =
    entry.discriminant.kind === "subtype" ||
    entry.discriminant.kind === "type" ||
    !!entry.discriminantOverride;

  // Schema-kind dispatch.
  if (entry.schemaKind === "enum" && entry.enumValues && entry.enumValues.length > 0) {
    const lits = entry.enumValues.map((v) => `'${v.replace(/'/g, "\\'")}'`).join(" | ");
    return {
      key: entry.canonicalKey,
      emittedName: entry.emittedName,
      schemaKind: entry.schemaKind,
      expression: `type("${lits}")`,
      isReference: false,
      fields: [],
      unresolvedFieldCount: 0,
      typedFieldCount: 0,
      isDiscriminantKeyed,
      references: [],
    };
  }

  if (entry.schemaKind === "union" && entry.unionMemberDiscriminants.length > 0) {
    // Resolve each member's canonical key → emitted name.
    const memberNames: string[] = [];
    let unresolved = false;
    for (const memberKey of entry.unionMemberDiscriminants) {
      const memberEntry = annotated.entries.get(memberKey);
      if (!memberEntry) {
        unresolved = true;
        break;
      }
      memberNames.push(memberEntry.emittedName);
    }
    if (!unresolved && memberNames.length > 0) {
      // arktype `type([a, "|", b, "|", c])` syntax is fine but using strings here
      // requires the schemas in scope. We'll instead emit `<A>.or(<B>).or(<C>)`
      // to avoid the deferred string-name resolution at definition time.
      const head = memberNames[0];
      const tail = memberNames.slice(1).map((n) => `.or(${n})`).join("");
      return {
        key: entry.canonicalKey,
        emittedName: entry.emittedName,
        schemaKind: entry.schemaKind,
        expression: `${head}${tail}`,
        isReference: false,
        fields: [],
        unresolvedFieldCount: 0,
        typedFieldCount: 0,
        isDiscriminantKeyed,
        references: [...memberNames],
      };
    }
    // Fall through to the "unknown" body case below.
  }

  if (
    entry.schemaKind === "object" ||
    entry.schemaKind === "strictObject" ||
    entry.schemaKind === "looseObject"
  ) {
    const fieldResults: PerFieldResult[] = [];
    const parts: string[] = [];
    const refs = new Set<string>();
    let typed = 0;
    for (const field of entry.fields) {
      const translated = translateRhs(field.rhs, annotated);
      let pf: PerFieldResult;
      if (translated) {
        const key = translated.optional ? `'${field.name}?'` : `'${field.name}'`;
        const valueRender = renderArktypeForObjectValue(translated.arktype);
        if (translated.arktype.kind === "expr") {
          for (const id of extractIdentifiers(translated.arktype.value)) {
            refs.add(id);
          }
        }
        parts.push(`${key}: ${valueRender}`);
        pf = {
          fieldName: field.name,
          optional: translated.optional,
          arktype: valueRender,
          rhs: field.rhs,
          unresolved: false,
        };
        if (translated.arktype.value !== "unknown") typed++;
      } else {
        const key = `'${field.name}?'`;
        parts.push(`${key}: "unknown"`);
        pf = {
          fieldName: field.name,
          optional: true,
          arktype: "unknown",
          rhs: field.rhs,
          unresolved: true,
        };
      }
      fieldResults.push(pf);
    }
    return {
      key: entry.canonicalKey,
      emittedName: entry.emittedName,
      schemaKind: entry.schemaKind,
      expression: `type({${parts.length > 0 ? "\n  " + parts.join(",\n  ") + ",\n" : ""}})`,
      isReference: false,
      fields: fieldResults,
      unresolvedFieldCount: fieldResults.filter((f) => f.unresolved).length,
      typedFieldCount: typed,
      isDiscriminantKeyed,
      references: [...refs].sort(),
    };
  }

  // Fallback: unknown schema kind, opaque body. Emit as `type("unknown")`.
  return {
    key: entry.canonicalKey,
    emittedName: entry.emittedName,
    schemaKind: entry.schemaKind,
    expression: `type("unknown")`,
    isReference: false,
    fields: [],
    unresolvedFieldCount: 0,
    typedFieldCount: 0,
    isDiscriminantKeyed,
    references: [],
  };
}

/**
 * Extract emitted-name identifiers from a JS expression string. Used to
 * compute schema-dependency edges for topological sort. We match
 * Pascal-cased identifiers (the codegen's name convention) and exclude
 * built-in JS / arktype tokens.
 */
function extractIdentifiers(expr: string): string[] {
  const builtins = new Set([
    "type",
    "Type",
    "Record",
    "Array",
    "Object",
    "Date",
    "Promise",
    "Map",
    "Set",
  ]);
  const out: string[] = [];
  for (const m of expr.matchAll(/\b[A-Z][A-Za-z0-9_]*\b/g)) {
    if (!builtins.has(m[0])) out.push(m[0]);
  }
  return out;
}

/**
 * Topological sort by reference dependency. arktype evaluates `type({...})`
 * eagerly at module load, so any schema that references another must be
 * declared after that other. Cycle handling: schemas in a cycle are emitted
 * in alphabetical order — they'll throw `ReferenceError` at module load,
 * which is the correct signal that the canonical has a self-recursive shape
 * we need to patch (e.g. via inline `type.lazy()` in a fieldType patch). We
 * detect and report cycles instead of silently producing broken output.
 */
function topoSort(schemas: PerSchemaResult[]): PerSchemaResult[] {
  const byName = new Map<string, PerSchemaResult>();
  for (const s of schemas) byName.set(s.emittedName, s);

  const visited = new Set<string>();
  const onStack = new Set<string>();
  const result: PerSchemaResult[] = [];
  const cycles: string[] = [];

  // Use iterative DFS to avoid stack overflow on big graphs.
  function visit(name: string) {
    if (visited.has(name)) return;
    if (onStack.has(name)) {
      cycles.push(name);
      return;
    }
    onStack.add(name);
    const s = byName.get(name);
    if (s) {
      const deps = [...s.references].sort();
      for (const dep of deps) {
        if (byName.has(dep)) visit(dep);
      }
      visited.add(name);
      result.push(s);
    } else {
      visited.add(name);
    }
    onStack.delete(name);
  }

  const allNames = [...byName.keys()].sort();
  for (const name of allNames) visit(name);

  if (cycles.length > 0) {
    const uniq = [...new Set(cycles)].sort();
    process.stderr.write(
      `[generate] WARN: dependency cycle(s) detected involving: ${uniq.slice(0, 5).join(", ")}${uniq.length > 5 ? ", ..." : ""} — schemas in a cycle may throw at module load; add a fieldType patch to break the cycle (e.g. use "unknown" for the back-edge field)\n`,
    );
  }
  return result;
}

/**
 * Embed an `ArktypeExpression` as the value position of an object literal
 * passed to `type({...})`. `"string"`-kind values become single-quoted JS
 * string literals (the arktype DSL); `"expr"`-kind values are inlined
 * verbatim so JavaScript can evaluate them as schema references / method
 * calls / nested object literals.
 */
function renderArktypeForObjectValue(expr: ArktypeExpression): string {
  if (expr.kind === "string") {
    return `'${expr.value.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;
  }
  return expr.value;
}

// ============================================================================
// File templates
// ============================================================================

const GEN_BANNER = (canonicalSha: string) =>
  `// @generated from canonical.json sha256:${canonicalSha} — do not edit by hand.
// Source: codegen/snapshots/${ACTIVE_VERSION}/canonical.json
// Regenerate with: bun codegen/generate.ts
//
// The active Claude Code binary version is ${ACTIVE_VERSION}. The Phase 3
// engine (ClaudeProcess) consumes this file's exports via the dispatch map.
`;

function renderSchemasTs(schemas: PerSchemaResult[], canonicalSha: string): string {
  const lines: string[] = [];
  lines.push(GEN_BANNER(canonicalSha));
  lines.push(`import { type } from "arktype";`);
  lines.push("");
  for (const s of schemas) {
    // Top-level `const` declarations. Marked `/* @__PURE__ */` so tree-shakers
    // can drop unused schemas in browser builds.
    const decl = `/* @__PURE__ */ export const ${s.emittedName} = ${s.expression};`;
    lines.push(decl);
  }
  lines.push("");
  return lines.join("\n");
}

function renderTypesTs(schemas: PerSchemaResult[], canonicalSha: string): string {
  const lines: string[] = [];
  lines.push(GEN_BANNER(canonicalSha));
  lines.push(`import type * as Schemas from "./schemas";`);
  lines.push("");
  for (const s of schemas) {
    lines.push(`export type ${s.emittedName} = typeof Schemas.${s.emittedName}.infer;`);
  }
  lines.push("");
  return lines.join("\n");
}

function renderDispatchTs(
  annotated: AnnotatedCanonical,
  canonicalSha: string,
): string {
  const lines: string[] = [];
  lines.push(GEN_BANNER(canonicalSha));
  lines.push(`import * as Schemas from "./schemas";`);
  lines.push(`import type { Type } from "arktype";`);
  lines.push("");
  lines.push(`/** Schemas keyed by their wire-format subtype literal (control_request / control_response payloads). */`);
  lines.push(`export const inboundBySubtype: Record<string, Type> = {`);
  // Multiple canonical keys can map to the same wire-discriminator literal
  // (e.g. `subtype/success` and `type/result+subtype/success` both literal
  // "success" on different wire envelopes). The dispatch map is keyed on
  // the *bare* discriminator, so we have to dedup. We prefer the entry
  // whose canonical key starts with `subtype/` (the request schema) over
  // compound `type/X+subtype/Y` (the response-wrapper variant).
  const subtypeBuckets = new Map<string, { entry: AnnotatedSchema; key: string }>();
  for (const [key, entry] of [...annotated.entries].sort(([a], [b]) =>
    a < b ? -1 : a > b ? 1 : 0,
  )) {
    if (entry.discriminant.kind !== "subtype" || !entry.discriminant.value) continue;
    if (key.includes("#")) continue;
    const lit = entry.discriminant.value;
    const prev = subtypeBuckets.get(lit);
    // Prefer bare subtype/X (no `+`) over compound type/Y+subtype/X.
    if (!prev || (key.startsWith("subtype/") && !prev.key.startsWith("subtype/"))) {
      subtypeBuckets.set(lit, { entry, key });
    }
  }
  for (const [lit, { entry }] of [...subtypeBuckets].sort(([a], [b]) =>
    a < b ? -1 : a > b ? 1 : 0,
  )) {
    lines.push(`  '${lit}': Schemas.${entry.emittedName},`);
  }
  lines.push(`};`);
  lines.push("");
  lines.push(`/** Schemas keyed by their wire-format top-level type literal. */`);
  lines.push(`export const inboundByType: Record<string, Type> = {`);
  const typeBuckets = new Map<string, { entry: AnnotatedSchema; key: string }>();
  for (const [key, entry] of [...annotated.entries].sort(([a], [b]) =>
    a < b ? -1 : a > b ? 1 : 0,
  )) {
    if (entry.discriminant.kind !== "type" || !entry.discriminant.value) continue;
    if (key.includes("#")) continue;
    if (key.includes("+")) continue;
    typeBuckets.set(entry.discriminant.value, { entry, key });
  }
  for (const [lit, { entry }] of [...typeBuckets].sort(([a], [b]) =>
    a < b ? -1 : a > b ? 1 : 0,
  )) {
    lines.push(`  '${lit}': Schemas.${entry.emittedName},`);
  }
  lines.push(`};`);
  lines.push("");
  return lines.join("\n");
}

// ============================================================================
// Coverage
// ============================================================================

interface CoverageReport {
  version: string;
  patchesApplied: number;
  schemas: {
    total: number;
    fields: { total: number; typed: number; unknown: number };
    discriminantKeyed: { total: number; fullyTyped: number };
  };
  unknownFields: Array<{ schema: string; field: string; rhs: string | null }>;
}

function computeCoverage(
  schemas: PerSchemaResult[],
  patchesApplied: number,
): CoverageReport {
  let totalFields = 0;
  let typedFields = 0;
  const unknownFields: Array<{ schema: string; field: string; rhs: string | null }> = [];
  let discrimTotal = 0;
  let discrimFullyTyped = 0;
  for (const s of schemas) {
    totalFields += s.fields.length;
    typedFields += s.typedFieldCount;
    for (const f of s.fields) {
      if (f.unresolved) {
        unknownFields.push({ schema: s.emittedName, field: f.fieldName, rhs: f.rhs });
      }
    }
    if (s.isDiscriminantKeyed && s.fields.length > 0) {
      discrimTotal++;
      if (s.unresolvedFieldCount === 0) discrimFullyTyped++;
    }
  }
  return {
    version: ACTIVE_VERSION,
    patchesApplied,
    schemas: {
      total: schemas.length,
      fields: { total: totalFields, typed: typedFields, unknown: totalFields - typedFields },
      discriminantKeyed: { total: discrimTotal, fullyTyped: discrimFullyTyped },
    },
    unknownFields,
  };
}

await main();
