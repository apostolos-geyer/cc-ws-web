#!/usr/bin/env bun
/**
 * Compare the typed wire-protocol in a target TypeScript file against a
 * freshly extracted canonical.json (see `extract.ts`) and report gaps:
 *
 *   - subtypes/types the binary emits but the target doesn't model
 *   - subtypes/types the target claims that aren't in the binary anymore
 *   - structural fieldName drift for variants that overlap (advisory)
 *
 * The check is intentionally textual: TS sources use string literals as
 * discriminants (`subtype: "init"`, `type: "assistant"`) and these are stable
 * anchors regardless of how the file was authored.
 *
 * Usage:
 *   bun codegen/check-gaps.ts <canonical.json> <target.ts>
 *
 * Exit codes:
 *   0   no gaps in the modelled surface
 *   2   gaps detected (CI should fail)
 *
 * Two kinds of "gap" are distinguished so a maintainer can triage quickly:
 *
 *   missing-in-target       binary emits this literal, target doesn't.
 *                           If our consumers narrow on it, they'll fall
 *                           through to UnknownSystemFrame / UnknownControlRequest
 *                           — functional, but un-typed. Adding a variant is
 *                           cheap and gives narrowing back.
 *
 *   stale-in-target         target has this literal, binary doesn't.
 *                           Either renamed/removed by Anthropic, or this is
 *                           an OUTBOUND literal we send to the binary
 *                           (the binary's parsers wouldn't necessarily have a
 *                           schema for it). The check's allowlists filter
 *                           the latter.
 */

import { readFileSync } from 'node:fs';

interface CanonicalEntry {
  canonicalKey: string;
  discriminant: { kind: 'subtype' | 'type' | 'anonymous'; value: string | null };
  schemaKind: string;
  fieldNames: string[];
  unionMemberDiscriminants: string[];
  enumValues?: string[] | null;
  describeSummary: string | null;
  bodyHash: string;
  bodyLen: number;
  minifiedIdThisVersion: string | null;
}

interface CanonicalSnapshot {
  binary?: string;
  binarySize?: number;
  schemaCount?: number;
  /** V2 canonical files use the `canonical` key; older shapes used `schemas`. Accept both. */
  canonical?: Record<string, CanonicalEntry>;
  schemas?: Record<string, CanonicalEntry>;
}

function loadCanonical(path: string): Record<string, CanonicalEntry> {
  const snap: CanonicalSnapshot = JSON.parse(readFileSync(path, 'utf8'));
  return snap.canonical ?? snap.schemas ?? {};
}

// Subtypes / types we send TO the binary; the binary doesn't echo them back
// as inbound frames, so they may not appear in canonical.json. Keep this list
// short and explicit — anything not listed here will surface as a gap.
const OUTBOUND_ONLY_SUBTYPES = new Set<string>([
  'end_session',
]);
const OUTBOUND_ONLY_TYPES = new Set<string>([]);

// Literals that the binary defines INSIDE union bodies (StreamEvent children,
// content-block types, etc.) which the extractor surfaces only as the
// containing union's first discriminant, not as separate canonical keys. They
// are legitimately present in the target even though canonical.json doesn't
// show them as top-level `type/X` entries. Move out of this list as the
// extractor gains nested-in-union extraction.
const NESTED_TYPE_ALLOWLIST = new Set<string>([
  // stream_event children
  'message_start', 'message_delta', 'message_stop',
  'content_block_start', 'content_block_delta', 'content_block_stop',
  'text_delta', 'thinking_delta', 'input_json_delta', 'signature_delta',
  // content blocks
  'text', 'thinking', 'tool_use', 'tool_result', 'image',
  // top-level system frame discriminant — extractor sees system as union of subtype variants
  'system',
]);

