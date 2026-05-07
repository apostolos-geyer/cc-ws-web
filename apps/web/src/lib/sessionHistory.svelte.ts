// Tracks every session ID we've ever seen in this browser. The lib's
// own persistence holds the LATEST session (so refresh resumes it), but
// it doesn't keep a roster — the binary's --resume needs a specific id,
// and we have no way to recall earlier threads otherwise.
//
// Wiring: subscribe to init.sessionId; on change, prepend to the list
// (dedupe, cap, persist). Surface as a $state object so any consumer
// (header dropdown, settings panel) is reactive.

import type { CcSession } from "@cc-ws/svelte";

const KEY = "@cc-ws/web/session-history";
const CAP = 25;

export type SessionRecord = {
  id: string;
  firstSeen: number;
  lastSeen: number;
};

function load(): SessionRecord[] {
  try {
    const raw = localStorage.getItem(KEY);
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

function save(records: SessionRecord[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(records));
  } catch {}
}

export const sessionHistory = $state<{ records: SessionRecord[] }>({
  records: load(),
});

function touch(id: string) {
  const now = Date.now();
  const existing = sessionHistory.records.find((r) => r.id === id);
  if (existing) {
    existing.lastSeen = now;
    sessionHistory.records.sort((a, b) => b.lastSeen - a.lastSeen);
  } else {
    sessionHistory.records = [
      { id, firstSeen: now, lastSeen: now },
      ...sessionHistory.records,
    ].slice(0, CAP);
  }
  save([...sessionHistory.records]);
}

export function forget(id: string) {
  sessionHistory.records = sessionHistory.records.filter((r) => r.id !== id);
  save([...sessionHistory.records]);
}

export function installSessionTracker(session: CcSession) {
  return session.atoms.init.subscribe((init) => {
    if (init.sessionId) touch(init.sessionId);
  });
}
