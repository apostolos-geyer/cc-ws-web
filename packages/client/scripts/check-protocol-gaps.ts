#!/usr/bin/env bun
/**
 * Compare the typed wire-protocol in src/protocol.ts against a freshly
 * extracted canonical.json (see extract-claude-schemas.ts) and report gaps:
 *
 *   - subtypes/types the binary emits but protocol.ts doesn't model
 *   - subtypes/types protocol.ts claims that aren't in the binary anymore
 *   - structural fieldName drift for variants that overlap (advisory)
 *
 * The check is intentionally textual: protocol.ts uses TS string literals as
 * discriminants (`subtype: "init"`, `type: "assistant"`) and these are stable
 * anchors. No TS compiler API dep — works on a Bun-only repo.
 *
 * Usage:
 *   bun check-protocol-gaps.ts <canonical.json> <protocol.ts>
 *
 * Exit codes:
 *   0   no gaps in the modelled surface
 *   2   gaps detected (CI should fail)
 *
 * Two kinds of "gap" are distinguished so a maintainer can triage quickly:
 *
 *   missing-in-protocol     binary emits this literal, protocol.ts doesn't.
 *                           If our consumers narrow on it, they'll fall
 *                           through to UnknownSystemFrame / UnknownControlRequest
 *                           — functional, but un-typed. Adding a variant is
 *                           cheap and gives narrowing back.
 *
 *   stale-in-protocol       protocol.ts has this literal, binary doesn't.
 *                           Either renamed/removed by Anthropic, or this is
 *                           an OUTBOUND literal we send to the binary
 *                           (the binary's parsers wouldn't necessarily have a
 *                           schema for it). The check's `--outbound-allow`
 *                           list filters out the latter.
 */

import { readFileSync } from 'node:fs';

interface CanonicalSnapshot {
  binary?: string;
  binarySize?: number;
  aliases?: { lazy: string; zod: string[] };
  schemaCount?: number;
  schemas: Record<string, {
    canonicalKey: string;
    discriminant: { kind: 'subtype' | 'type' | 'anonymous'; value: string | null };
    schemaKind: string;
    fieldNames: string[];
    unionMemberDiscriminants: string[];
    enumValues?: string[] | null;
    describeSummary: string | null;
    bodyHash: string;
    bodyLen: number;
    minifiedIdThisVersion: string;
  }>;
}

// Subtypes / types we send TO the binary; the binary doesn't echo them back
// as inbound frames, so they may not appear in canonical.json. Keep this list
// short and explicit — anything not listed here will surface as a gap.
const OUTBOUND_ONLY_SUBTYPES = new Set<string>([
  'end_session',
]);
const OUTBOUND_ONLY_TYPES = new Set<string>([]);

// Literals that the binary defines INSIDE union bodies (StreamEvent children,
// content-block types, etc.) which the V1 extractor surfaces only as the
// containing union's first discriminant, not as separate canonical keys. They
// are legitimately present in protocol.ts even though canonical.json doesn't
// show them as top-level `type/X` entries. Move out of this list when the
// extractor gains nested-in-union extraction (a V2 improvement).
const NESTED_TYPE_ALLOWLIST = new Set<string>([
  // stream_event children
  'message_start', 'message_delta', 'message_stop',
  'content_block_start', 'content_block_delta', 'content_block_stop',
  'text_delta', 'thinking_delta', 'input_json_delta', 'signature_delta',
  // content blocks
  'text', 'thinking', 'tool_use', 'tool_result', 'image',
  // top-level system frame discriminant — V1 limit: extractor sees system as union of subtype variants
  'system',
]);

// Literals that protocol.ts uses internally (typed-client contracts) but
// don't correspond to wire-format identifiers from the binary. These should
// not surface as "stale" — they're load-bearing on the typed-client side.
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
 * Set of snake_case (or snake-with-dash) quoted string literals appearing
 * anywhere in the source text. Catches both `subtype: "X"` discriminator
 * positions and `type Foo = "X" | "Y"` union-alias positions, which is what
 * we need — protocol.ts uses both styles for wire-format identifiers.
 *
 * False positives are limited to whatever snake_case strings happen to be
 * in TS comments/method names; in practice protocol.ts only uses snake_case
 * literals for wire identifiers, so this is a clean signal.
 */
function protocolLiterals(source: string): Set<string> {
  const re = /"([a-z][a-z0-9_-]*)"/g;
  const out = new Set<string>();
  for (const m of source.matchAll(re)) out.add(m[1]);
  return out;
}

/**
 * Return field names for a subtype, preferring the compound `type/X+subtype/Y`
 * variants over the bare `subtype/Y`. When multiple compound variants exist
 * for the same subtype (e.g. result-frame success vs control_response
 * success), we return the field union of all variants.
 */
