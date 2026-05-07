#!/usr/bin/env bun
/**
 * Extract every Zod schema definition from a Bun-compiled claude binary,
 * and diff against a previously-extracted canonical snapshot.
 *
 * Usage:
 *   bun extract-claude-schemas.ts extract <binary> [--out <dir>]
 *   bun extract-claude-schemas.ts compare <old-canonical.json> <new-canonical.json>
 *
 * ─── extraction ──────────────────────────────────────────────────────────
 *
 * The Bun executable embeds the JS bundle uncompressed. Schemas are defined
 * with the pattern  <id>=xH(()=>v.<...>)  where  xH=lazySchema  and  v=zod.
 * We find every such definition with paren-balanced body parsing.
 *
 * Per schema we capture: kind, type-literal discriminant, subtype-literal
 * discriminant, describes (secondary), xrefs (cross-references to other
 * minified ids), and the verbatim body.
 *
 * ─── canonical identity (the diff-stable form) ───────────────────────────
 *
 * Minified ids (GE3, bqH, da1, …) are regenerated on every Anthropic build
 * and have NO meaning across versions. So `schemas.json` (keyed by minified
 * id) is for one-version analysis only — useless for diffs.
 *
 * Canonical identity uses the wire-protocol discriminant instead:
 *   - subtype:v.literal("X")  →  canonical key  "subtype/X"
 *   - type:v.literal("X")     →  canonical key  "type/X"
 *   - else                    →  canonical key  "anon/<sha256-of-body-shape>"
 * That key is stable across builds. canonical.json keys by it.
 *
 * The "anon" bucket holds nested helper schemas with no discriminant
 * (PermissionUpdate, AgentDefinition member shapes, etc.). Their body shape
 * is hashed AFTER mangling minified-id references away — so two different
 * builds of the same conceptual helper produce the same hash.
 *
 * ─── diff (the reproducible part) ────────────────────────────────────────
 *
 * `compare old.json new.json` emits added / removed / changed canonical
 * keys. No external baseline, no leak required. Workflow:
 *   1. Extract on each pinned version → commit canonical.json into the repo
 *   2. On version bump, extract again, run compare against committed copy
 *   3. Review the diff manually when the binary bumps; update the bridge for any added/changed subtypes
 *
 * ─── outputs (extract mode, in --out dir, default ./extracted) ──────────
 *   schemas.json    full registry by minified id (this-version only)
 *   canonical.json  by-discriminant snapshot — THIS is what you commit & diff
 *   unions.json     every v.union(...) with members + discriminants
 *   report.md       human report grouped by discriminant
 *   raw.js          bodies one-per-line, prefixed by id, for grep
 *
 * Future work (V2): patch + import the bundle, walk Zod `_def` instead of
 * regex-parsing. Full structural metadata, no regex edge cases. Requires a
 * Bun-binary unpacker; this V1 doesn't need one.
 */

import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// ---------- regexes ----------

// `<ident>=xH(` — anchor for every lazy schema definition.
const DEF_RE = /\b([A-Za-z_$][\w$]{0,30})=xH\(/g;

// First `v.<kind>` after the lazy lambda — the schema's top-level type.
const KIND_RE = /^\(\)=>v\.([a-zA-Z]+)\b/;

// Stable structural discriminants — wire-format API contracts.
const TYPE_LIT_RE = /\btype:v\.literal\("([^"]+)"\)/;
const SUBTYPE_LIT_RE = /\bsubtype:v\.literal\("([^"]+)"\)/;

// All describe() strings inside a body.
const DESC_RE = /\.describe\("((?:[^"\\]|\\.)*)"\)/g;

// Cross-reference candidates — `<ident>()` calls inside a body.
const XREF_RE = /\b([A-Za-z_$][\w$]{0,30})\(\)/g;

// Members of a v.union([...]).
const UNION_MEMBER_RE = /\b([A-Za-z_$][\w$]{0,30})\(\)/g;

// Zod builtin methods + JS keywords — drop these from xref candidates.
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
  'implement','validate','isOptional','isNullable',
]);
const JS_KEYWORDS = new Set([
  'if','else','for','while','do','switch','case','break','continue','return','throw',
  'try','catch','finally','new','delete','typeof','instanceof','in','of','void',
  'function','class','const','let','var','this','super','yield','await','async',
  'true','false','null','undefined','import','export','from','as','default',
]);
const IDENT_BLACKLIST = new Set([...ZOD_BUILTINS, ...JS_KEYWORDS]);

