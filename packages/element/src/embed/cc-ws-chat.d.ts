// Type declarations for the <cc-ws-chat> custom element.
//
// Drop next to cc-ws-chat.js when distributing. Reference from a host
// project via:
//   /// <reference path="./cc-ws-chat.d.ts" />
// or include the file in the project's tsconfig.json `include`.

export {};

/**
 * Snapshot payload emitted by `cc-ws-state-change` and accepted as the
 * `initial-state` attribute. Strings only — `JSON.parse(detail)` to
 * inspect, `JSON.stringify(snapshot)` to feed back in.
 */
export type CcWsSnapshot = {
  sessionId: string | null;
  messages?: unknown[];
  permissionMode?: string;
  model?: string;
  effort?: string;
};

/**
 * Drop-in chat widget connected to a cc-ws bridge over WebSocket.
 *
 * Sizing: the element is `display: block` and fills its host container.
 * Set width/height on the element from the host page (e.g.
 * `cc-ws-chat { display: block; height: 600px; }`).
 *
 * Theming: the element exposes its design tokens as CSS custom
 * properties on its host. Override any from the host page:
 *   cc-ws-chat { --accent: #6ba6e0; --bg: #0a0a0a; }
 * Tokens: --bg, --bg-1, --bg-2, --bg-3, --fg, --fg-1, --fg-2, --fg-3,
 * --border, --border-1, --accent, --accent-soft, --accent-line,
 * --warn, --error, --ok, --info, --thinking, --teal, --font-mono,
 * --font-size, --line-height.
 *
 * Persistence: opt-in. Choose one of:
 *
 *   1. Built-in browser storage:
 *        <cc-ws-chat persist="local"   storage-key="my-chat">
 *        <cc-ws-chat persist="session" storage-key="my-chat">
 *      `storage-key` is required and namespaces the saved state — give
 *      every instance a unique key so multi-instance pages don't collide.
 *
 *   2. Host-driven (any backend, framework-agnostic):
 *        // 1. seed from your store
 *        <cc-ws-chat initial-state={JSON.stringify(snapshot)}>
 *        // 2. mirror future writes
 *        el.addEventListener("cc-ws-state-change", e => save(e.detail));
 *      Compatible with React, Vue, Solid, Svelte, vanilla — only
 *      attributes and events cross the framework boundary.
 *
 *   3. No persistence (default): omit all of the above. Every page load
 *      starts a fresh session.
 */
export interface CcWsChatElement extends HTMLElement {
  /** WebSocket URL of the cc-ws bridge (e.g. `wss://bridge.example.com/ws`). */
  wsUrl?: string;
  /**
   * Persistence backend. `"local"` and `"session"` use the matching
   * Web Storage API and require `storageKey`. `"none"` (default) disables
   * built-in persistence; pair with `initialState` + `cc-ws-state-change`
   * for host-driven persistence.
   */
  persist?: "local" | "session" | "none";
  /** Namespacing key for built-in storage; required if `persist` is set. */
  storageKey?: string;
  /** JSON-encoded snapshot to seed atom state before connecting. */
  initialState?: string;
  /**
   * If true, install document-level keyboard shortcuts (Cmd+K to focus,
   * Cmd+I to interrupt, Cmd+T/P/H/, // to toggle panels, Shift+Tab to
   * cycle permission mode, Esc to close). Default false — the embed
   * shouldn't hijack the host page's shortcuts unless asked.
   */
  keybinds?: boolean;
}

/**
 * Fired whenever the session's persisted state changes (debounced 250ms
 * by the underlying writer). `detail` is the JSON-encoded snapshot —
 * mirror it to your own backend and feed back into `initial-state` on
 * the next mount to restore.
 */
export interface CcWsStateChangeEvent extends CustomEvent<string> {
  type: "cc-ws-state-change";
}

declare global {
  interface HTMLElementTagNameMap {
    "cc-ws-chat": CcWsChatElement;
  }
  interface HTMLElementEventMap {
    "cc-ws-state-change": CcWsStateChangeEvent;
  }
}
