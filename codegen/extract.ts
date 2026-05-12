#!/usr/bin/env bun
/**
 * Extract every Zod schema definition from a Bun-compiled claude binary,
 * and diff against a previously-extracted canonical snapshot. V2 rewrite.
 *
 * Usage:
 *   bun codegen/extract.ts extract <binary> [--out <dir>]
 *   bun codegen/extract.ts compare <old-canonical.json> <new-canonical.json> [--out <dir>]
 *
 * V2 vs V1 (the rewrite this file is the locus of):
 *
 *   V1 picked a single dominant `(lazy, zod)` pair from the binary and
 *   threaded its names through every regex. That kept working across two
 *   bumps but missed any schema defined without going through the lazy
 *   wrapper, and was tied to "there exists a lazy wrapper at all".
 *
 *   V2 anchors on the *shape* of a zod method call, not on a specific alias.
 *   We scan for every `<ident>.<zodMethod>(` site where `<zodMethod>` is in
 *   the structurally-meaningful set (object/strictObject/looseObject/union/
 *   discriminatedUnion/enum/tuple/record/partialRecord/intersection/preprocess
 *   + primitives for coverage). Every distinct `<ident>` we observe is folded
 *   into a single union ("some zod namespace"). For each schema-defining call
 *   site we walk backward to find the binding context: `<varname>=<wrapper>(`
 *   (lazy-wrapped) or `<varname>=` directly (bare definition). Bare schemas
 *   the V1 detector silently dropped now appear.
 *
 *   Per-field RHS expressions are captured alongside field names so
 *   `generate.ts` can translate them into arktype.
 *
 *   Coverage summary printed on stderr; if a prior coverage.json exists in
 *   the same out dir, any count dropping by >10% logs a warning. Re-runs
 *   that produce a sharp drop in any metric fail loudly via that warning.
 *
 *   binarySha256 is computed and emitted in `binary-metadata.json`.
 */

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// ---------- zod method set ----------

/**
 * Schema-defining zod methods. Any `<ident>.<method>(` site where `<method>`
 * is here is treated as a schema-introducing call.
 */
const SCHEMA_DEFINING_METHODS = [
  'object',
  'strictObject',
  'looseObject',
  'union',
  'discriminatedUnion',
  'enum',
  'tuple',
  'record',
  'partialRecord',
  'intersection',
  'preprocess',
] as const;

/**
 * Coverage-only zod methods — counted for the summary, but a site that ONLY
 * matches a primitive method isn't treated as a top-level schema definition.
 */
const COVERAGE_METHODS = [
  'string',
  'number',
  'boolean',
  'literal',
  'array',
  'lazy',
  'optional',
  'nullable',
] as const;

const ALL_ZOD_METHODS = [...SCHEMA_DEFINING_METHODS, ...COVERAGE_METHODS];

const ZOD_METHOD_RE_PART = `(?:${ALL_ZOD_METHODS.join('|')})`;
const SCHEMA_DEFINING_RE_PART = `(?:${SCHEMA_DEFINING_METHODS.join('|')})`;

// ---------- alias detection (V2 — collect all, don't pick) ----------

interface AliasReport {
  zodAliases: string[];          // every ident seen with `.<method>(` above the threshold
  lazyWrapperAliases: string[];  // idents seen as `<ident>(()=><zodIdent>.<method>` — informational
}

const ZOD_ALIAS_THRESHOLD = 5; // minimum occurrence count to accept an ident as a zod namespace

// Idents that look superficially zod-like but are actually unrelated runtime
// names (`this.object(...)` from class methods, `coerce.string(...)` as a sub-
// namespace of zod itself rather than a top-level alias, etc.). Filter
// aggressively — schemas legitimately defined under these will be missed,
// but in practice anthropic's bundle places every schema under the real `y`/
// `l6`/`fK` aliases or named ident chains we already catch.
const ALIAS_DENYLIST = new Set([
  'this', 'coerce', 'Object', 'Array', 'Map', 'Set', 'Promise', 'Error',
]);

/**
 * Walk the binary text and collect every `<ident>` that appears on the LHS
 * of `.<zodMethod>(` above a threshold. Returns the merged set as a sorted
 * array. Also reports any `<ident>(()=><zodIdent>.<method>` lazy wrapper
 * aliases observed (informational only — V2 does NOT branch on them).
 */