// ---------- types ----------

interface SchemaEntry {
  kind: string;
  typeLiteral: string | null;
  subtypeLiteral: string | null;
  describes: string[];
  xrefs: string[];
  bodyLen: number;
  body: string;
  /**
   * For top-level `v.enum([...])` schemas: the string-literal members in
   * source order. `null` when the schema is not a string-literal enum
   * (e.g. `v.enum(<ident>)` where the array reference is opaque, or
   * `schemaKind !== "enum"`). Source-order is preserved — DO NOT sort.
   */
  enumValues: string[] | null;
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
  let inStr: string | null = null; // active quote char, or null
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
      if (c === '\\') { i++; }      // skip the escaped char
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

// ---------- enum member extraction ----------

/**
 * Parse the string-literal members of the FIRST `v.enum([...])` call in `body`.
 *
 * Only meaningful when called on a top-level enum schema (kind === "enum").
 * Returns:
 *   - string[] in source order when every array member is a `"..."` string literal
 *   - null when the call shape is opaque (e.g. `v.enum(<ident>)` referencing
 *     a named array, or `v.enum([...])` containing non-string-literal members
 *     such as computed expressions / spreads). Callers can treat null as
 *     "schema is enum-kind but values are not statically extractable".
 *
 * The body parser is string/comment-aware so nested `"]"` characters inside
 * string literals don't terminate the array prematurely.
 */
function extractEnumValues(body: string): string[] | null {
  const callIdx = body.indexOf('v.enum(');
  if (callIdx < 0) return null;
  const argStart = callIdx + 'v.enum('.length;
  if (body[argStart] !== '[') return null; // `v.enum(<ident>)` — opaque to us
  // Walk the [...] body, string/comment-aware, and collect "..." literals at depth 1.
  let i = argStart + 1;
  let depthBracket = 1;
  let depthBrace = 0;
  let depthParen = 0;
  let inStr: string | null = null;
  let inLineCmt = false;
  let inBlkCmt = false;
  const values: string[] = [];
  let sawNonStringMember = false;
  // We tokenize at depth 1 of the outer array. The valid shape we care about
  // is a flat list of "..." string literals, separated by commas.
  let pendingMemberStart = -1; // index of first non-comma/non-whitespace char in current member
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
    // not in string/comment
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
        // member boundary
        pendingMemberStart = -1;
        i++;
        continue;
      }
      if (c === ' ' || c === '\t' || c === '\n' || c === '\r') { i++; continue; }
      if (c === '"' || c === "'" || c === '`') {
        // start of string literal — only valid if this is the first char of the member
        if (pendingMemberStart >= 0) {
          // member started with something non-string before this quote — not a clean string literal
          sawNonStringMember = true;
          // skip the string anyway
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
            // simple unescape: pass through with the char after backslash
            lit.push(esc);
            k += 2;
            continue;
          }
          if (cc === quote) break;
          lit.push(cc);
          k++;
        }
        if (k >= body.length) return null; // unterminated string — bail
        // After the closing quote, the next non-whitespace must be `,` or `]`
        // for this to count as a clean string-literal member.
        let p = k + 1;
        while (p < body.length && (body[p] === ' ' || body[p] === '\t' || body[p] === '\n' || body[p] === '\r')) p++;
        if (body[p] === ',' || body[p] === ']') {
          // template strings (`) can technically be backtick-quoted dynamic — we still accept them
          // when they had no ${...} interpolations. The unescape above is naive but the binary's
          // emitted enum literals only use plain double-quoted strings in practice.
          values.push(lit.join(''));
          pendingMemberStart = -1;
          i = p; // continue from `,` or `]`
          continue;
        }
        // Followed by something other than , or ] — not a clean member.
        sawNonStringMember = true;
        i = p;
        continue;
      }
      // depth-1 char that isn't whitespace, comma, or a string-quote opener →
      // this member starts with something non-string (identifier, number, etc.)
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

// ---------- main extraction ----------

