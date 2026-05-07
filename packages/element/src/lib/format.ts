// Small formatting helpers shared across components.

// Total tokens is `input + cache_creation + cache_read + output` per the
// SDK helper — for fresh agents this is 100k+ from cache_read alone, so
// we treat it as "context window load" not "tokens spent". 1.4k → 1.4k.
export function formatCtx(n: number | undefined | null): string {
  if (n == null || !Number.isFinite(n)) return "—";
  if (n < 1_000) return String(n);
  if (n < 10_000) return `${(n / 1_000).toFixed(1)}k`;
  if (n < 1_000_000) return `${Math.round(n / 1_000)}k`;
  return `${(n / 1_000_000).toFixed(1)}m`;
}

// "precise" — sub-second resolution for usage/timing readouts.
// "wall" — coarse age display ("just now / Nm / Nh / Nd") for "last seen"-type fields.
export function formatDuration(
  ms: number | undefined | null,
  mode: "precise" | "wall" = "precise",
): string {
  if (ms == null || !Number.isFinite(ms)) return "—";
  if (mode === "wall") {
    if (ms < 60_000) return "just now";
    if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m`;
    if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h`;
    return `${Math.floor(ms / 86_400_000)}d`;
  }
  if (ms < 1_000) return `${Math.round(ms)}ms`;
  if (ms < 60_000) return `${(ms / 1_000).toFixed(1)}s`;
  const m = Math.floor(ms / 60_000);
  const s = Math.round((ms % 60_000) / 1_000);
  return `${m}m${s}s`;
}

// Truncate a string with an ellipsis when it exceeds `n` chars.
export function ellipsis(s: string, n: number): string {
  if (s.length <= n) return s;
  return s.slice(0, n - 1) + "…";
}

// CWD formatter — replace HOME with ~ when possible. Best-effort: we don't
// know the user's home dir here, so we just pass through.
export function shortenPath(p: string | null | undefined): string {
  if (!p) return "—";
  return p;
}

// Single-line preview for the most useful field on a tool input. Used
// wherever we need to show "what is this tool about to do" without
// rendering the full JSON — composer, ToolUseCard, PermissionsPanel.
// Order is deliberate: command (Bash) first, file_path/path next
// (Read/Write/Edit), then pattern/query/url for search-style inputs.
const PREVIEW_FIELDS = ["command", "file_path", "path", "pattern", "query", "url"] as const;

export function previewToolInput(input: unknown, max = 160): string {
  if (input == null || typeof input !== "object") return String(input ?? "");
  const r = input as Record<string, unknown>;
  for (const k of PREVIEW_FIELDS) {
    if (typeof r[k] === "string") return ellipsis(r[k] as string, max);
  }
  return ellipsis(JSON.stringify(input), max);
}
