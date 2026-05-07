// Session bootstrap. Constructed once at app startup and injected into
// Svelte context by App.svelte. Persistence is on by default — refresh
// brings the user back to the last thread (handled inside the lib).
//
// In dev, `bun dev` runs the bridge on :3000 separately from vite (:5173),
// so we hardcode ws://localhost:3000/ws here. For prod the env var wins.

import { createCcSession, type CcSession } from "@somewhatintelligent/cc-ws-svelte";

const DEV_WS_URL = "ws://localhost:3000/ws";
const ENV_WS_URL = (import.meta.env.VITE_WS_URL as string | undefined) ?? null;

const url = ENV_WS_URL ?? (location.protocol === "https:"
  ? `wss://${location.host}/ws`
  : DEV_WS_URL);

export const session: CcSession = createCcSession({
  url,
  args: {
    includePartialMessages: true,
    includeHookEvents: true,
  },
  persistence: { enabled: true, key: "@somewhatintelligent/cc-ws-web/session" },
});

session.connect();