function extract(binaryPath: string): Record<string, SchemaEntry> {
  const raw = readFileSync(binaryPath);
  // The JS region is ASCII; non-decodable bytes elsewhere become replacement chars and don't matter.
  const text = raw.toString('utf8');

  const schemas: Record<string, SchemaEntry> = {};
  const seen = new Set<string>();

  for (const m of text.matchAll(DEF_RE)) {
    const ident = m[1];
    if (seen.has(ident)) continue;       // first definition wins; later collisions ignored
    const matchEnd = (m.index ?? 0) + m[0].length;
    const openParenIdx = matchEnd - 1;
    if (text[openParenIdx] !== '(') continue;
    const closeIdx = findBalanced(text, openParenIdx);
    if (closeIdx < 0) continue;
    const body = text.slice(openParenIdx + 1, closeIdx);
    if (!body.startsWith('()=>v.')) continue;
    seen.add(ident);

    const kindM = body.match(KIND_RE);
    const kind = kindM ? kindM[1] : 'unknown';

    const typeM = body.match(TYPE_LIT_RE);
    const subtypeM = body.match(SUBTYPE_LIT_RE);

    const describes: string[] = [];
    for (const d of body.matchAll(DESC_RE)) {
      // unescape \" \\ etc.
      describes.push(d[1].replace(/\\(.)/g, '$1'));
    }

    const xrefSet = new Set<string>();
    for (const x of body.matchAll(XREF_RE)) {
      const id = x[1];
      if (id === ident) continue;
      if (IDENT_BLACKLIST.has(id)) continue;
      if (/^\d+$/.test(id)) continue;
      xrefSet.add(id);
    }

    // For top-level v.enum schemas, parse the string-literal members so they
    // appear as first-class structural data on canonical.json (and schemas.json).
    // Non-string-literal enum bodies (e.g. v.enum(<ident>)) yield null; the
    // post-extract summary reports the count.
    const enumValues = kind === 'enum' ? extractEnumValues(body) : null;

    schemas[ident] = {
      kind,
      typeLiteral: typeM ? typeM[1] : null,
      subtypeLiteral: subtypeM ? subtypeM[1] : null,
      describes,
      xrefs: [...xrefSet].sort(),
      bodyLen: body.length,
      body,
      enumValues,
    };
  }

  return schemas;
}

// ---------- inverted indexes ----------

function buildIndexes(schemas: Record<string, SchemaEntry>): Indexes {
  const byType: Record<string, string[]> = {};
  const bySubtype: Record<string, string[]> = {};
  const byKind: Record<string, string[]> = {};
  for (const [id, s] of Object.entries(schemas)) {
    (byKind[s.kind] ??= []).push(id);
    if (s.typeLiteral) (byType[s.typeLiteral] ??= []).push(id);
    if (s.subtypeLiteral) (bySubtype[s.subtypeLiteral] ??= []).push(id);
  }
  for (const k of Object.keys(byKind)) byKind[k].sort();
  return { byTypeLiteral: byType, bySubtypeLiteral: bySubtype, byKind };
}

// ---------- union resolution ----------

function resolveUnions(schemas: Record<string, SchemaEntry>): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const [id, s] of Object.entries(schemas)) {
    if (s.kind !== 'union') continue;
    // body shape: ()=>v.union([X(),Y(),Z()]).<more>
    const m = s.body.match(/v\.union\(\[(.*?)\]\)/s);
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

function inferSemanticName(id: string, s: SchemaEntry): string {
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
  return `Schema_${id}`;
}

// ---------- report ----------

function renderReport(
  schemas: Record<string, SchemaEntry>,
  indexes: Indexes,
  unions: Record<string, string[]>,
): string {
  const L: string[] = [];
  L.push('# Claude Code schema extraction report\n');
  L.push(`- total schemas extracted: **${Object.keys(schemas).length}**`);
  L.push(`- with \`subtype\` discriminant: **${Object.keys(indexes.bySubtypeLiteral).length}** unique subtypes`);
  L.push(`- with \`type\` discriminant: **${Object.keys(indexes.byTypeLiteral).length}** unique types`);
  L.push(`- unions resolved: **${Object.keys(unions).length}**`);
  L.push('');

  L.push('## Schemas by `type` discriminant\n');
  L.push('| type literal | id(s) | inferred name |');
  L.push('|---|---|---|');
  for (const lit of Object.keys(indexes.byTypeLiteral).sort()) {
    const ids = indexes.byTypeLiteral[lit];
    const names = ids.map(i => inferSemanticName(i, schemas[i])).join(', ');
    L.push(`| \`${lit}\` | ${ids.map(i => `\`${i}\``).join(', ')} | ${names} |`);
  }
  L.push('');

  L.push('## Schemas by `subtype` discriminant\n');
  L.push('| subtype literal | id(s) | inferred name | describe (first) |');
  L.push('|---|---|---|---|');
  for (const lit of Object.keys(indexes.bySubtypeLiteral).sort()) {
    for (const id of indexes.bySubtypeLiteral[lit]) {
      const s = schemas[id];
      const d = s.describes[0] ? s.describes[0].slice(0, 80) + '…' : '';
      L.push(`| \`${lit}\` | \`${id}\` | ${inferSemanticName(id, s)} | ${d} |`);
    }
  }
  L.push('');

  L.push('## Unions (with member ids resolved)\n');
  for (const id of Object.keys(unions).sort()) {
    const members = unions[id];
    const s = schemas[id];
    L.push(`### \`${id}\` (${members.length} members)`);
    if (s.describes[0]) L.push(`> ${s.describes[0]}`);
    L.push('');
    L.push('| member id | discriminant | inferred name |');
    L.push('|---|---|---|');
    for (const m of members) {
      const ms = schemas[m];
      let disc = '—';
      if (ms?.typeLiteral) disc = `type:${ms.typeLiteral}`;
      else if (ms?.subtypeLiteral) disc = `subtype:${ms.subtypeLiteral}`;
      const name = ms ? inferSemanticName(m, ms) : '(unresolved)';
      L.push(`| \`${m}\` | ${disc} | ${name} |`);
    }
    L.push('');
  }

  L.push('## Counts by zod kind\n');
  for (const kind of Object.keys(indexes.byKind).sort()) {
    L.push(`- \`${kind}\`: ${indexes.byKind[kind].length}`);
  }

  return L.join('\n');
}

