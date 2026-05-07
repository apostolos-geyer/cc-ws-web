// Single source of truth for permission modes / models / efforts. Mirrors the
// canonical order found in the Claude Code v2.1.132 binary (see
// apps/slopbox/.spec/artifacts/extracted/canonical.json — PermissionMode +
// EffortLevel enums; getNextPermissionMode for cycle order).

export const PERMISSION_MODE_DEFS = [
  { value: "default",           label: "Default (ask)",                 inCycle: true  },
  { value: "acceptEdits",       label: "Auto-accept edits",             inCycle: true  },
  { value: "plan",              label: "Plan mode (no tool execution)", inCycle: true  },
  { value: "bypassPermissions", label: "Bypass all (dangerous)",        inCycle: true  },
  { value: "auto",              label: "Auto (classifier)",             inCycle: true  },
  { value: "dontAsk",           label: "Don't ask",                     inCycle: false },
] as const;

export type PermissionMode = (typeof PERMISSION_MODE_DEFS)[number]["value"];

export const PERMISSION_MODE_OPTIONS: { value: PermissionMode; label: string }[] =
  PERMISSION_MODE_DEFS.map((m) => ({ value: m.value, label: m.label }));

export const KNOWN_PERMISSION_MODES: readonly PermissionMode[] =
  PERMISSION_MODE_DEFS.map((m) => m.value);

export const CYCLE_ORDER: readonly PermissionMode[] = PERMISSION_MODE_DEFS
  .filter((m) => m.inCycle)
  .map((m) => m.value);

export function nextCycleMode(current: PermissionMode): PermissionMode {
  const idx = CYCLE_ORDER.indexOf(current);
  if (idx === -1) return "default";
  return CYCLE_ORDER[(idx + 1) % CYCLE_ORDER.length]!;
}

// Models the binary advertises. set_model takes the value verbatim; the
// binary resolves aliases. Display order = array order.
export const MODEL_DEFS = [
  { value: "claude-opus-4-7",       label: "Opus 4.7" },
  { value: "claude-opus-4-7[1m]",   label: "Opus 4.7 (1M)" },
  { value: "claude-opus-4-6",       label: "Opus 4.6" },
  { value: "claude-opus-4-6[1m]",   label: "Opus 4.6 (1M)" },
  { value: "claude-sonnet-4-6",     label: "Sonnet 4.6" },
  { value: "claude-sonnet-4-5",     label: "Sonnet 4.5" },
  { value: "claude-sonnet-4-5[1m]", label: "Sonnet 4.5 (1M)" },
  { value: "claude-haiku-4-5",      label: "Haiku 4.5" },
] as const;

export type Model = (typeof MODEL_DEFS)[number]["value"];

export const MODEL_OPTIONS: { value: Model; label: string }[] =
  MODEL_DEFS.map((m) => ({ value: m.value, label: m.label }));

export const KNOWN_MODELS: readonly Model[] = MODEL_DEFS.map((m) => m.value);

// Effort levels accepted by --effort. No set_effort control_request exists,
// so changing effort mid-session triggers a respawn.
export const EFFORT_DEFS = [
  { value: "low",    label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high",   label: "High" },
  { value: "xhigh",  label: "xHigh" },
  { value: "max",    label: "Max" },
] as const;

export type Effort = (typeof EFFORT_DEFS)[number]["value"];

export const EFFORT_OPTIONS: { value: Effort; label: string }[] =
  EFFORT_DEFS.map((e) => ({ value: e.value, label: e.label }));

export const KNOWN_EFFORTS: readonly Effort[] = EFFORT_DEFS.map((e) => e.value);