// Literals that the typed client uses internally (typed contracts) but don't
// correspond to wire-format identifiers from the binary. These should not
// surface as "stale" — they're load-bearing on the typed-client side.
const INTERNAL_PROTOCOL_LITERALS = new Set<string>([
  // session-mode tags from SessionMode
  'new', 'continue', 'resume',
  // permission-decision behaviours
  'allow', 'deny',
  // task-state values
  'idle', 'running', 'requires_action', 'completed', 'failed', 'killed', 'stopped',
  // _local bridge frames
  'respawn',
]);

/**
 * Snake- and camel-case quoted string literals in the source. Catches:
 *
 *   "X"                       (double-quoted)
 *   'X'                       (single-quoted)
 *   '\'X\''                   (escaped-single, as the codegen emits when an
 *                              arktype literal expression is embedded inside
 *                              a single-quoted JS string)
 *
 * Generated arktype schemas use the third form everywhere — `'subtype':
 * '\'initialize\''` — so the check would otherwise miss every wire literal
 * in the generated file. We tolerate camelCase identifiers (e.g. wire
 * literal `addRules` / `setMode`) by allowing an uppercase letter past the
 * first position.
 */
function protocolLiterals(source: string): Set<string> {
  const re = /[a-z][a-zA-Z0-9_-]*/.source;
  const out = new Set<string>();
  for (const m of source.matchAll(new RegExp(`"(${re})"`, "g"))) out.add(m[1]);
  for (const m of source.matchAll(new RegExp(`'(${re})'`, "g"))) out.add(m[1]);
  // Escaped-single form: `'\''X\''` → captures `X`.
  for (const m of source.matchAll(new RegExp(`\\\\'(${re})\\\\'`, "g"))) out.add(m[1]);
  return out;
}

/**
 * Return field names for a subtype, preferring the compound `type/X+subtype/Y`
 * variants over the bare `subtype/Y`. When multiple compound variants exist
 * for the same subtype, returns the field union.
 */
function fieldNamesFor(canonical: Record<string, CanonicalEntry>, subtype: string): string[] | null {
  const matches: string[] = [];
  for (const [k, entry] of Object.entries(canonical)) {
    if (k === `subtype/${subtype}` || k.startsWith(`subtype/${subtype}#`)) {
      for (const f of entry.fieldNames) if (!matches.includes(f)) matches.push(f);
    }
    if (k.includes(`+subtype/${subtype}`) || k.includes(`+subtype/${subtype}#`)) {
      for (const f of entry.fieldNames) if (!matches.includes(f)) matches.push(f);
    }
  }
  return matches.length ? matches : null;
}

interface Report {
  targetPath: string;
  missingSubtypesInTarget: string[];
  missingTypesInTarget: string[];
  staleSubtypesInTarget: string[];
  staleTypesInTarget: string[];
  fieldDriftAdvisory: Array<{
    subtype: string;
    binaryFields: string[];
    fields: string[];
  }>;
}

