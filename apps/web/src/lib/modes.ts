// UI-only colour + glyph map for permission modes. Mirrors common TUI
// conventions: » as the "act on it" cue (auto / acceptEdits / bypass)
// and ⏸ for plan to reinforce its no-tool-execution semantics.

import type { PermissionMode } from "@cc-ws/svelte";

type ModeMeta = { color: string; glyph: string; short: string };

const MODE_META: Record<PermissionMode, ModeMeta> = {
  default:           { color: "var(--fg-1)",     glyph: "◎", short: "default" },
  acceptEdits:       { color: "var(--thinking)", glyph: "»", short: "accept-edits" },
  plan:              { color: "var(--teal)",     glyph: "⏸", short: "plan" },
  bypassPermissions: { color: "var(--error)",    glyph: "»", short: "bypass" },
  auto:              { color: "var(--warn)",     glyph: "»", short: "auto" },
  dontAsk:           { color: "var(--fg-2)",     glyph: "◌", short: "don't-ask" },
};

const FALLBACK: ModeMeta = { color: "var(--fg-1)", glyph: "◎", short: "" };

function meta(m: PermissionMode | string): ModeMeta {
  return MODE_META[m as PermissionMode] ?? { ...FALLBACK, short: m };
}

export function modeColor(m: PermissionMode | string): string {
  return meta(m).color;
}

export function modeGlyph(m: PermissionMode | string): string {
  return meta(m).glyph;
}

export function modeShort(m: PermissionMode | string): string {
  return meta(m).short;
}
