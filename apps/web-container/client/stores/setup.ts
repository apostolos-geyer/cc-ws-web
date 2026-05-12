// Browser-only credential store. Mirrors slopbox's invariant: the operator's
// Claude credential + optional GitHub PAT live in localStorage at rest, are
// posted to the worker on session init, and are then forgotten server-side
// (see src/setup-flow.ts).

import { atom } from "nanostores";
import type { Setup } from "../../src/setup-flow";

const STORAGE_KEY = "cc-ws-container.setup";

export const setupStore = atom<Setup | null>(readSetup());

function readSetup(): Setup | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Setup;
    if (!parsed.claude || (parsed.claude.kind !== "oauth" && parsed.claude.kind !== "api-key")) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function saveSetup(setup: Setup): void {
  setupStore.set(setup);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(setup));
}

export function clearSetup(): void {
  setupStore.set(null);
  localStorage.removeItem(STORAGE_KEY);
}
