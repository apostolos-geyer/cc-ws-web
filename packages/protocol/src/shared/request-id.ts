/**
 * `makeRequestId()` — generate a fresh `request_id` for a control_request.
 *
 * Uses `crypto.randomUUID()` — universally available in browser, Bun,
 * Deno, recent Node (v19+). If the runtime lacks `crypto.randomUUID`, we
 * fall back to a millisecond + Math.random() concatenation which is
 * "unique enough" for an in-flight correlator that holds 10s of pending
 * requests at most.
 */
export function makeRequestId(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c && typeof c.randomUUID === "function") {
    return c.randomUUID();
  }
  // Fallback — sufficient for in-flight correlation. Not security-grade.
  return `req-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
