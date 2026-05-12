/**
 * Patch DSL — the human/AI override surface for codegen.
 *
 * `extract.ts` produces a structural canonical of the binary's Zod schemas.
 * `generate.ts` translates that into arktype, but the canonical alone can't
 * type-resolve every field (anonymous helpers, opaque cross-refs, complex
 * shapes). Patches fill the gap.
 *
 * Each patch carries a `reason` string for audit-trail provenance. Patches
 * are authored per-snapshot under `codegen/snapshots/<ver>/patches.ts` and
 * applied by `apply-patches.ts` during codegen. `definePatches()` is just an
 * identity helper that gives TypeScript inference + name resolution.
 */

export type Patch =
  | {
      kind: "fieldType";
      schema: string;
      field: string;
      arktype: string;
      reason: string;
    }
  | {
      kind: "addField";
      schema: string;
      field: string;
      arktype: string;
      reason: string;
    }
  | {
      kind: "removeField";
      schema: string;
      field: string;
      reason: string;
    }
  | {
      kind: "renameSchema";
      from: string;
      to: string;
      reason: string;
    }
  | {
      kind: "resolveAnon";
      canonicalKey: string;
      name: string;
      reason: string;
    }
  | {
      kind: "discriminantHint";
      schema: string;
      on: "type" | "subtype";
      values: string[];
      reason: string;
    };

export interface PatchFile {
  version: string;
  patches: Patch[];
}

export function definePatches(p: PatchFile): PatchFile {
  return p;
}
