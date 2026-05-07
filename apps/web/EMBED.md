# `<cc-ws-chat>` — drop-in chat widget

A single-file custom element that renders the cc-ws chat UI on any web
page, regardless of host framework. One `<script>` tag, one HTML tag,
working chat connected to a [cc-ws bridge](../../packages/server).

## Quick start

```html
<!doctype html>
<html>
  <body style="margin:0; height:100vh">
    <cc-ws-chat
      ws-url="wss://your-bridge.example.com/ws"
      style="display:block; height:100%"
    ></cc-ws-chat>
    <script src="cc-ws-chat.js"></script>
  </body>
</html>
```

That's the whole integration. The element auto-registers on script load,
opens a WebSocket to the bridge, and renders the chat shell into its
shadow root. Multiple `<cc-ws-chat>` elements on the same page each get
their own bridge connection, persistence, and reactive atoms — they
don't share state.

## Build

```bash
cd apps/web
bun run build:embed
# → dist-embed/cc-ws-chat.js (131 KB / 42 KB gz)
# → dist-embed/cc-ws-chat.js.map
# → dist-embed/cc-ws-chat.d.ts
```

The bundle is one IIFE-format JS file — Svelte runtime, nanostores, the
lib, all UI components, all CSS. Sourcemap and TypeScript declarations
ship alongside.

## Attributes

| Attribute      | Type    | Default    | Purpose |
| -------------- | ------- | ---------- | ------- |
| `ws-url`       | string  | dev fallback `ws://localhost:3000/ws` (else same-origin `wss://<host>/ws` over HTTPS) | Bridge WebSocket URL. |
| `storage-key`  | string  | `@somewhatintelligent/cc-ws-web/session` | localStorage key for persisting the active session id, transcript, and selected mode/model/effort. Refresh resumes the same thread. |
| `keybinds`     | boolean | `false`    | Install document-level keyboard shortcuts (`⌘K` focus, `⌘I` interrupt, `⌘T/P/H/,/​/` panels, `⇧⇥` cycle mode, `Esc` close). Off by default so the embed doesn't fight the host page for keys. |

Set attributes either via HTML or via JS:

```js
const chat = document.querySelector("cc-ws-chat");
chat.wsUrl = "wss://staging.bridge.example.com/ws";
chat.keybinds = true;
```

## Sizing

The element is `display: block` and stretches to fill its parent. Drive
height from the host page:

```css
cc-ws-chat { display: block; height: 600px; }
/* or in a flex/grid host */
cc-ws-chat { display: block; min-height: 0; flex: 1; }
```

## Theming

CSS custom properties cross the shadow DOM boundary. Override any token
on the element from the host page:

```css
cc-ws-chat {
  --accent: #6ba6e0;        /* primary action color */
  --bg: #ffffff;            /* main background */
  --fg: #1a1a1a;            /* text */
  --font-mono: "JetBrains Mono", monospace;
}
```

Available tokens: `--bg`, `--bg-1`, `--bg-2`, `--bg-3`, `--fg`, `--fg-1`,
`--fg-2`, `--fg-3`, `--border`, `--border-1`, `--accent`, `--accent-soft`,
`--accent-line`, `--warn`, `--error`, `--ok`, `--info`, `--thinking`,
`--teal`, `--font-mono`, `--font-size`, `--line-height`.

## Isolation

`shadow: "open"` — host-page CSS can't reach inside, our scoped Svelte
component styles can't reach out. Open shadow root means devtools can
inspect; flip to `"closed"` in `cc-ws-chat.svelte`'s `<svelte:options>`
if you need stricter inspection isolation.

For full isolation (no shared globals, separate origin) wrap in an
iframe — the bundle is small enough that the iframe + bundle download
is still snappy.

## TypeScript

The declarations file `cc-ws-chat.d.ts` augments `HTMLElementTagNameMap`
and `JSX.IntrinsicElements`, so:

```ts
const chat = document.createElement("cc-ws-chat"); // typed
chat.wsUrl = "wss://...";                          // typed
```

```tsx
// React / JSX consumers
<cc-ws-chat ws-url="wss://..." keybinds /> // typed attributes
```

Reference the .d.ts from your host project's tsconfig `include` or via
`/// <reference />`.

## Lifecycle

The element calls `session.connect()` on `connectedCallback` (mount) and
`session.disconnect()` on `disconnectedCallback` (when removed from the
DOM or its parent is destroyed). Re-attaching the element creates a
fresh session — there's no auto-reconnect of the previous one.

## Dependencies

The host page must be able to reach the bridge over WebSocket. CORS
restrictions don't apply to WS, but the browser does refuse `ws://` from
an `https://` page — point at `wss://` in production.
