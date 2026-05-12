/**
 * Pure resolver: `(canonical, patches) -> annotatedCanonical`.
 *
 * Patches authored under `codegen/snapshots/<ver>/patches.ts` mutate the
 * structural canonical produced by `extract.ts` so that `generate.ts` can
 * emit fully-typed arktype schemas + TypeScript types. Each patch kind from
 * `patch-dsl.ts` maps to one mutation here:
 *
 *   - `renameSchema`   : rewrite the inferred name in the name map
 *   - `resolveAnon`    : assign a human-readable name to an anonymous entry
 *                       keyed by its canonical-key (e.g. `anon/abc123...`)
 *   - `fieldType`      : override a single field's RHS expression string
 *   - `addField`       : add a missing field (with explicit arktype expr)
 *   - `removeField`    : drop a field
 *   - `discriminantHint`: declare missing discriminant info for a schema
 *
 * Order matters: we apply renames + resolveAnon first (they affect the name
 * map), then field-level mutations against the renamed schemas. Patches that
 * reference a non-existent canonical key or schema name throw with a clear
 * error — that's how the patch-DSL keeps authors honest (typo → fail loud).
 *
 * Used by: `generate.ts` only. Pure function, no IO.
 */

import type { Patch } from "./patch-dsl";

export interface CanonicalField {
  name: string;
  rhs: string;
}

export interface CanonicalEntry {
  canonicalKey: string;
  bodyHash: string;
  bodyLen: number;
  describeSummary: string | null;
  discriminant: {
    kind: "type" | "subtype" | "anonymous";
    value: string | null;
  };
  enumValues?: string[] | null;
  fieldNames: string[];
  fields: CanonicalField[];
  minifiedIdThisVersion: string | null;
  schemaKind: string;
  unionMemberDiscriminants: string[];
}

export interface CanonicalSnapshot {
  canonical: Record<string, CanonicalEntry>;
  schemaCount?: number;
}

export interface AnnotatedSchema extends CanonicalEntry {
  /** The name this schema will be emitted under. */
  emittedName: string;
  /** Override discriminant hint provided via patch (kind/values). */
  discriminantOverride?: { on: "type" | "subtype"; values: string[] };
}

export interface AnnotatedCanonical {
  /** Map from canonical key → annotated entry, in deterministic key order. */
  entries: Map<string, AnnotatedSchema>;
  /** Map from emitted name → canonical key. */
  nameToKey: Map<string, string>;
  /** Map from canonical key → emitted name (inverse of nameToKey). */
  keyToName: Map<string, string>;
  /** Count of applied patches (used by coverage report). */
  appliedPatchCount: number;
}

/**
 * Best-effort heuristic to turn a canonical key into a Pascal-cased schema
 * name. Used as the initial value of the name map; `renameSchema` patches
 * override it, `resolveAnon` patches replace anonymous-bucket names entirely.
 *
 * Examples:
 *   subtype/initialize             -> InitializeRequest
 *   subtype/initialize#2           -> InitializeRequest2
 *   type/system+subtype/init       -> SystemInit
 *   type/system+subtype/init#3     -> SystemInit3
 *   type/result                    -> ResultMessage
 *   type/result+subtype/success    -> ResultSuccess
 *   anon/abc123def456              -> AnonAbc123Def456
 */
function pascalCase(s: string): string {
  return s
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
}

export function inferSchemaName(key: string): string {
  // Split off `#N` suffix used to disambiguate same-discriminant siblings.
  const hashIdx = key.indexOf("#");
  const baseKey = hashIdx >= 0 ? key.slice(0, hashIdx) : key;
  const suffix = hashIdx >= 0 ? key.slice(hashIdx + 1) : "";

  let name: string;
  if (baseKey.startsWith("anon/")) {
    // Anonymous canonicals get a `Anon`-prefixed stable name from their hash;
    // resolveAnon patches replace this with a human-readable name. We deliberately
    // include the full hash so two anon names never collide.
    name = "Anon" + pascalCase(baseKey.slice("anon/".length));
  } else if (baseKey.includes("+")) {
    // Compound: type/system+subtype/init -> SystemInit (drop the leading type/, drop the subtype/ prefix).
    const parts = baseKey.split("+");
    const cleaned = parts
      .map((p) => {
        if (p.startsWith("type/")) return p.slice("type/".length);
        if (p.startsWith("subtype/")) return p.slice("subtype/".length);
        return p;
      })
      .map(pascalCase)
      .join("");
    name = cleaned;
  } else if (baseKey.startsWith("subtype/")) {
    // Bare subtype/X — pin the conventional "Request" suffix so
    // subtype/initialize doesn't collide with a hypothetical
    // type/initialize.
    name = pascalCase(baseKey.slice("subtype/".length)) + "Request";
  } else if (baseKey.startsWith("type/")) {
    name = pascalCase(baseKey.slice("type/".length)) + "Message";
  } else {
    name = pascalCase(baseKey);
  }

  return suffix ? name + suffix : name;
}

