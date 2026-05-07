// Token usage helpers. The SDK's "total tokens" is
//   input + cache_creation + cache_read + output
// — i.e. context-window load, not lifetime tokens (cache_read dominates
// once a session has any history). UIs that show "ctx %" want this sum.

export type UsageLike = {
  input_tokens?: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
  output_tokens?: number;
};

export function sumContextTokens(u: UsageLike | null | undefined): number | null {
  if (!u) return null;
  const total =
    (u.input_tokens ?? 0)
    + (u.cache_creation_input_tokens ?? 0)
    + (u.cache_read_input_tokens ?? 0)
    + (u.output_tokens ?? 0);
  return Number.isFinite(total) ? total : null;
}

// Pull the most-relevant `usage` block from a frame regardless of which
// canonical shape it took (`assistant`/`stream_event`-derived have it on
// `message.usage`; `result` puts it at the top level).
export function getFrameUsage(frame: unknown): UsageLike | null {
  if (!frame || typeof frame !== "object") return null;
  const f = frame as { usage?: UsageLike; message?: { usage?: UsageLike } };
  return f.usage ?? f.message?.usage ?? null;
}
