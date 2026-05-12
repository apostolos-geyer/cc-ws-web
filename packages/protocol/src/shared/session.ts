/**
 * `SessionMode` — data-type description of how `ClaudeClient`'s caller
 * intends to start (or resume) a session.
 *
 * This file intentionally exports *only* the data type, not a
 * `buildSpawnArgs(mode)` helper. The mapping from `SessionMode` to
 * `--continue` / `--resume <id>` CLI args lives in
 * `@somewhatintelligent/cc-ws-server` alongside `spawnTransport`, because
 * the args are a runtime concern — `@cc-protocol` must stay universal.
 */

export type SessionMode =
  | { kind: "new" }
  | { kind: "continue" }
  | { kind: "resume"; sessionId: string };