// ---------- canonical identity ----------

interface CanonicalEntry {
  canonicalKey: string;       // "subtype/X" | "type/X" | "anon/<hash>"
  discriminant: { kind: 'subtype' | 'type' | 'anonymous'; value: string | null };
  schemaKind: string;         // zod kind: object, union, ...
  fieldNames: string[];       // top-level keys of v.object({...}), if any — stable across builds
  unionMemberDiscriminants: string[]; // for unions: discriminants of members (sorted), stable
  /**
   * For schemaKind === "enum" with statically-extractable string members:
   * the literal members in source order. Stable across builds (the wire-format
   * vocabulary doesn't depend on minifier output). Absent for non-enum kinds;
   * `null` when this build's enum body uses an opaque `v.enum(<ident>)` form
   * that we can't statically parse.
   */
  enumValues?: string[] | null;
  describeSummary: string | null;     // first describe(), trimmed to 200 chars (drift-prone, advisory only)
  bodyHash: string;           // sha256 of body with minified-id refs mangled away (stable across builds)
  bodyLen: number;
  // The minified id is stored ONLY for cross-referencing back to schemas.json in this version.
  // It MUST NOT be used for cross-version diffing.
  minifiedIdThisVersion: string;
}

/**
 * Replace every minified-id-shaped reference with a placeholder so that
 * a body's hash depends only on its structural content, not on which
 * specific local names this build's minifier happened to assign.
 */
function mangleBodyForHash(body: string): string {
  // Replace `<ident>()` calls — the cross-reference form for lazy schemas.
  return body.replace(/\b[A-Za-z_$][\w$]{0,30}\(\)/g, (m) => {
    const ident = m.slice(0, -2);
    return IDENT_BLACKLIST.has(ident) ? m : '__REF__()';
  });
}

function extractFieldNames(body: string): string[] {
  // Only meaningful for v.object({...}). Pull top-level keys from the first
  // object literal at depth 1. We track brace depth and only collect keys
  // that appear at the outermost level.
  const objStart = body.indexOf('v.object({');
  if (objStart < 0) return [];
  // 'v.object(' is 9 chars; `{` lands at objStart + 9.
  const braceStart = objStart + 'v.object('.length;
  if (body[braceStart] !== '{') return [];
  // scan keys at depth=1 (just inside the outer {})
  const keys: string[] = [];
  let depthBrace = 1;
  let depthParen = 0;
  let depthBracket = 0;
  let inStr: string | null = null;
  let j = braceStart + 1;
  // we look for `<ident>:` at the outermost brace level
  while (j < body.length && depthBrace > 0) {
    const c = body[j];
    const nxt = j + 1 < body.length ? body[j + 1] : '';
    if (inStr) {
      if (c === '\\') { j += 2; continue; }
      if (c === inStr) inStr = null;
    } else if (c === '"' || c === "'" || c === '`') {
      inStr = c;
    } else if (c === '/' && nxt === '/') {
      while (j < body.length && body[j] !== '\n') j++;
    } else if (c === '/' && nxt === '*') {
      j += 2;
      while (j < body.length && !(body[j] === '*' && body[j + 1] === '/')) j++;
      j++;
    } else if (c === '{') depthBrace++;
    else if (c === '}') depthBrace--;
    else if (c === '(') depthParen++;
    else if (c === ')') depthParen--;
    else if (c === '[') depthBracket++;
    else if (c === ']') depthBracket--;
    else if (
      depthBrace === 1 && depthParen === 0 && depthBracket === 0 &&
      /[A-Za-z_$]/.test(c)
    ) {
      // start of a potential key — read identifier, then check for ':'
      let k = j;
      while (k < body.length && /[\w$]/.test(body[k])) k++;
      if (body[k] === ':') {
        keys.push(body.slice(j, k));
        j = k + 1;
        continue;
      } else {
        j = k - 1;
      }
    }
    j++;
  }
  return keys;
}