function detectAliases(text: string): AliasReport {
  const zodCount: Record<string, number> = {};
  const aliasRe = new RegExp(
    `\\b([A-Za-z_$][\\w$]{0,8})\\.${ZOD_METHOD_RE_PART}\\(`,
    'g',
  );
  for (const m of text.matchAll(aliasRe)) {
    const ident = m[1];
    zodCount[ident] = (zodCount[ident] ?? 0) + 1;
  }
  const zodAliases = Object.entries(zodCount)
    .filter(([k, n]) => n >= ZOD_ALIAS_THRESHOLD && !ALIAS_DENYLIST.has(k))
    .map(([k]) => k)
    .sort();

  const lazyCount: Record<string, number> = {};
  const lazyRe = new RegExp(
    `\\b([A-Za-z_$][\\w$]{0,8})\\(\\(\\)=>([A-Za-z_$][\\w$]{0,8})\\.${ZOD_METHOD_RE_PART}\\b`,
    'g',
  );
  for (const m of text.matchAll(lazyRe)) {
    const wrap = m[1];
    const zod = m[2];
    if (!zodAliases.includes(zod)) continue;
    lazyCount[wrap] = (lazyCount[wrap] ?? 0) + 1;
  }
  const lazyWrapperAliases = Object.entries(lazyCount)
    .filter(([, n]) => n >= ZOD_ALIAS_THRESHOLD)
    .map(([k]) => k)
    .sort();

  if (zodAliases.length === 0) {
    throw new Error(
      'detectAliases: no zod-method call sites found in binary — ' +
      'bundle format may have changed beyond regex extraction.',
    );
  }
  return { zodAliases, lazyWrapperAliases };
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function zodAlt(aliases: AliasReport): string {
  return `(?:${aliases.zodAliases.map(escapeRe).join('|')})`;
}

// ---------- ident blacklists (xref + field-rhs sanitization) ----------

const ZOD_BUILTINS = new Set([
  'object','union','literal','enum','array','string','number','boolean','record','unknown',
  'optional','nullable','nullish','describe','lazy','tuple','any','null','date','bigint',
  'symbol','function','undefined','intersection','discriminatedUnion','default','transform',
  'pipe','catch','readonly','brand','refine','superRefine','min','max','length','int','positive',
  'negative','nonnegative','nonpositive','finite','safe','gt','lt','gte','lte','multipleOf',
  'startsWith','endsWith','includes','regex','email','url','uuid','cuid','cuid2','ulid','emoji',
  'ip','base64','datetime','time','duration','trim','lower','upper','partial','required',
  'pick','omit','extend','merge','passthrough','strict','strip','keyof','element','elements',
  'shape','asyncParse','parse','parseAsync','safeParse','safeParseAsync','args','returns',
  'implement','validate','isOptional','isNullable','partialRecord','preprocess','strictObject',
  'looseObject',
]);
const JS_KEYWORDS = new Set([
  'if','else','for','while','do','switch','case','break','continue','return','throw',
  'try','catch','finally','new','delete','typeof','instanceof','in','of','void',
  'function','class','const','let','var','this','super','yield','await','async',
  'true','false','null','undefined','import','export','from','as','default',
]);
const IDENT_BLACKLIST = new Set([...ZOD_BUILTINS, ...JS_KEYWORDS]);

const XREF_RE = /\b([A-Za-z_$][\w$]{0,30})\(\)/g;

// ---------- types ----------

interface SchemaField {
  name: string;
  rhs: string;
}

interface SchemaEntry {
  /**
   * Discovered binding name. Either the `<varname>` from `<varname>=...` or
   * `null` when the schema is an inline sub-expression (anonymous).
   */
  bindingName: string | null;
  /**
   * The wrapper ident from `<varname>=<wrapper>(...)`, when present.
   * `null` for bare definitions like `<varname>=<zod>.object(...)`.
   * Informational only — V2 doesn't branch on this.
   */
  wrapperIdent: string | null;
  /**
   * The zod method on the call site — `object`, `strictObject`, `union`, etc.
   */
  kind: string;
  /**
   * The zod namespace ident at the call site — useful for downstream tools.
   */
  zodAlias: string;
  typeLiteral: string | null;
  subtypeLiteral: string | null;
  describes: string[];
  xrefs: string[];
  fields: SchemaField[];      // empty for non-object schemas
  enumValues: string[] | null; // null for non-enum or opaque enum bodies
  bodyLen: number;
  body: string;               // the schema-defining call site, parenthesized form (call + args)
}

interface Indexes {
  byTypeLiteral: Record<string, string[]>;
  bySubtypeLiteral: Record<string, string[]>;
  byKind: Record<string, string[]>;
}

// ---------- paren-balanced body extraction ----------

/** `text[openIdx]` must be `(`. Returns index of matching `)`, or -1. */
function findBalanced(text: string, openIdx: number): number {
  if (text[openIdx] !== '(') {
    throw new Error(`findBalanced: expected '(' at ${openIdx}, got ${text[openIdx]}`);
  }
  let depth = 0;
  let i = openIdx;
  let inStr: string | null = null;
  let inLineCmt = false;
  let inBlkCmt = false;
  while (i < text.length) {
    const c = text[i];
    const nxt = i + 1 < text.length ? text[i + 1] : '';
    if (inLineCmt) {
      if (c === '\n') inLineCmt = false;
    } else if (inBlkCmt) {
      if (c === '*' && nxt === '/') { inBlkCmt = false; i++; }
    } else if (inStr) {
      if (c === '\\') { i++; }
      else if (c === inStr) inStr = null;
    } else {
      if (c === '"' || c === "'" || c === '`') inStr = c;
      else if (c === '/' && nxt === '/') { inLineCmt = true; i++; }
      else if (c === '/' && nxt === '*') { inBlkCmt = true; i++; }
      else if (c === '(') depth++;
      else if (c === ')') {
        depth--;
        if (depth === 0) return i;
      }
    }
    i++;
  }
  return -1;
}

// ---------- binding context resolution ----------

/**
 * Walk backward from a schema-defining call site to find its binding context.
 *
 * The call site index points at `<zodIdent>.<method>(`. We scan a small
 * window leftward and try to match (in order of specificity):
 *
 *   1. `<varname>=<wrapper>(<...intervening...><zodIdent>.<method>(...)<...intervening...>)`
 *      → name = `<varname>`, wrapper = `<wrapper>`. This is the lazy-wrapper
 *      form `<varname>=CH(()=><zod>.object({...}))` after the leading `CH(`.
 *
 *   2. `<varname>=<zodIdent>.<method>(` directly → bare binding.
 *      name = `<varname>`, wrapper = null.
 *
 *   3. None of the above (some inline sub-expression or argument) → no
 *      binding; the schema is anonymous, body hashed for canonical key.
 *
 * The window size is 256 chars — large enough for `<id>=<wrap>(()=><zod>.`
 * with reasonable padding but small enough to keep scan cost bounded.
 */
function findBindingContext(
  text: string,
  callSiteStart: number,
  aliases: AliasReport,
): { bindingName: string | null; wrapperIdent: string | null } {
  const WINDOW = 256;
  const start = Math.max(0, callSiteStart - WINDOW);
  const slice = text.slice(start, callSiteStart);

  // Form 2 (bare): tail of slice ends with `<varname>=` immediately before callSiteStart
  // ALLOW additional `<ident>=` chains (var X=Y=Z=zod.object → grab outermost X)
  const bareTail = /\b([A-Za-z_$][\w$]{0,30})\s*=\s*$/.exec(slice);
  if (bareTail) {
    return { bindingName: bareTail[1], wrapperIdent: null };
  }

  // Form 1 (lazy-wrapped): tail like `<varname>=<wrapper>(` then optional
  // arrow noise `()=>` before our call site.
  // `<varname>=<wrapper>(()=>` — `()=>` between
  const lazyArrow = new RegExp(
    `\\b([A-Za-z_$][\\w$]{0,30})\\s*=\\s*([A-Za-z_$][\\w$]{0,8})\\(\\s*\\(\\s*\\)\\s*=>\\s*$`,
  ).exec(slice);
  if (lazyArrow) {
    return { bindingName: lazyArrow[1], wrapperIdent: lazyArrow[2] };
  }

  // `<varname>=<wrapper>(` directly (no arrow — wrapper takes the schema as arg)
  const lazyDirect = new RegExp(
    `\\b([A-Za-z_$][\\w$]{0,30})\\s*=\\s*([A-Za-z_$][\\w$]{0,8})\\(\\s*$`,
  ).exec(slice);
  if (lazyDirect) {
    // Only accept if the wrapper isn't itself a zod alias (else this is a
    // call form like `<var>=<zod>.<method>(arg).<method>(` somewhere — but
    // that has a `.` and won't match this regex).
    const w = lazyDirect[2];
    if (!aliases.zodAliases.includes(w)) {
      return { bindingName: lazyDirect[1], wrapperIdent: w };
    }
  }

  return { bindingName: null, wrapperIdent: null };
}

// ---------- enum member extraction ----------

/**
 * Parse the string-literal members of a `<zod>.enum([...])` body. Returns
 * source-order strings, or null when the body is opaque (`<zod>.enum(<ident>)`,
 * non-string-literal members, etc.).
 *
 * `body` is expected to be the parenthesized arg list of an `.enum(` call.
 */
function extractEnumValues(body: string): string[] | null {
  if (body[0] !== '[') return null;
  let i = 1;
  let depthBracket = 1;
  let depthBrace = 0;
  let depthParen = 0;
  let inStr: string | null = null;
  let inLineCmt = false;
  let inBlkCmt = false;
  const values: string[] = [];
  let sawNonStringMember = false;
  let pendingMemberStart = -1;
  while (i < body.length && depthBracket > 0) {
    const c = body[i];
    const nxt = i + 1 < body.length ? body[i + 1] : '';
    if (inLineCmt) {
      if (c === '\n') inLineCmt = false;
      i++;
      continue;
    }
    if (inBlkCmt) {
      if (c === '*' && nxt === '/') { inBlkCmt = false; i += 2; continue; }
      i++;
      continue;
    }
    if (inStr) {
      if (c === '\\') { i += 2; continue; }
      if (c === inStr) inStr = null;
      i++;
      continue;
    }
    if (c === '/' && nxt === '/') { inLineCmt = true; i += 2; continue; }
    if (c === '/' && nxt === '*') { inBlkCmt = true; i += 2; continue; }
    if (c === '[') { depthBracket++; if (depthBracket > 1 && pendingMemberStart < 0) pendingMemberStart = i; i++; continue; }
    if (c === ']') {
      depthBracket--;
      if (depthBracket === 0) break;
      i++;
      continue;
    }
    if (c === '{') { depthBrace++; if (depthBracket === 1 && pendingMemberStart < 0) pendingMemberStart = i; i++; continue; }
    if (c === '}') { depthBrace--; i++; continue; }
    if (c === '(') { depthParen++; if (depthBracket === 1 && pendingMemberStart < 0) pendingMemberStart = i; i++; continue; }
    if (c === ')') { depthParen--; i++; continue; }
    if (depthBracket === 1 && depthBrace === 0 && depthParen === 0) {
      if (c === ',') {
        pendingMemberStart = -1;
        i++;
        continue;
      }
      if (c === ' ' || c === '\t' || c === '\n' || c === '\r') { i++; continue; }
      if (c === '"' || c === "'" || c === '`') {
        if (pendingMemberStart >= 0) {
          sawNonStringMember = true;
          inStr = c;
          i++;
          continue;
        }
        const quote = c;
        const lit: string[] = [];
        let k = i + 1;
        while (k < body.length) {
          const cc = body[k];
          if (cc === '\\') {
            const esc = body[k + 1] ?? '';
            lit.push(esc);
            k += 2;
            continue;
          }
          if (cc === quote) break;
          lit.push(cc);
          k++;
        }
        if (k >= body.length) return null;
        let p = k + 1;
        while (p < body.length && (body[p] === ' ' || body[p] === '\t' || body[p] === '\n' || body[p] === '\r')) p++;
        if (body[p] === ',' || body[p] === ']') {
          values.push(lit.join(''));
          pendingMemberStart = -1;
          i = p;
          continue;
        }
        sawNonStringMember = true;
        i = p;
        continue;
      }
      if (pendingMemberStart < 0) pendingMemberStart = i;
      sawNonStringMember = true;
      i++;
      continue;
    }
    i++;
  }
  if (sawNonStringMember) return null;
  return values;
}

// ---------- field extraction (name + RHS expression) ----------

/**
 * Parse the top-level keys of the FIRST `{...}` object literal inside `body`,
 * along with the verbatim RHS expression slice for each field. The RHS slice
 * runs from the char after `:` up to (but not including) the comma or closing
 * `}` at depth 1. String/comment/depth-aware so nested commas/braces don't
 * fool the splitter.
 *
 * `body` here is the parenthesized arg list of a `.object(`/`.strictObject(`/
 * `.looseObject(` call, i.e. starts with `{` (after optional whitespace).
 */
function extractFieldsFromObjectBody(body: string): SchemaField[] {
  // Find the opening `{` of the first object literal.
  let i = 0;
  while (i < body.length && (body[i] === ' ' || body[i] === '\t' || body[i] === '\n' || body[i] === '\r')) i++;
  if (body[i] !== '{') return [];
  const braceStart = i;

  const fields: SchemaField[] = [];
  let depthBrace = 1;
  let depthParen = 0;
  let depthBracket = 0;
  let inStr: string | null = null;
  let j = braceStart + 1;

  // Per-field state: once we see `<ident>:` we capture name and track RHS until
  // the next `,` at depth 1 (depthBrace=1, depthParen=0, depthBracket=0) or
  // the closing `}` at depth 0.
  let currentName: string | null = null;
  let rhsStart = -1;

  while (j < body.length && depthBrace > 0) {
    const c = body[j];
    const nxt = j + 1 < body.length ? body[j + 1] : '';

    if (inStr) {
      if (c === '\\') { j += 2; continue; }
      if (c === inStr) inStr = null;
      j++;
      continue;
    }

    if (c === '"' || c === "'" || c === '`') {
      inStr = c;
      j++;
      continue;
    }

    if (c === '/' && nxt === '/') {
      while (j < body.length && body[j] !== '\n') j++;
      continue;
    }
    if (c === '/' && nxt === '*') {
      j += 2;
      while (j < body.length && !(body[j] === '*' && body[j + 1] === '/')) j++;
      j += 2;
      continue;
    }

    if (c === '{') { depthBrace++; j++; continue; }
    if (c === '}') {
      depthBrace--;
      if (depthBrace === 0) {
        // Close out final field if we're mid-RHS.
        if (currentName !== null && rhsStart >= 0) {
          const rhs = body.slice(rhsStart, j).trim();
          if (rhs.length > 0) fields.push({ name: currentName, rhs });
        }
        break;
      }
      j++;
      continue;
    }
    if (c === '(') { depthParen++; j++; continue; }
    if (c === ')') { depthParen--; j++; continue; }
    if (c === '[') { depthBracket++; j++; continue; }
    if (c === ']') { depthBracket--; j++; continue; }

    if (depthBrace === 1 && depthParen === 0 && depthBracket === 0) {
      if (c === ',') {
        if (currentName !== null && rhsStart >= 0) {
          const rhs = body.slice(rhsStart, j).trim();
          if (rhs.length > 0) fields.push({ name: currentName, rhs });
        }
        currentName = null;
        rhsStart = -1;
        j++;
        continue;
      }

      // looking for `<ident>:` if we don't currently have one
      if (currentName === null && /[A-Za-z_$"']/.test(c)) {
        // Key can be quoted (`"foo-bar":`) or bare ident.
        let key: string;
        if (c === '"' || c === "'") {
          // quoted key
          const quote = c;
          let k = j + 1;
          const lit: string[] = [];
          while (k < body.length) {
            const cc = body[k];
            if (cc === '\\') { lit.push(body[k + 1] ?? ''); k += 2; continue; }
            if (cc === quote) break;
            lit.push(cc);
            k++;
          }
          if (k >= body.length) break;
          key = lit.join('');
          // skip whitespace, expect `:`
          let p = k + 1;
          while (p < body.length && (body[p] === ' ' || body[p] === '\t' || body[p] === '\n' || body[p] === '\r')) p++;
          if (body[p] !== ':') {
            j = p;
            continue;
          }
          currentName = key;
          rhsStart = p + 1;
          // skip leading whitespace in RHS
          while (rhsStart < body.length && (body[rhsStart] === ' ' || body[rhsStart] === '\t' || body[rhsStart] === '\n' || body[rhsStart] === '\r')) rhsStart++;
          j = rhsStart;
          continue;
        }
        // bare ident key
        let k = j;
        while (k < body.length && /[\w$]/.test(body[k])) k++;
        if (k === j) { j++; continue; }
        key = body.slice(j, k);
        let p = k;
        while (p < body.length && (body[p] === ' ' || body[p] === '\t' || body[p] === '\n' || body[p] === '\r')) p++;
        if (body[p] !== ':') {
          j = p;
          continue;
        }
        currentName = key;
        rhsStart = p + 1;
        while (rhsStart < body.length && (body[rhsStart] === ' ' || body[rhsStart] === '\t' || body[rhsStart] === '\n' || body[rhsStart] === '\r')) rhsStart++;
        j = rhsStart;
        continue;
      }
    }

    j++;
  }

  return fields;
}

// ---------- discriminant + describe extraction ----------

function matchTypeLiteral(body: string, aliases: AliasReport): string | null {
  const re = new RegExp(`\\btype\\s*:\\s*${zodAlt(aliases)}\\.literal\\("([^"]+)"\\)`);
  const m = body.match(re);
  return m ? m[1] : null;
}
function matchSubtypeLiteral(body: string, aliases: AliasReport): string | null {
  const re = new RegExp(`\\bsubtype\\s*:\\s*${zodAlt(aliases)}\\.literal\\("([^"]+)"\\)`);
  const m = body.match(re);
  return m ? m[1] : null;
}

const DESCRIBE_RE = /\.describe\("((?:[^"\\]|\\.)*)"\)/g;