function fieldNamesFor(snap: CanonicalSnapshot, subtype: string): string[] | null {
  const matches: string[] = [];
  for (const [k, entry] of Object.entries(snap.schemas)) {
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
  binaryVersion?: string;
  protocolPath: string;
  missingSubtypesInProtocol: string[];
  missingTypesInProtocol: string[];
  staleSubtypesInProtocol: string[];
  staleTypesInProtocol: string[];
  fieldDriftAdvisory: Array<{
    subtype: string;
    binaryFields: string[];
    protocolFieldsHint: string[];
    notIn: 'protocol' | 'binary';
    fields: string[];
  }>;
}

function render(r: Report): string {
  const L: string[] = [];
  L.push('# Protocol-vs-binary gap report\n');
  L.push(`- protocol: ${r.protocolPath}`);
  if (r.binaryVersion) L.push(`- binary: ${r.binaryVersion}`);
  L.push(`- missing subtypes in protocol.ts: **${r.missingSubtypesInProtocol.length}**`);
  L.push(`- missing types in protocol.ts: **${r.missingTypesInProtocol.length}**`);
  L.push(`- stale subtypes in protocol.ts: **${r.staleSubtypesInProtocol.length}**`);
  L.push(`- stale types in protocol.ts: **${r.staleTypesInProtocol.length}**`);
  L.push('');
  if (r.missingSubtypesInProtocol.length) {
    L.push('## Missing subtypes (binary emits, protocol.ts unmodelled)\n');
    for (const s of r.missingSubtypesInProtocol) L.push(`- \`${s}\``);
    L.push('');
  }
  if (r.missingTypesInProtocol.length) {
    L.push('## Missing types (binary emits, protocol.ts unmodelled)\n');
    for (const t of r.missingTypesInProtocol) L.push(`- \`${t}\``);
    L.push('');
  }
  if (r.staleTypesInProtocol.length) {
    L.push('## Stale literals (protocol.ts claims, binary lacks)\n');
    L.push('Filtered against the outbound-only / nested-type / internal-typed-client allowlists in the script — if a literal lands here, it\'s either been renamed by Anthropic, removed in this version, or the allowlist needs updating.\n');
    for (const t of r.staleTypesInProtocol) L.push(`- \`${t}\``);
    L.push('');
  }
  if (r.fieldDriftAdvisory.length) {
    L.push('## Field drift (advisory — protocol.ts text scan)\n');
    L.push('Heuristic: subtype variants where the canonical binary has field names that the protocol.ts text doesn\'t reference (or vice versa). Run this as a hint, not a hard check — protocol.ts may legitimately ignore fields it doesn\'t need.\n');
    for (const d of r.fieldDriftAdvisory) {
      L.push(`### \`subtype/${d.subtype}\``);
      L.push(`- binary fields: ${d.binaryFields.map(f => `\`${f}\``).join(', ')}`);
      L.push(`- fields not appearing in protocol.ts text: ${d.fields.map(f => `\`${f}\``).join(', ')}`);
      L.push('');
    }
  }
  return L.join('\n');
}

const argv = process.argv.slice(2);
if (argv.length < 2) {
  console.error('usage: bun check-protocol-gaps.ts <canonical.json> <protocol.ts>');
  process.exit(1);
}
const canonicalPath = argv[0];
const protocolPath = argv[1];

const snap: CanonicalSnapshot = JSON.parse(readFileSync(canonicalPath, 'utf8'));
const proto = readFileSync(protocolPath, 'utf8');

const binarySubtypes = new Set<string>();
const binaryTypes = new Set<string>();
for (const e of Object.values(snap.schemas)) {
  if (e.discriminant.kind === 'subtype' && e.discriminant.value) binarySubtypes.add(e.discriminant.value);
  if (e.discriminant.kind === 'type' && e.discriminant.value) binaryTypes.add(e.discriminant.value);
}

const protoLits = protocolLiterals(proto);

const missingSub = [...binarySubtypes].filter(s => !protoLits.has(s)).sort();
const missingType = [...binaryTypes].filter(t => !protoLits.has(t)).sort();
// "stale" = literal in protocol.ts that the binary doesn't have at all (as
// either subtype or type, or in the nested allowlist or outbound-only list).
const allBinaryLits = new Set<string>([...binarySubtypes, ...binaryTypes]);
const staleAll = [...protoLits]
  .filter(s =>
    !allBinaryLits.has(s) &&
    !OUTBOUND_ONLY_SUBTYPES.has(s) &&
    !OUTBOUND_ONLY_TYPES.has(s) &&
    !NESTED_TYPE_ALLOWLIST.has(s) &&
    // Non-wire literals we don't want to flag — session-mode tags, behaviours,
    // status enums protocol.ts uses internally, etc. (allowlisted in the source
    // because they're stable contracts of the typed client, not the binary).
    !INTERNAL_PROTOCOL_LITERALS.has(s),
  )
  .sort();
const staleSub: string[] = [];
const staleType: string[] = staleAll;

// Field drift advisory: for each subtype both sides know about, list binary
// fields that don't textually appear in protocol.ts.
const fieldDrift: Report['fieldDriftAdvisory'] = [];
for (const s of [...binarySubtypes].filter(s => protoLits.has(s)).sort()) {
  const binFields = fieldNamesFor(snap, s) ?? [];
  if (!binFields.length) continue;
  // Bound textual check around the discriminator line so we don't get
  // accidental matches against an unrelated variant elsewhere in the file.
  const re = new RegExp(`subtype\\s*:\\s*"${s}"[\\s\\S]{0,800}`);
  const block = proto.match(re)?.[0] ?? '';
  const missingFields = binFields.filter(f => !new RegExp(`\\b${f}\\b`).test(block));
  if (missingFields.length) {
    fieldDrift.push({
      subtype: s,
      binaryFields: binFields,
      protocolFieldsHint: [],
      notIn: 'protocol',
      fields: missingFields,
    });
  }
}

const report: Report = {
  binaryVersion: snap.binary,
  protocolPath,
  missingSubtypesInProtocol: missingSub,
  missingTypesInProtocol: missingType,
  staleSubtypesInProtocol: staleSub,
  staleTypesInProtocol: staleType,
  fieldDriftAdvisory: fieldDrift,
};

process.stdout.write(render(report));
const hasHardGap =
  missingSub.length + missingType.length + staleSub.length + staleType.length > 0;
process.exit(hasHardGap ? 2 : 0);