function render(r: Report): string {
  const L: string[] = [];
  L.push('# Protocol-vs-binary gap report\n');
  L.push(`- target: ${r.targetPath}`);
  L.push(`- missing subtypes in target: **${r.missingSubtypesInTarget.length}**`);
  L.push(`- missing types in target: **${r.missingTypesInTarget.length}**`);
  L.push(`- stale subtypes in target: **${r.staleSubtypesInTarget.length}**`);
  L.push(`- stale types in target: **${r.staleTypesInTarget.length}**`);
  L.push('');
  if (r.missingSubtypesInTarget.length) {
    L.push('## Missing subtypes (binary emits, target unmodelled)\n');
    for (const s of r.missingSubtypesInTarget) L.push(`- \`${s}\``);
    L.push('');
  }
  if (r.missingTypesInTarget.length) {
    L.push('## Missing types (binary emits, target unmodelled)\n');
    for (const t of r.missingTypesInTarget) L.push(`- \`${t}\``);
    L.push('');
  }
  if (r.staleTypesInTarget.length) {
    L.push('## Stale literals (target claims, binary lacks)\n');
    L.push('Filtered against the outbound-only / nested-type / internal-typed-client allowlists in the script — if a literal lands here, it\'s either been renamed by Anthropic, removed in this version, or the allowlist needs updating.\n');
    for (const t of r.staleTypesInTarget) L.push(`- \`${t}\``);
    L.push('');
  }
  if (r.fieldDriftAdvisory.length) {
    L.push('## Field drift (advisory — target text scan)\n');
    L.push('Heuristic: subtype variants where the canonical binary has field names that the target text doesn\'t reference. Run this as a hint, not a hard check — the target may legitimately ignore fields it doesn\'t need.\n');
    for (const d of r.fieldDriftAdvisory) {
      L.push(`### \`subtype/${d.subtype}\``);
      L.push(`- binary fields: ${d.binaryFields.map(f => `\`${f}\``).join(', ')}`);
      L.push(`- fields not appearing in target text: ${d.fields.map(f => `\`${f}\``).join(', ')}`);
      L.push('');
    }
  }
  return L.join('\n');
}

const argv = process.argv.slice(2);
if (argv.length < 2) {
  console.error('usage: bun codegen/check-gaps.ts <canonical.json> <target.ts>');
  process.exit(1);
}
const canonicalPath = argv[0];
const targetPath = argv[1];

const canonical = loadCanonical(canonicalPath);
const target = readFileSync(targetPath, 'utf8');

const binarySubtypes = new Set<string>();
const binaryTypes = new Set<string>();
for (const e of Object.values(canonical)) {
  if (e.discriminant.kind === 'subtype' && e.discriminant.value) binarySubtypes.add(e.discriminant.value);
  if (e.discriminant.kind === 'type' && e.discriminant.value) binaryTypes.add(e.discriminant.value);
}

const targetLits = protocolLiterals(target);

const missingSub = [...binarySubtypes].filter(s => !targetLits.has(s)).sort();
const missingType = [...binaryTypes].filter(t => !targetLits.has(t)).sort();
const allBinaryLits = new Set<string>([...binarySubtypes, ...binaryTypes]);
const staleAll = [...targetLits]
  .filter(s =>
    !allBinaryLits.has(s) &&
    !OUTBOUND_ONLY_SUBTYPES.has(s) &&
    !OUTBOUND_ONLY_TYPES.has(s) &&
    !NESTED_TYPE_ALLOWLIST.has(s) &&
    !INTERNAL_PROTOCOL_LITERALS.has(s),
  )
  .sort();
const staleSub: string[] = [];
const staleType: string[] = staleAll;

const fieldDrift: Report['fieldDriftAdvisory'] = [];
for (const s of [...binarySubtypes].filter(s => targetLits.has(s)).sort()) {
  const binFields = fieldNamesFor(canonical, s) ?? [];
  if (!binFields.length) continue;
  const re = new RegExp(`subtype\\s*:\\s*"${s}"[\\s\\S]{0,800}`);
  const block = target.match(re)?.[0] ?? '';
  const missingFields = binFields.filter(f => !new RegExp(`\\b${f}\\b`).test(block));
  if (missingFields.length) {
    fieldDrift.push({
      subtype: s,
      binaryFields: binFields,
      fields: missingFields,
    });
  }
}

const report: Report = {
  targetPath,
  missingSubtypesInTarget: missingSub,
  missingTypesInTarget: missingType,
  staleSubtypesInTarget: staleSub,
  staleTypesInTarget: staleType,
  fieldDriftAdvisory: fieldDrift,
};

process.stdout.write(render(report));
// Phase 2 update: the "stale" signal is informational only against the
// codegen-emitted schemas.ts, because every enum member and field-name
// literal in the file would otherwise show up as "stale" (they're not
// discriminator literals on the wire). The hard gate is `missing*` —
// every binary-emitted discriminant must show up in the generated file.
const hasHardGap = missingSub.length + missingType.length > 0;
if (staleSub.length + staleType.length > 0) {
  process.stderr.write(
    `[check-gaps] note: ${staleSub.length + staleType.length} string literals in target don't match any binary discriminator (likely field values / enum members — not a structural gap). Hard gate ignores these.\n`,
  );
}
process.exit(hasHardGap ? 2 : 0);