// ---------- main extraction ----------

interface ExtractionResult {
  schemas: SchemaEntry[];
  aliases: AliasReport;
  coverage: CoverageMetrics;
}

interface CoverageMetrics {
  totalSchemaDefiningCallSites: number;
  boundToNamedIdent: number;
  anonymousInline: number;
  uniqueZodAliases: number;
  uniqueLazyWrapperAliases: number;
  topLevelTypeDiscriminants: number;
  topLevelSubtypeDiscriminants: number;
}

function extract(binaryPath: string): ExtractionResult {
  const raw = readFileSync(binaryPath);
  const text = raw.toString('utf8');

  const aliases = detectAliases(text);
  process.stderr.write(
    `[extract] zod aliases: [${aliases.zodAliases.join(', ')}]; lazy wrappers: [${aliases.lazyWrapperAliases.join(', ')}]\n`,
  );

  const schemas: SchemaEntry[] = [];
  // Bound the schema-defining scan to call sites whose zodIdent matches one
  // we accepted as a real zod alias.
  const zodAliasSet = new Set(aliases.zodAliases);
  const definingRe = new RegExp(
    `\\b([A-Za-z_$][\\w$]{0,8})\\.(${SCHEMA_DEFINING_RE_PART})\\(`,
    'g',
  );

  const seenBindings = new Set<string>(); // first binding wins; later collisions ignored

  let totalSites = 0;
  let bound = 0;
  let anon = 0;
  let topType = 0;
  let topSubtype = 0;

  for (const m of text.matchAll(definingRe)) {
    const zodIdent = m[1];
    if (!zodAliasSet.has(zodIdent)) continue;
    const kind = m[2];
    const matchStart = m.index ?? 0;
    const matchEnd = matchStart + m[0].length;
    const openParenIdx = matchEnd - 1;
    if (text[openParenIdx] !== '(') continue;
    const closeIdx = findBalanced(text, openParenIdx);
    if (closeIdx < 0) continue;

    totalSites++;

    // Body = the parenthesized arg list of the schema-defining call site.
    const argBody = text.slice(openParenIdx + 1, closeIdx);

    // Plausibility filter: a real schema-defining call has structured args.
    // Bare-ident bodies like `Iw.object(_)`, `U6.object(q)` are accidental
    // matches against unrelated runtime calls. Accept if the body:
    //   - starts with `{` / `[` / `"` / `'` / `(` (structured literal)
    //   - contains a zod-method chain itself (`<alias>.<method>(`)
    //   - is empty (zero-arg call — uncommon but valid for some kinds)
    const trimmedBody = argBody.trim();
    const looksLikeSchema =
      trimmedBody.length === 0 ||
      /^[{[("']/.test(trimmedBody) ||
      new RegExp(`\\b(${aliases.zodAliases.map(escapeRe).join('|')})\\.${ZOD_METHOD_RE_PART}\\b`).test(trimmedBody);
    if (!looksLikeSchema) continue;

    // We capture the "extended body" up to the end of the trailing method
    // chain (e.g. `.describe(...).optional()`) so describe/discriminant
    // patterns can match in cases where they appear on the chain after the
    // primary call. Walk forward, balancing parens, until we hit a stop char.
    let chainEnd = closeIdx + 1;
    while (chainEnd < text.length) {
      const c = text[chainEnd];
      if (c === '.') {
        // method call — read ident
        let p = chainEnd + 1;
        while (p < text.length && /[\w$]/.test(text[p])) p++;
        if (text[p] === '(') {
          const close = findBalanced(text, p);
          if (close < 0) break;
          chainEnd = close + 1;
          continue;
        }
        // property access without call — break (rare in minified code)
        break;
      }
      break;
    }
    const fullBody = text.slice(matchStart, chainEnd);

    // Resolve binding context.
    const { bindingName, wrapperIdent } = findBindingContext(text, matchStart, aliases);

    if (bindingName) {
      if (seenBindings.has(bindingName)) continue;
      seenBindings.add(bindingName);
      bound++;
    } else {
      anon++;
    }

    const typeLiteral = matchTypeLiteral(fullBody, aliases);
    const subtypeLiteral = matchSubtypeLiteral(fullBody, aliases);
    if (typeLiteral) topType++;
    if (subtypeLiteral) topSubtype++;

    const describes: string[] = [];
    for (const d of fullBody.matchAll(DESCRIBE_RE)) {
      describes.push(d[1].replace(/\\(.)/g, '$1'));
    }

    const xrefSet = new Set<string>();
    for (const x of fullBody.matchAll(XREF_RE)) {
      const id = x[1];
      if (bindingName && id === bindingName) continue;
      if (IDENT_BLACKLIST.has(id)) continue;
      if (zodAliasSet.has(id)) continue;
      if (/^\d+$/.test(id)) continue;
      xrefSet.add(id);
    }

    const fields =
      kind === 'object' || kind === 'strictObject' || kind === 'looseObject'
        ? extractFieldsFromObjectBody(argBody)
        : [];

    const enumValues = kind === 'enum' ? extractEnumValues(argBody) : null;

    schemas.push({
      bindingName,
      wrapperIdent,
      kind,
      zodAlias: zodIdent,
      typeLiteral,
      subtypeLiteral,
      describes,
      xrefs: [...xrefSet].sort(),
      fields,
      enumValues,
      bodyLen: fullBody.length,
      body: fullBody,
    });
  }

  const coverage: CoverageMetrics = {
    totalSchemaDefiningCallSites: totalSites,
    boundToNamedIdent: bound,
    anonymousInline: anon,
    uniqueZodAliases: aliases.zodAliases.length,
    uniqueLazyWrapperAliases: aliases.lazyWrapperAliases.length,
    topLevelTypeDiscriminants: topType,
    topLevelSubtypeDiscriminants: topSubtype,
  };

  return { schemas, aliases, coverage };
}

// ---------- inverted indexes ----------

function buildIndexes(schemas: SchemaEntry[]): Indexes {
  const byType: Record<string, string[]> = {};
  const bySubtype: Record<string, string[]> = {};
  const byKind: Record<string, string[]> = {};
  for (const s of schemas) {
    const id = s.bindingName ?? '<anon>';
    (byKind[s.kind] ??= []).push(id);
    if (s.typeLiteral) (byType[s.typeLiteral] ??= []).push(id);
    if (s.subtypeLiteral) (bySubtype[s.subtypeLiteral] ??= []).push(id);
  }
  for (const k of Object.keys(byKind)) byKind[k].sort();
  for (const k of Object.keys(byType)) byType[k].sort();
  for (const k of Object.keys(bySubtype)) bySubtype[k].sort();
  return { byTypeLiteral: byType, bySubtypeLiteral: bySubtype, byKind };
}

// ---------- union resolution ----------

const UNION_MEMBER_RE = /\b([A-Za-z_$][\w$]{0,30})\(\)/g;

function resolveUnions(
  schemas: SchemaEntry[],
  aliases: AliasReport,
): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  const unionRe = new RegExp(`${zodAlt(aliases)}\\.union\\(\\[(.*?)\\]\\)`, 's');
  for (const s of schemas) {
    if (s.kind !== 'union') continue;
    const id = s.bindingName;
    if (!id) continue;
    const m = s.body.match(unionRe);
    if (!m) continue;
    const members: string[] = [];
    for (const x of m[1].matchAll(UNION_MEMBER_RE)) {
      if (!IDENT_BLACKLIST.has(x[1])) members.push(x[1]);
    }
    out[id] = members;
  }
  return out;
}

// ---------- semantic naming ----------

function inferSemanticName(s: SchemaEntry): string {
  if (s.subtypeLiteral) {
    return s.subtypeLiteral.split('_').map(p => p[0]?.toUpperCase() + p.slice(1)).join('') + 'Request';
  }
  if (s.typeLiteral) {
    return s.typeLiteral.split('_').map(p => p[0]?.toUpperCase() + p.slice(1)).join('');
  }
  if (s.describes[0]) {
    const first = s.describes[0].split('.')[0];
    const words = first.match(/[A-Za-z]+/g)?.slice(0, 6) ?? [];
    if (words.length) return words.map(w => w[0].toUpperCase() + w.slice(1)).join('');
  }
  return `Schema_${s.bindingName ?? 'anon'}`;
}

// ---------- canonical identity ----------

interface CanonicalEntry {
  canonicalKey: string;
  discriminant: { kind: 'subtype' | 'type' | 'anonymous'; value: string | null };
  schemaKind: string;
  fieldNames: string[];
  fields: SchemaField[];
  unionMemberDiscriminants: string[];
  enumValues?: string[] | null;
  describeSummary: string | null;
  bodyHash: string;
  bodyLen: number;
  minifiedIdThisVersion: string | null;
}

function mangleBodyForHash(body: string, aliases: AliasReport): string {
  const zod = zodAlt(aliases);
  let mangled = body.replace(
    new RegExp(`\\b${zod}\\.`, 'g'),
    '__Z__.',
  );
  mangled = mangled.replace(/\b[A-Za-z_$][\w$]{0,30}\(\)/g, (m) => {
    const ident = m.slice(0, -2);
    return IDENT_BLACKLIST.has(ident) ? m : '__REF__()';
  });
  return mangled;
}

function canonicalize(
  schemas: SchemaEntry[],
  unions: Record<string, string[]>,
  aliases: AliasReport,
): Record<string, CanonicalEntry> {
  const out: Record<string, CanonicalEntry> = {};
  // Build a quick lookup by bindingName for union member discriminant resolution.
  const byName = new Map<string, SchemaEntry>();
  for (const s of schemas) {
    if (s.bindingName) byName.set(s.bindingName, s);
  }

  for (const s of schemas) {
    let key: string;
    let discriminant: CanonicalEntry['discriminant'];
    if (s.typeLiteral && s.subtypeLiteral) {
      key = `type/${s.typeLiteral}+subtype/${s.subtypeLiteral}`;
      discriminant = { kind: 'subtype', value: s.subtypeLiteral };
    } else if (s.subtypeLiteral) {
      key = `subtype/${s.subtypeLiteral}`;
      discriminant = { kind: 'subtype', value: s.subtypeLiteral };
    } else if (s.typeLiteral) {
      key = `type/${s.typeLiteral}`;
      discriminant = { kind: 'type', value: s.typeLiteral };
    } else {
      const mangled = mangleBodyForHash(s.body, aliases);
      const hash = createHash('sha256').update(mangled).digest('hex').slice(0, 16);
      key = `anon/${hash}`;
      discriminant = { kind: 'anonymous', value: null };
    }

    const unionMembers = s.bindingName ? unions[s.bindingName] ?? [] : [];
    const memberDiscs = unionMembers
      .map(m => {
        const ms = byName.get(m);
        if (!ms) return null;
        if (ms.typeLiteral && ms.subtypeLiteral) return `type/${ms.typeLiteral}+subtype/${ms.subtypeLiteral}`;
        if (ms.subtypeLiteral) return `subtype/${ms.subtypeLiteral}`;
        if (ms.typeLiteral) return `type/${ms.typeLiteral}`;
        const hash = createHash('sha256').update(mangleBodyForHash(ms.body, aliases)).digest('hex').slice(0, 16);
        return `anon/${hash}`;
      })
      .filter((x): x is string => !!x)
      .sort();

    const mangled = mangleBodyForHash(s.body, aliases);
    const bodyHash = createHash('sha256').update(mangled).digest('hex').slice(0, 16);

    let resolvedKey = key;
    let collisionN = 1;
    while (out[resolvedKey]) {
      resolvedKey = `${key}#${++collisionN}`;
    }

    const entry: CanonicalEntry = {
      canonicalKey: resolvedKey,
      discriminant,
      schemaKind: s.kind,
      fieldNames: s.fields.map(f => f.name),
      fields: s.fields,
      unionMemberDiscriminants: memberDiscs,
      describeSummary: s.describes[0]?.slice(0, 200) ?? null,
      bodyHash,
      bodyLen: s.bodyLen,
      minifiedIdThisVersion: s.bindingName,
    };
    if (s.kind === 'enum') entry.enumValues = s.enumValues;
    out[resolvedKey] = entry;
  }
  return out;
}

// ---------- stable JSON serialization ----------

/**
 * Re-emit `value` with sorted object keys so generated JSON is diff-friendly
 * across runs. Arrays are preserved in order — they encode source order
 * (enum values, union members already pre-sorted, field names).
 */
function sortKeysDeep<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map(v => sortKeysDeep(v)) as unknown as T;
  }
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(value as Record<string, unknown>).sort()) {
      out[k] = sortKeysDeep((value as Record<string, unknown>)[k]);
    }
    return out as unknown as T;
  }
  return value;
}

