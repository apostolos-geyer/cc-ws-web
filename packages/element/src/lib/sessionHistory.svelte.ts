// Per-instance roster of session IDs we've seen. The lib's own
// persistence holds the LATEST session (so refresh resumes it), but
// it doesn't keep a roster — the binary's --resume needs a specific id,
// and we have no way to recall earlier threads otherwise.
//
// Storage: namespaced under `${storageKey}:history` in whatever backend
// the host element resolved (localStorage / sessionStorage / custom adapter
// / in-memory). Two <cc-ws-chat> elements with different storage-keys keep
// independent rosters. When no storage is wired, history lives in-memory
// for the lifetime of the page.

import type { CcSession, StorageLike } from "@somewhatintelligent/cc-ws-svelte";

const CAP = 25;

export type SessionRecord = {
  id: string;
  firstSeen: number;
  lastSeen: number;
};

export type SessionHistoryStore = {
  readonly records: SessionRecord[];
  forget: (id: string) => void;
  install: (session: CcSession) => () => void;
};

function loadFrom(storage: StorageLike | null, key: string | null): SessionRecord[] {
  if (!storage || !key) return [];
  try {
    const raw = storage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (r): r is SessionRecord =>
        r && typeof r.id === "string"
        && typeof r.firstSeen === "number"
        && typeof r.lastSeen === "number",
    );
  } catch {
    return [];
  }
}

function saveTo(storage: StorageLike | null, key: string | null, records: SessionRecord[]) {
  if (!storage || !key) return;
  try {
    storage.setItem(key, JSON.stringify(records));
  } catch {}
}

export function createSessionHistory(
  storage: StorageLike | null,
  storageKey: string | null,
): SessionHistoryStore {
  const histKey = storageKey ? `${storageKey}:history` : null;
  // The whole object is wrapped in $state — assigning to .records or
  // mutating the array both trigger reactivity.
  const state = $state<{ records: SessionRecord[] }>({
    records: loadFrom(storage, histKey),
  });

  function touch(id: string) {
    const now = Date.now();
    const existing = state.records.find((r) => r.id === id);
    if (existing) {
      existing.lastSeen = now;
      state.records.sort((a, b) => b.lastSeen - a.lastSeen);
    } else {
      state.records = [
        { id, firstSeen: now, lastSeen: now },
        ...state.records,
      ].slice(0, CAP);
    }
    saveTo(storage, histKey, state.records);
  }

  return {
    get records() {
      return state.records;
    },
    forget(id: string) {
      state.records = state.records.filter((r) => r.id !== id);
      saveTo(storage, histKey, state.records);
    },
    install(session: CcSession) {
      // Gate on the sessionId field changing rather than re-firing on every
      // init bump (init also carries cwd/agents/slashCommands/skills which
      // shift independently and would otherwise rewrite storage on every
      // rerender of those).
      let lastId: string | null = null;
      return session.atoms.init.subscribe((init) => {
        if (init.sessionId && init.sessionId !== lastId) {
          lastId = init.sessionId;
          touch(init.sessionId);
        }
      });
    },
  };
}

const HISTORY_CONTEXT_KEY = Symbol.for("@somewhatintelligent/cc-ws-web:session-history");

import { getContext, setContext } from "svelte";

export function setSessionHistory(store: SessionHistoryStore): void {
  setContext(HISTORY_CONTEXT_KEY, store);
}

export function getSessionHistory(): SessionHistoryStore {
  const s = getContext<SessionHistoryStore | undefined>(HISTORY_CONTEXT_KEY);
  if (!s) {
    throw new Error(
      "getSessionHistory() must run inside a component whose ancestor provided one via setSessionHistory().",
    );
  }
  return s;
}
