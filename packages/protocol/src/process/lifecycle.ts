/**
 * `ClaudeProcess` state machine — pure protocol-level lifecycle.
 *
 *   idle      → after construction, before `start()` resolves
 *   ready     → after `system/init` arrives in response to `initialize`
 *   ending    → after `end_session` is sent, before its ack lands
 *   ended     → after `end_session`'s ack lands, or after `close()`
 *
 * Transitions are linear; no back-edges. `ended` is terminal. The class
 * uses this holder to coordinate `start` / `end` waits and to emit
 * `onStateChange` to subscribers.
 */

export type ProcessState = "idle" | "ready" | "ending" | "ended";

export class LifecycleHolder {
  private _state: ProcessState = "idle";
  private subscribers = new Set<(state: ProcessState) => void>();

  get state(): ProcessState {
    return this._state;
  }

  set(state: ProcessState): void {
    if (state === this._state) return;
    if (!isValidTransition(this._state, state)) {
      throw new Error(
        `ClaudeProcess: illegal state transition ${this._state} → ${state}`,
      );
    }
    this._state = state;
    for (const s of [...this.subscribers]) s(state);
  }

  subscribe(cb: (state: ProcessState) => void): () => void {
    this.subscribers.add(cb);
    return () => this.subscribers.delete(cb);
  }
}

function isValidTransition(from: ProcessState, to: ProcessState): boolean {
  // We accept any forward move (idle→ready, idle→ended, ready→ending,
  // ready→ended, ending→ended) and reject backwards/duplicate. The lenient
  // "idle→ended" path supports a `close()`-before-`start()` teardown.
  if (from === "ended") return false;
  const order: ProcessState[] = ["idle", "ready", "ending", "ended"];
  return order.indexOf(to) > order.indexOf(from);
}