function stableJson(value: unknown): string {
  return JSON.stringify(sortKeysDeep(value), null, 2) + '\n';
}

// ---------- coverage compare against prior ----------

const COVERAGE_DROP_THRESHOLD = 0.1; // 10%

function compareCoverage(prior: CoverageMetrics, current: CoverageMetrics): string[] {
  const warnings: string[] = [];
  const fields: (keyof CoverageMetrics)[] = [
    'totalSchemaDefiningCallSites',
    'boundToNamedIdent',
    'anonymousInline',
    'uniqueZodAliases',
    'uniqueLazyWrapperAliases',
    'topLevelTypeDiscriminants',
    'topLevelSubtypeDiscriminants',
  ];
  for (const f of fields) {
    const p = prior[f];
    const c = current[f];
    if (p > 0 && c < p * (1 - COVERAGE_DROP_THRESHOLD)) {
      warnings.push(`${f}: dropped from ${p} → ${c} (>${(COVERAGE_DROP_THRESHOLD * 100).toFixed(0)}% drop)`);
    }
  }
  return warnings;
}

// ---------- report ----------

function renderReport(
  schemas: SchemaEntry[],
  indexes: Indexes,
  unions: Record<string, string[]>,
  canonical: Record<string, CanonicalEntry>,
  coverage: CoverageMetrics,
  aliases: AliasReport,
): string {
  const L: string[] = [];
  L.push('# Claude Code schema extraction report (V2)\n');
  L.push(`- total schema-defining call sites: **${coverage.totalSchemaDefiningCallSites}**`);
  L.push(`- bound to a named identifier: **${coverage.boundToNamedIdent}**`);
  L.push(`- anonymous inline: **${coverage.anonymousInline}**`);
  L.push(`- canonical keys: **${Object.keys(canonical).length}**`);
  L.push(`- with \`subtype\` discriminant: **${Object.keys(indexes.bySubtypeLiteral).length}** unique subtypes`);
  L.push(`- with \`type\` discriminant: **${Object.keys(indexes.byTypeLiteral).length}** unique types`);
  L.push(`- unions resolved: **${Object.keys(unions).length}**`);
  L.push(`- zod aliases (union'd): [${aliases.zodAliases.join(', ')}]`);
  L.push(`- lazy wrapper aliases observed: [${aliases.lazyWrapperAliases.join(', ')}]`);
  L.push('');

  L.push('## Schemas by `type` discriminant\n');
  L.push('| type literal | name |');
  L.push('|---|---|');
  for (const lit of Object.keys(indexes.byTypeLiteral).sort()) {
    const ids = indexes.byTypeLiteral[lit];
    const names = ids
      .map(id => {
        const s = schemas.find(x => x.bindingName === id);
        return s ? inferSemanticName(s) : id;
      })
      .join(', ');
    L.push(`| \`${lit}\` | ${names} |`);
  }
  L.push('');

  L.push('## Counts by zod kind\n');
  for (const kind of Object.keys(indexes.byKind).sort()) {
    L.push(`- \`${kind}\`: ${indexes.byKind[kind].length}`);
  }
  return L.join('\n');
}

