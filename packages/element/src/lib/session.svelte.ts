// Per-instance session bootstrap. Returns a CcSession constructed against
// the caller's wiring (ws-url, persistence backend, keybinds opt-out).
// Each call gets its own session — no module-level singleton, so two
// <cc-ws-chat> elements on a page are independent.
//
// Persistence resolution (in priority order):
//   1. `customStorage` adapter — full host control via property
//   2. `persist: "local" | "session"` + `storageKey` — built-in browser storage
//   3. `initialState` and/or `onSnapshot` — host-driven via in-memory shim
//   4. nothing — session runs without persistence
//
// In all modes, `onSnapshot` (when wired) fires after each persistence
// write so the host can mirror state to its own backend. `initialState`
// is consulted on construction; later calls have no effect (the session
// hydrates atom state once, before connecting).

import { createCcSession, type CcSession, type StorageLike } from "@somewhatintelligent/cc-ws-svelte";

export type PersistMode = "local" | "session" | "none";

export type CcSessionConfig = {
  wsUrl?: string;
  persist?: PersistMode;
  storageKey?: string;
  customStorage?: StorageLike;
  initialState?: string;
  onSnapshot?: (snapshot: string) => void;
};

const DEV_WS_URL = "ws://localhost:3000/ws";
// In-memory shim uses this internal key; the StorageLike adapter ignores
// any other key the writer might (theoretically) try to use.
const MEM_KEY = "__cc_ws_state__";

function resolveWsUrl(explicit?: string): string {
  if (explicit) return explicit;
  if (typeof location !== "undefined" && location.protocol === "https:") {
    return `wss://${location.host}/ws`;
  }
  return DEV_WS_URL;
}

type ResolvedStorage = { storage: StorageLike; key: string } | null;

function browserStorage(kind: "local" | "session"): Storage | null {
  try {
    const g = globalThis as { localStorage?: Storage; sessionStorage?: Storage };
    return (kind === "local" ? g.localStorage : g.sessionStorage) ?? null;
  } catch {
    // Safari blocks access in some 3rd-party contexts; treat as missing.
    return null;
  }
}

function resolveStorage(cfg: CcSessionConfig): ResolvedStorage {
  // Explicit adapter wins — host wants full control of the bytes.
  if (cfg.customStorage) {
    return { storage: cfg.customStorage, key: cfg.storageKey ?? "cc-ws-session" };
  }

  if (cfg.persist === "local" || cfg.persist === "session") {
    if (!cfg.storageKey) {
      console.warn(
        `[cc-ws-chat] persist="${cfg.persist}" requires a storage-key attribute; ` +
        `falling back to no persistence to avoid cross-instance collisions.`,
      );
      // Fall through to memory shim below if the host wired snapshot/initial
    } else {
      const backend = browserStorage(cfg.persist);
      if (backend) return { storage: backend, key: cfg.storageKey };
    }
  }

  // Memory shim — covers two cases:
  //   - host-driven persistence (onSnapshot + optional initialState)
  //   - persist=none with snapshot listeners but no built-in storage
  if (cfg.initialState !== undefined || cfg.onSnapshot) {
    let value: string | null = cfg.initialState ?? null;
    const storage: StorageLike = {
      getItem: (k) => (k === MEM_KEY ? value : null),
      setItem: (k, v) => {
        if (k !== MEM_KEY) return;
        value = v;
        cfg.onSnapshot?.(v);
      },
      removeItem: (k) => {
        if (k !== MEM_KEY) return;
        value = null;
        cfg.onSnapshot?.("");
      },
    };
    return { storage, key: MEM_KEY };
  }

  return null;
}

export type SessionBootstrap = {
  session: CcSession;
  storage: StorageLike | null;
  storageKey: string | null;
};

export function createSession(config: CcSessionConfig = {}): SessionBootstrap {
  const resolved = resolveStorage(config);
  const session = createCcSession({
    url: resolveWsUrl(config.wsUrl),
    args: {
      includePartialMessages: true,
      includeHookEvents: true,
    },
    persistence: resolved
      ? { enabled: true, storage: resolved.storage, key: resolved.key }
      : false,
  });
  session.connect();
  return {
    session,
    storage: resolved?.storage ?? null,
    storageKey: resolved?.key ?? null,
  };
}
