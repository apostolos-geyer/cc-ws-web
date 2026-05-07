// Per-instance session bootstrap. Returns a CcSession constructed against
// the caller's wiring (ws-url, persistence key, keybinds opt-out). The
// SPA calls this from main.ts; the custom-element build calls it from
// cc-ws-chat.svelte. Each call gets its own session — no module-level
// singleton, so two <cc-ws-chat> elements on a page are independent.

import { createCcSession, type CcSession } from "@somewhatintelligent/cc-ws-svelte";

export type CcSessionConfig = {
  wsUrl?: string;
  storageKey?: string;
};

const DEV_WS_URL = "ws://localhost:3000/ws";

function resolveWsUrl(explicit?: string): string {
  if (explicit) return explicit;
  if (typeof location !== "undefined" && location.protocol === "https:") {
    return `wss://${location.host}/ws`;
  }
  return DEV_WS_URL;
}

export function createSession(config: CcSessionConfig = {}): CcSession {
  const session = createCcSession({
    url: resolveWsUrl(config.wsUrl),
    args: {
      includePartialMessages: true,
      includeHookEvents: true,
    },
    persistence: {
      enabled: true,
      key: config.storageKey ?? "@somewhatintelligent/cc-ws-web/session",
    },
  });
  session.connect();
  return session;
}