// ---------- compare ----------

interface CanonicalSnapshot {
  binary?: string;
  binarySize?: number;
  binarySha256?: string;
  schemaCount?: number;
  /** V2 top-level may be `canonical` or `schemas` — both are accepted on read. */
  canonical?: Record<string, CanonicalEntry>;
  schemas?: Record<string, CanonicalEntry>;
  [key: string]: unknown;
}

function loadCanonical(path: string): Record<string, CanonicalEntry> {
  const snap: CanonicalSnapshot = JSON.parse(readFileSync(path, 'utf8'));
  return snap.canonical ?? snap.schemas ?? {};
}

interface DiffEntry {
  key: string;
  status: 'added' | 'removed' | 'changed';
  changes?: {
    bodyHashChanged?: boolean;
    fieldNamesAdded?: string[];
    fieldNamesRemoved?: string[];
    schemaKindChanged?: { old: string; new: string };
    unionMembersAdded?: string[];
    unionMembersRemoved?: string[];
    enumValuesAdded?: string[];
    enumValuesRemoved?: string[];
    describeSummaryChanged?: boolean;
  };
}

function compareSnapshots(
  oldSnap: Record<string, CanonicalEntry>,
  newSnap: Record<string, CanonicalEntry>,
): DiffEntry[] {
  const diff: DiffEntry[] = [];
  const oldKeys = new Set(Object.keys(oldSnap));
  const newKeys = new Set(Object.keys(newSnap));

  for (const k of [...newKeys].sort()) {
    if (!oldKeys.has(k)) diff.push({ key: k, status: 'added' });
  }
  for (const k of [...oldKeys].sort()) {
    if (!newKeys.has(k)) diff.push({ key: k, status: 'removed' });
  }
  for (const k of [...newKeys].sort()) {
    if (!oldKeys.has(k)) continue;
    const o = oldSnap[k];
    const n = newSnap[k];
    const changes: DiffEntry['changes'] = {};
    if (o.bodyHash !== n.bodyHash) changes.bodyHashChanged = true;
    if (o.schemaKind !== n.schemaKind) changes.schemaKindChanged = { old: o.schemaKind, new: n.schemaKind };
    const oFields = new Set(o.fieldNames);
    const nFields = new Set(n.fieldNames);
    const fAdded = [...nFields].filter(x => !oFields.has(x));
    const fRemoved = [...oFields].filter(x => !nFields.has(x));
    if (fAdded.length) changes.fieldNamesAdded = fAdded;
    if (fRemoved.length) changes.fieldNamesRemoved = fRemoved;
    const oMembers = new Set(o.unionMemberDiscriminants);
    const nMembers = new Set(n.unionMemberDiscriminants);
    const mAdded = [...nMembers].filter(x => !oMembers.has(x));
    const mRemoved = [...oMembers].filter(x => !nMembers.has(x));
    if (mAdded.length) changes.unionMembersAdded = mAdded;
    if (mRemoved.length) changes.unionMembersRemoved = mRemoved;
    const oEnum = new Set(o.enumValues ?? []);
    const nEnum = new Set(n.enumValues ?? []);
    const eAdded = [...nEnum].filter(x => !oEnum.has(x));
    const eRemoved = [...oEnum].filter(x => !nEnum.has(x));
    if (eAdded.length) changes.enumValuesAdded = eAdded;
    if (eRemoved.length) changes.enumValuesRemoved = eRemoved;
    if (o.describeSummary !== n.describeSummary) changes.describeSummaryChanged = true;
    if (Object.keys(changes).length > 0) {
      diff.push({ key: k, status: 'changed', changes });
    }
  }
  return diff;
}

