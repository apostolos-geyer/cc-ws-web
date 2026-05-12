/**
 * Validation tiers for `ClaudeProcess`.
 *
 * `off`            — no per-frame work; pure passthrough.
 * `discriminator`  — read `type` (and `subtype` if present), confirm the
 *                    literal exists in the dispatch map; no field-level
 *                    `.allows()` call. O(1).
 * `strict`         — full `.allows()` against the dispatch-mapped schema.
 *
 * Stream-event frames bypass field-level validation regardless of mode
 * unless `validateStreamEvents: true` is passed to the constructor — the
 * envelope `{ type: "stream_event", event: { type: "..." } }` is the
 * highest-rate frame type and full validation per frame is wasted work.
 */

import {
  inboundBySubtype,
  inboundByType,
} from "../../generated/2.1.139/dispatch";

export type ValidationMode = "off" | "discriminator" | "strict";

export interface ValidationResult {
  ok: boolean;
  reason?: string;
  /** Microseconds spent inside the validator (for metrics). */
  micros: number;
}

export interface ValidatorOpts {
  mode: ValidationMode;
  validateStreamEvents: boolean;
}

const NOW = () => {
  // performance.now() is universal (web, Bun, Node). Fall back if missing.
  const p = (globalThis as { performance?: { now: () => number } }).performance;
  return p && typeof p.now === "function" ? p.now() : Date.now();
};

/**
 * Inspect a frame in light of the configured validation tier.
 * Returns `{ ok }` without throwing — caller decides whether to drop or
 * surface to handlers.
 */
export function validateFrame(
  frame: unknown,
  opts: ValidatorOpts,
): ValidationResult {
  if (opts.mode === "off") return { ok: true, micros: 0 };
  const t0 = NOW();
  if (!frame || typeof frame !== "object") {
    return { ok: false, reason: "non-object frame", micros: (NOW() - t0) * 1000 };
  }
  const f = frame as { type?: unknown; subtype?: unknown; event?: unknown };
  const ty = typeof f.type === "string" ? f.type : null;
  const sub = typeof f.subtype === "string" ? f.subtype : null;

  // Stream-event hot-path bypass — envelope check only.
  if (ty === "stream_event" && !opts.validateStreamEvents) {
    const ev = (f as { event?: unknown }).event;
    if (ev && typeof ev === "object") {
      return { ok: true, micros: (NOW() - t0) * 1000 };
    }
    return {
      ok: false,
      reason: "stream_event missing event object",
      micros: (NOW() - t0) * 1000,
    };
  }

  // Pick a schema. Prefer subtype (more specific) when both are present.
  const schema = (sub && inboundBySubtype[sub]) || (ty && inboundByType[ty]) || null;

  if (!schema) {
    // Not a discriminator we know about. In `discriminator` mode this is a
    // rejection signal — the binary emitted a literal we haven't typed.
    // In `strict` mode this is also a rejection.
    return {
      ok: false,
      reason: `no schema for type=${ty ?? "<none>"} subtype=${sub ?? "<none>"}`,
      micros: (NOW() - t0) * 1000,
    };
  }

  if (opts.mode === "discriminator") {
    // Discriminator-matched, no field-level check.
    return { ok: true, micros: (NOW() - t0) * 1000 };
  }

  // strict
  const allows = schema.allows(frame);
  return {
    ok: allows,
    reason: allows ? undefined : "schema.allows() rejected frame",
    micros: (NOW() - t0) * 1000,
  };
}

/**
 * Force arktype's lazy compilation on every dispatched schema by calling
 * `.allows({})` once. Idempotent — call from `ClaudeProcess.start()` to
 * move cold-start cost out of the hot path.
 */
export function warmupValidators(): void {
  for (const k of Object.keys(inboundBySubtype)) {
    try {
      inboundBySubtype[k].allows({});
    } catch {
      // ignore — warmup is best-effort
    }
  }
  for (const k of Object.keys(inboundByType)) {
    try {
      inboundByType[k].allows({});
    } catch {
      // ignore
    }
  }
}
