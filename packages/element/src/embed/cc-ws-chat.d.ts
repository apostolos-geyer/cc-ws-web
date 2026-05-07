// Type declarations for the <cc-ws-chat> custom element.
//
// Drop next to cc-ws-chat.js when distributing. Reference from a host
// project via:
//   /// <reference path="./cc-ws-chat.d.ts" />
// or include the file in the project's tsconfig.json `include`.

export {};

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
 */
export interface CcWsChatElement extends HTMLElement {
  /** WebSocket URL of the cc-ws bridge (e.g. `wss://bridge.example.com/ws`). */
  wsUrl?: string;
  /** localStorage key used for persisting the active session id + transcript. */
  storageKey?: string;
  /**
   * If true, install document-level keyboard shortcuts (Cmd+K to focus,
   * Cmd+I to interrupt, Cmd+T/P/H/, // to toggle panels, Shift+Tab to
   * cycle permission mode, Esc to close). Default false — the embed
   * shouldn't hijack the host page's shortcuts unless asked.
   */
  keybinds?: boolean;
}

declare global {
  interface HTMLElementTagNameMap {
    "cc-ws-chat": CcWsChatElement;
  }
}
