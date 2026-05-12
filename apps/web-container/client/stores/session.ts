// Session lifecycle: sessionId (stable per browser, persisted) and the
// async init status against the worker's /init/:id endpoint.
//
// The sessionId is generated ONCE per browser and persisted forever. There
// is no "reset" path on purpose — generating a fresh id orphans the
// existing sandbox container (the worker has no destroy endpoint, by
// design). /init is idempotent; re-running it on the same sessionId
// reattaches to the existing container and restarts the bridge in place.

import { atom } from "nanostores";
import type { Setup, InitResult } from "../../src/setup-flow";

const ID_KEY = "cc-ws-container.sessionId";

export const sessionId = atom<string>(readOrCreateId());

export type InitStatus =
  | { tag: "idle" }
  | { tag: "running" }
  | { tag: "ready"; result: Extract<InitResult, { ok: true }> }
  | { tag: "failed"; reason: string; detail?: string };

export const initStatus = atom<InitStatus>({ tag: "idle" });

function readOrCreateId(): string {
  const existing = localStorage.getItem(ID_KEY);
  if (existing) return existing;
  const fresh = crypto.randomUUID();
  localStorage.setItem(ID_KEY, fresh);
  return fresh;
}

export async function runInit(setup: Setup): Promise<void> {
  initStatus.set({ tag: "running" });
  let res: Response;
  try {
    res = await fetch(`/init/${encodeURIComponent(sessionId.get())}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(setup),
    });
  } catch (err) {
    initStatus.set({
      tag: "failed",
      reason: "network-error",
      detail: err instanceof Error ? err.message : String(err),
    });
    return;
  }
  let body: InitResult;
  try {
    body = (await res.json()) as InitResult;
  } catch {
    initStatus.set({ tag: "failed", reason: "bad-response" });
    return;
  }
  if (body.ok) {
    initStatus.set({ tag: "ready", result: body });
  } else {
    initStatus.set({ tag: "failed", reason: body.reason, detail: body.detail });
  }
}