export function applyPatches(
  snapshot: CanonicalSnapshot,
  patches: Patch[],
): AnnotatedCanonical {
  // Step 1 — clone canonical entries so we don't mutate the input.
  const entries = new Map<string, AnnotatedSchema>();
  for (const [k, e] of Object.entries(snapshot.canonical).sort(([a], [b]) =>
    a < b ? -1 : a > b ? 1 : 0,
  )) {
    entries.set(k, {
      ...e,
      fields: e.fields.map((f) => ({ ...f })),
      fieldNames: [...e.fieldNames],
      enumValues: e.enumValues ? [...e.enumValues] : null,
      unionMemberDiscriminants: [...e.unionMemberDiscriminants],
      emittedName: inferSchemaName(k),
    });
  }

  // Step 2 — sort patches into deterministic application order.
  // Renames + resolveAnon first (they change the name map).
  // Then field mutations + discriminantHint (they reference schemas by name).
  const order: Record<Patch["kind"], number> = {
    renameSchema: 0,
    resolveAnon: 1,
    discriminantHint: 2,
    addField: 3,
    fieldType: 4,
    removeField: 5,
  };
  const sorted = [...patches].sort((a, b) => {
    const o = order[a.kind] - order[b.kind];
    if (o !== 0) return o;
    // Within same kind, sort by some stable key for determinism.
    const ak = stablePatchKey(a);
    const bk = stablePatchKey(b);
    return ak < bk ? -1 : ak > bk ? 1 : 0;
  });

  let applied = 0;
  for (const patch of sorted) {
    if (patch.kind === "renameSchema") {
      const target = findEntryByName(entries, patch.from);
      if (!target) {
        throw new Error(
          `[apply-patches] renameSchema: schema "${patch.from}" not found (reason: ${patch.reason})`,
        );
      }
      target.emittedName = patch.to;
      applied++;
    } else if (patch.kind === "resolveAnon") {
      const target = entries.get(patch.canonicalKey);
      if (!target) {
        throw new Error(
          `[apply-patches] resolveAnon: canonicalKey "${patch.canonicalKey}" not found in canonical (reason: ${patch.reason})`,
        );
      }
      target.emittedName = patch.name;
      applied++;
    }
  }

  // Validate that emitted names are unique after rename/resolveAnon (helps catch typos).
  const seenNames = new Map<string, string>();
  for (const [k, e] of entries) {
    const prev = seenNames.get(e.emittedName);
    if (prev) {
      throw new Error(
        `[apply-patches] emitted name "${e.emittedName}" used by both "${prev}" and "${k}"; add a renameSchema or resolveAnon patch to disambiguate`,
      );
    }
    seenNames.set(e.emittedName, k);
  }

  // Step 3 — apply field-level / discriminant patches by emitted name.
  for (const patch of sorted) {
    if (
      patch.kind === "renameSchema" ||
      patch.kind === "resolveAnon"
    ) {
      continue;
    }
    if (patch.kind === "discriminantHint") {
      const target = findEntryByName(entries, patch.schema);
      if (!target) {
        throw new Error(
          `[apply-patches] discriminantHint: schema "${patch.schema}" not found (reason: ${patch.reason})`,
        );
      }
      target.discriminantOverride = { on: patch.on, values: [...patch.values] };
      applied++;
      continue;
    }
    if (patch.kind === "addField") {
      const target = findEntryByName(entries, patch.schema);
      if (!target) {
        throw new Error(
          `[apply-patches] addField: schema "${patch.schema}" not found (reason: ${patch.reason})`,
        );
      }
      if (target.fieldNames.includes(patch.field)) {
        throw new Error(
          `[apply-patches] addField: schema "${patch.schema}" already has field "${patch.field}" (reason: ${patch.reason})`,
        );
      }
      target.fieldNames.push(patch.field);
      target.fields.push({ name: patch.field, rhs: `__PATCH__:${patch.arktype}` });
      applied++;
      continue;
    }
    if (patch.kind === "removeField") {
      const target = findEntryByName(entries, patch.schema);
      if (!target) {
        throw new Error(
          `[apply-patches] removeField: schema "${patch.schema}" not found (reason: ${patch.reason})`,
        );
      }
      const idx = target.fieldNames.indexOf(patch.field);
      if (idx < 0) {
        throw new Error(
          `[apply-patches] removeField: schema "${patch.schema}" has no field "${patch.field}" (reason: ${patch.reason})`,
        );
      }
      target.fieldNames.splice(idx, 1);
      target.fields.splice(idx, 1);
      applied++;
      continue;
    }
    if (patch.kind === "fieldType") {
      const target = findEntryByName(entries, patch.schema);
      if (!target) {
        throw new Error(
          `[apply-patches] fieldType: schema "${patch.schema}" not found (reason: ${patch.reason})`,
        );
      }
      const f = target.fields.find((f) => f.name === patch.field);
      if (!f) {
        throw new Error(
          `[apply-patches] fieldType: schema "${patch.schema}" has no field "${patch.field}" (reason: ${patch.reason})`,
        );
      }
      // Sentinel-prefix the RHS so the generator knows this is a patch-provided
      // arktype expression literal (not a Zod-expression-string to translate).
      f.rhs = `__PATCH__:${patch.arktype}`;
      applied++;
      continue;
    }
  }

  const nameToKey = new Map<string, string>();
  const keyToName = new Map<string, string>();
  for (const [k, e] of entries) {
    nameToKey.set(e.emittedName, k);
    keyToName.set(k, e.emittedName);
  }

  return { entries, nameToKey, keyToName, appliedPatchCount: applied };
}

function findEntryByName(
  entries: Map<string, AnnotatedSchema>,
  name: string,
): AnnotatedSchema | null {
  for (const e of entries.values()) {
    if (e.emittedName === name) return e;
  }
  return null;
}

function stablePatchKey(p: Patch): string {
  switch (p.kind) {
    case "renameSchema":
      return `${p.kind}:${p.from}:${p.to}`;
    case "resolveAnon":
      return `${p.kind}:${p.canonicalKey}:${p.name}`;
    case "discriminantHint":
      return `${p.kind}:${p.schema}:${p.on}`;
    case "addField":
    case "fieldType":
    case "removeField":
      return `${p.kind}:${p.schema}:${p.field}`;
  }
}