function renderDiffMarkdown(diff: DiffEntry[]): string {
  const L: string[] = [];
  L.push('# Schema diff\n');
  const added = diff.filter(d => d.status === 'added');
  const removed = diff.filter(d => d.status === 'removed');
  const changed = diff.filter(d => d.status === 'changed');
  L.push(`- added: **${added.length}**`);
  L.push(`- removed: **${removed.length}**`);
  L.push(`- changed: **${changed.length}**`);
  L.push('');
  if (added.length) {
    L.push('## Added\n');
    for (const d of added) L.push(`- \`${d.key}\``);
    L.push('');
  }
  if (removed.length) {
    L.push('## Removed\n');
    for (const d of removed) L.push(`- \`${d.key}\``);
    L.push('');
  }
  if (changed.length) {
    L.push('## Changed\n');
    for (const d of changed) {
      L.push(`### \`${d.key}\``);
      if (d.changes?.bodyHashChanged) L.push('- body changed (structural)');
      if (d.changes?.schemaKindChanged) L.push(`- kind: \`${d.changes.schemaKindChanged.old}\` → \`${d.changes.schemaKindChanged.new}\``);
      if (d.changes?.fieldNamesAdded?.length) L.push(`- fields added: ${d.changes.fieldNamesAdded.map(f => `\`${f}\``).join(', ')}`);
      if (d.changes?.fieldNamesRemoved?.length) L.push(`- fields removed: ${d.changes.fieldNamesRemoved.map(f => `\`${f}\``).join(', ')}`);
      if (d.changes?.unionMembersAdded?.length) L.push(`- union members added: ${d.changes.unionMembersAdded.map(m => `\`${m}\``).join(', ')}`);
      if (d.changes?.unionMembersRemoved?.length) L.push(`- union members removed: ${d.changes.unionMembersRemoved.map(m => `\`${m}\``).join(', ')}`);
      if (d.changes?.enumValuesAdded?.length) L.push(`- enumValues added: ${d.changes.enumValuesAdded.map(v => `\`${v}\``).join(', ')}`);
      if (d.changes?.enumValuesRemoved?.length) L.push(`- enumValues removed: ${d.changes.enumValuesRemoved.map(v => `\`${v}\``).join(', ')}`);
      if (d.changes?.describeSummaryChanged) L.push('- describe text changed');
      L.push('');
    }
  }
  return L.join('\n');
}

// ---------- main ----------

function usage(): never {
  console.error(`usage:
  bun codegen/extract.ts extract <binary> [--out <dir>]
  bun codegen/extract.ts compare <old-canonical.json> <new-canonical.json> [--out <dir>]`);
  process.exit(1);
}

function sha256OfFile(path: string): string {
  const buf = readFileSync(path);
  return createHash('sha256').update(buf).digest('hex');
}

function getNpmPackageVersion(): string | null {
  try {
    const out = Bun.spawnSync({
      cmd: ['bun', 'pm', 'view', '@anthropic-ai/claude-code', 'version'],
      stdout: 'pipe',
      stderr: 'pipe',
    });
    if (out.exitCode !== 0) return null;
    const v = new TextDecoder().decode(out.stdout).trim();
    return v.length > 0 ? v : null;
  } catch {
    return null;
  }
}

const argv = process.argv.slice(2);
const cmd = argv[0];

if (cmd === 'extract') {
  let binary = '';
  let outDir = './extracted';
  for (let i = 1; i < argv.length; i++) {
    if (argv[i] === '--out' || argv[i] === '-o') outDir = argv[++i] ?? outDir;
    else if (!argv[i].startsWith('-')) binary = argv[i];
  }
  if (!binary) usage();

  mkdirSync(outDir, { recursive: true });
  const size = statSync(binary).size;
  process.stderr.write(`[extract] reading ${binary} (${size.toLocaleString()} bytes)…\n`);

  const { schemas, aliases, coverage } = extract(binary);
  const indexes = buildIndexes(schemas);
  const unions = resolveUnions(schemas, aliases);
  const canonical = canonicalize(schemas, unions, aliases);

  // Compute deterministic binary sha256.
  const binarySha = sha256OfFile(binary);

  // canonical.json — committed; the diff-stable artifact. Keep top-level
  // wrapper minimal so it's stable across re-runs (no binary path, no
  // timestamp).
  const canonicalDoc = {
    schemaCount: Object.keys(canonical).length,
    canonical,
  };
  writeFileSync(join(outDir, 'canonical.json'), stableJson(canonicalDoc));

  // schemas.json — single-version analysis only (NOT committed).
  const schemasDoc = {
    binary,
    binarySize: size,
    binarySha256: binarySha,
    aliases,
    schemaCount: schemas.length,
    indexes,
    schemas: Object.fromEntries(
      schemas.map(s => [s.bindingName ?? `__anon_${createHash('sha256').update(s.body).digest('hex').slice(0, 8)}`, s]),
    ),
  };
  writeFileSync(join(outDir, 'schemas.json'), stableJson(schemasDoc));

  writeFileSync(
    join(outDir, 'unions.json'),
    stableJson(
      Object.fromEntries(
        Object.entries(unions).map(([id, members]) => [
          id,
          {
            members,
            memberDiscriminants: members.map(m => {
              const ms = schemas.find(s => s.bindingName === m);
              return {
                id: m,
                type: ms?.typeLiteral ?? null,
                subtype: ms?.subtypeLiteral ?? null,
                inferredName: ms ? inferSemanticName(ms) : null,
              };
            }),
          },
        ]),
      ),
    ),
  );

  const rawJsLines: string[] = [];
  for (const s of [...schemas].sort((a, b) => (a.bindingName ?? '').localeCompare(b.bindingName ?? ''))) {
    rawJsLines.push(`/* ${s.bindingName ?? '<anon>'} */ ${s.body}`);
  }
  writeFileSync(join(outDir, 'raw.js'), rawJsLines.join('\n') + '\n');

  writeFileSync(
    join(outDir, 'report.md'),
    renderReport(schemas, indexes, unions, canonical, coverage, aliases),
  );

  // binary-metadata.json — committed; reproducibility anchor. Only the
  // basename of the binary path is recorded (typically the version string,
  // e.g. "2.1.139") so the metadata stays machine-independent.
  const binaryBasename = binary.split(/[\\/]/).pop() ?? binary;
  const npmVersion = getNpmPackageVersion();
  const metadata = {
    binary: binaryBasename,
    binarySha256: binarySha,
    binarySize: size,
    npmPackageVersion: npmVersion,
    extractedAt: new Date().toISOString(),
  };
  writeFileSync(join(outDir, 'binary-metadata.json'), stableJson(metadata));

  // coverage.json — phase-2 artifact, but write it now so future extracts can
  // compare against it.
  const coverageDoc = {
    extractor: coverage,
  };
  // If a prior coverage.json exists, compare; warn loudly on drops.
  const priorCoveragePath = join(outDir, 'coverage.json');
  if (existsSync(priorCoveragePath)) {
    try {
      const prior = JSON.parse(readFileSync(priorCoveragePath, 'utf8'));
      if (prior?.extractor) {
        const warnings = compareCoverage(prior.extractor, coverage);
        for (const w of warnings) {
          process.stderr.write(`[extract] WARNING: coverage drop — ${w}\n`);
        }
      }
    } catch {
      // ignore parse errors on prior
    }
  }
  writeFileSync(priorCoveragePath, stableJson(coverageDoc));

  // Coverage summary on stderr.
  process.stderr.write(
    `[extract] coverage: sites=${coverage.totalSchemaDefiningCallSites} ` +
    `named=${coverage.boundToNamedIdent} anon=${coverage.anonymousInline} ` +
    `zodAliases=${coverage.uniqueZodAliases} lazyWrappers=${coverage.uniqueLazyWrapperAliases} ` +
    `type-discriminants=${coverage.topLevelTypeDiscriminants} subtype-discriminants=${coverage.topLevelSubtypeDiscriminants} ` +
    `canonical-keys=${Object.keys(canonical).length}\n`,
  );
  process.stderr.write(`[extract] binary sha256: ${binarySha}\n`);
  process.stderr.write(`[extract] wrote: ${outDir}/{canonical,schemas,unions,binary-metadata,coverage}.json report.md raw.js\n`);

} else if (cmd === 'compare') {
  const oldPath = argv[1];
  const newPath = argv[2];
  if (!oldPath || !newPath) usage();
  let outDir: string | null = null;
  for (let i = 3; i < argv.length; i++) {
    if (argv[i] === '--out' || argv[i] === '-o') outDir = argv[++i] ?? null;
  }
  const oldSnap = loadCanonical(oldPath);
  const newSnap = loadCanonical(newPath);
  const diff = compareSnapshots(oldSnap, newSnap);
  const md = renderDiffMarkdown(diff);
  if (outDir) {
    mkdirSync(outDir, { recursive: true });
    writeFileSync(join(outDir, 'diff.json'), stableJson(diff));
    writeFileSync(join(outDir, 'diff.md'), md);
    process.stderr.write(`[compare] wrote: ${outDir}/diff.json diff.md\n`);
  } else {
    process.stdout.write(md);
  }
  if (diff.length > 0) process.exit(2);

} else {
  usage();
}