function canonicalize(
  schemas: Record<string, SchemaEntry>,
  unions: Record<string, string[]>,
): Record<string, CanonicalEntry> {
  const out: Record<string, CanonicalEntry> = {};
  for (const [id, s] of Object.entries(schemas)) {
    let key: string;
    let discriminant: CanonicalEntry['discriminant'];
    if (s.subtypeLiteral) {
      key = `subtype/${s.subtypeLiteral}`;
      discriminant = { kind: 'subtype', value: s.subtypeLiteral };
    } else if (s.typeLiteral) {
      key = `type/${s.typeLiteral}`;
      discriminant = { kind: 'type', value: s.typeLiteral };
    } else {
      const mangled = mangleBodyForHash(s.body);
      const hash = createHash('sha256').update(mangled).digest('hex').slice(0, 16);
      key = `anon/${hash}`;
      discriminant = { kind: 'anonymous', value: null };
    }

    // Union members: collect their discriminants (resolved transitively-by-1-hop),
    // sort, so two builds with reordered minifier output still match.
    const unionMembers = unions[id] ?? [];
    const memberDiscs = unionMembers
      .map(m => {
        const ms = schemas[m];
        if (!ms) return null;
        if (ms.subtypeLiteral) return `subtype/${ms.subtypeLiteral}`;
        if (ms.typeLiteral) return `type/${ms.typeLiteral}`;
        // anon — hash its body too
        const hash = createHash('sha256').update(mangleBodyForHash(ms.body)).digest('hex').slice(0, 16);
        return `anon/${hash}`;
      })
      .filter((x): x is string => !!x)
      .sort();

    const mangled = mangleBodyForHash(s.body);
    const bodyHash = createHash('sha256').update(mangled).digest('hex').slice(0, 16);

    // If the canonical key collides (e.g. two anon schemas with the same hash, or
    // two type/X schemas — yes, the live binary has duplicates), suffix with #N.
    let resolvedKey = key;
    let collisionN = 1;
    while (out[resolvedKey]) {
      resolvedKey = `${key}#${++collisionN}`;
    }

    const entry: CanonicalEntry = {
      canonicalKey: resolvedKey,
      discriminant,
      schemaKind: s.kind,
      fieldNames: extractFieldNames(s.body),
      unionMemberDiscriminants: memberDiscs,
      describeSummary: s.describes[0]?.slice(0, 200) ?? null,
      bodyHash,
      bodyLen: s.bodyLen,
      minifiedIdThisVersion: id,
    };
    // Carry enumValues only for enum-kind schemas. Source order preserved by
    // extractEnumValues; null indicates an opaque `v.enum(<ident>)` body.
    if (s.kind === 'enum') entry.enumValues = s.enumValues;
    out[resolvedKey] = entry;
  }
  return out;
}

// ---------- compare ----------

