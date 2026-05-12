/**
 * Hook-event aggregator. Tracks `system/hook_*` frames into a ring buffer.
 *
 * The binary chatty-mode (hooks enabled) emits thousands of events over a
 * session; the buffer caps to keep memory bounded.
 */
import { isSystemFrame, type InboundFrame, type SystemHook } from "./frames";

export type HookSubtype = "hook_started" | "hook_progress" | "hook_response";

export type HookEntry = {
  id: string;
  ts: number;
  subtype: HookSubtype;
  hookName?: string;
  raw: SystemHook;
};

const DEFAULT_HOOK_EVENTS_CAP = 200;

function capRingFifo<T>(arr: T[], cap: number): T[] {
  return arr.length > cap ? arr.slice(arr.length - cap) : arr;
}

export interface HooksSnapshot {
  hookEvents: HookEntry[];
}

export interface HooksAggregator {
  getSnapshot(): HooksSnapshot;
  ingest(frame: InboundFrame): boolean;
  reset(): void;
}

export interface HooksAggregatorOptions {
  onChange?: (snap: HooksSnapshot) => void;
  /** Test seam. */
  now?: () => number;
  newId?: () => string;
  cap?: number;
}

export function createHooksAggregator(opts: HooksAggregatorOptions = {}): HooksAggregator {
  const onChange = opts.onChange ?? (() => {});
  const now = opts.now ?? (() => Date.now());
  const newId = opts.newId ?? (() => crypto.randomUUID());
  const cap = opts.cap ?? DEFAULT_HOOK_EVENTS_CAP;

  let hookEvents: HookEntry[] = [];

  function emit() {
    onChange({ hookEvents });
  }

  function ingest(frame: InboundFrame): boolean {
    if (!isSystemFrame(frame)) return false;
    if (
      frame.subtype !== "hook_started" &&
      frame.subtype !== "hook_progress" &&
      frame.subtype !== "hook_response"
    ) {
      return false;
    }
    const hookFrame = frame as SystemHook;
    const entry: HookEntry = {
      id: newId(),
      ts: now(),
      subtype: hookFrame.subtype,
      hookName: hookFrame.hook_event_name ?? hookFrame.hookEventName,
      raw: hookFrame,
    };
    hookEvents = capRingFifo([...hookEvents, entry], cap);
    emit();
    return true;
  }

  function reset() {
    hookEvents = [];
    emit();
  }

  return {
    getSnapshot: () => ({ hookEvents }),
    ingest,
    reset,
  };
}
