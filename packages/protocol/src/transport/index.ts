/**
 * Transport — the universal seam between `ClaudeClient` and `ClaudeProcess`.
 *
 * A transport is a bidirectional stream of stream-json frames. It does not
 * know what's on either side — could be a WebSocket, a child process's
 * stdio, an in-memory pair, a named pipe. The two principals
 * (`ClaudeClient` and `ClaudeProcess`) only see `send(frame)` /
 * `onFrame(cb)` / `close()`.
 *
 * `Frame` is typed as `unknown` here rather than the generated message
 * union because:
 *   1. The generated types are codegen-version-specific. Pinning the
 *      transport interface to a single version's union would couple the
 *      transport to that version.
 *   2. `ClaudeProcess` validates inbound frames against the active schema;
 *      `ClaudeClient` builds outbound frames from its typed intent methods.
 *      Neither needs the transport to be type-aware.
 *   3. Browser-safety: the transport is universal and cannot assume any
 *      runtime can `import type` from `../../generated/<ver>`.
 *
 * Consumers who want typed-frame access cast at the principal boundary.
 */
export type Frame = unknown;

export interface Transport {
  /** Send a frame. Resolves once the transport has accepted it. */
  send(frame: Frame): Promise<void>;
  /** Register a handler for inbound frames. Returns an unsubscribe fn. */
  onFrame(handler: (frame: Frame) => void): () => void;
  /** Close the transport. Idempotent. */
  close(): Promise<void>;
  /** Whether `close()` has been called or the underlying channel has died. */
  readonly closed: boolean;
}