interface CanonicalSnapshot {
  binary?: string;
  binarySize?: number;
  schemaCount?: number;
  schemas: Record<string, CanonicalEntry>;
  // Optional metadata fields we just round-trip
  [key: string]: unknown;
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

function compareSnapshots(oldSnap: CanonicalSnapshot, newSnap: CanonicalSnapshot): DiffEntry[] {
  const diff: DiffEntry[] = [];
  const oldKeys = new Set(Object.keys(oldSnap.schemas));
  const newKeys = new Set(Object.keys(newSnap.schemas));

  for (const k of [...newKeys].sort()) {
    if (!oldKeys.has(k)) diff.push({ key: k, status: 'added' });
  }
  for (const k of [...oldKeys].sort()) {
    if (!newKeys.has(k)) diff.push({ key: k, status: 'removed' });
  }
  for (const k of [...newKeys].sort()) {
    if (!oldKeys.has(k)) continue;
    const o = oldSnap.schemas[k];
    const n = newSnap.schemas[k];
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
    // enumValues diff (presence-based; order-preserving on output but the
    // diff is set-based so reordering alone doesn't show as a change — that
    // matches how unionMemberDiscriminants behaves).
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
  bun extract-claude-schemas.ts extract <binary> [--out <dir>]
  bun extract-claude-schemas.ts compare <old-canonical.json> <new-canonical.json> [--out <dir>]`);
  process.exit(1);
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
  console.error(`reading ${binary} (${size.toLocaleString()} bytes)…`);

  const schemas = extract(binary);
  const indexes = buildIndexes(schemas);
  const unions = resolveUnions(schemas);
  const canonical = canonicalize(schemas, unions);

  writeFileSync(
    join(outDir, 'schemas.json'),
    JSON.stringify({ binary, binarySize: size, schemaCount: Object.keys(schemas).length, indexes, schemas }, null, 2),
  );
  writeFileSync(
    join(outDir, 'canonical.json'),
    JSON.stringify({
      binary,
      binarySize: size,
      schemaCount: Object.keys(canonical).length,
      schemas: canonical,
    }, null, 2),
  );
  writeFileSync(
    join(outDir, 'unions.json'),
    JSON.stringify(
      Object.fromEntries(
        Object.entries(unions).map(([id, members]) => [
          id,
          {
            members,
            memberDiscriminants: members.map(m => ({
              id: m,
              type: schemas[m]?.typeLiteral ?? null,
              subtype: schemas[m]?.subtypeLiteral ?? null,
              inferredName: schemas[m] ? inferSemanticName(m, schemas[m]) : null,
            })),
          },
        ]),
      ),
      null,
      2,
    ),
  );

  const rawJsLines: string[] = [];
  for (const id of Object.keys(schemas).sort()) {
    rawJsLines.push(`/* ${id} */ ${schemas[id].body}`);
  }
  writeFileSync(join(outDir, 'raw.js'), rawJsLines.join('\n'));
  writeFileSync(join(outDir, 'report.md'), renderReport(schemas, indexes, unions));

  // Summarize enum coverage so downstream readers know whether anything
  // slipped through the static parser (opaque `v.enum(<ident>)` shapes).
  let enumTotal = 0;
  let enumParsed = 0;
  let enumOpaque = 0;
  for (const s of Object.values(schemas)) {
    if (s.kind !== 'enum') continue;
    enumTotal++;
    if (s.enumValues) enumParsed++;
    else enumOpaque++;
  }
  console.error(
    `extracted ${Object.keys(schemas).length} schemas (${Object.keys(canonical).length} canonical keys); ${Object.keys(unions).length} unions; ${Object.keys(indexes.bySubtypeLiteral).length} subtypes; enums: ${enumParsed}/${enumTotal} parsed (${enumOpaque} opaque)`,
  );
  console.error(`wrote: ${outDir}/{schemas,canonical,unions}.json  raw.js  report.md`);

} else if (cmd === 'compare') {
  const oldPath = argv[1];
  const newPath = argv[2];
  if (!oldPath || !newPath) usage();
  let outDir: string | null = null;
  for (let i = 3; i < argv.length; i++) {
    if (argv[i] === '--out' || argv[i] === '-o') outDir = argv[++i] ?? null;
  }
  const oldSnap: CanonicalSnapshot = JSON.parse(readFileSync(oldPath, 'utf8'));
  const newSnap: CanonicalSnapshot = JSON.parse(readFileSync(newPath, 'utf8'));
  const diff = compareSnapshots(oldSnap, newSnap);
  const md = renderDiffMarkdown(diff);
  if (outDir) {
    mkdirSync(outDir, { recursive: true });
    writeFileSync(join(outDir, 'diff.json'), JSON.stringify(diff, null, 2));
    writeFileSync(join(outDir, 'diff.md'), md);
    console.error(`wrote: ${outDir}/diff.json  diff.md`);
  } else {
    process.stdout.write(md);
  }
  // Non-zero exit if there's a diff — useful for CI.
  if (diff.length > 0) process.exit(2);

} else {
  usage();
}
