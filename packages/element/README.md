# @somewhatintelligent/cc-ws-element

Drop-in `<cc-ws-chat>` Custom Element. Embeds the cc-ws Claude Code chat UI as a single self-registering web component with shadow-DOM-isolated styles. Works in any framework or plain HTML.

## Install

```sh
bun add @somewhatintelligent/cc-ws-element
```

## Use — vanilla HTML

```html
<script type="module" src="https://unpkg.com/@somewhatintelligent/cc-ws-element"></script>
<cc-ws-chat ws-url="ws://localhost:9999/ws" style="height: 600px;"></cc-ws-chat>
```

## Use — bundled (Vite, etc.)

```ts
import "@somewhatintelligent/cc-ws-element";
```

```html
<cc-ws-chat ws-url="ws://localhost:9999/ws"></cc-ws-chat>
```

## Use — React / TanStack Start / etc.

```tsx
import "@somewhatintelligent/cc-ws-element";

export function Chat() {
  return <cc-ws-chat ws-url="ws://localhost:9999/ws" style={{ height: "100%" }} />;
}
```

The package's `.d.ts` augments JSX so React typechecks the `ws-url` / `storage-key` / `keybinds` attributes.

## Attributes

| Attribute     | Type    | Notes                                                                              |
| ------------- | ------- | ---------------------------------------------------------------------------------- |
| `ws-url`      | string  | WebSocket URL of the cc-ws bridge (e.g. `wss://bridge.example.com/ws`).            |
| `storage-key` | string  | localStorage key used to persist active session id + transcript across reloads.    |
| `keybinds`    | boolean | If present, install document-level shortcuts (⌘K focus, ⌘I interrupt, ⌘T/P/H/,/`/`, Shift+Tab cycle, Esc close). Default off. |

## Sizing & theming

The element is `display: block` and fills its host container — set width/height from outside.

CSS custom properties cross the shadow boundary, so theme from the host page:

```css
cc-ws-chat {
  --accent: #6ba6e0;
  --bg: #0a0a0a;
  --font-mono: "Iosevka", monospace;
}
```

Tokens: `--bg`, `--bg-1..3`, `--fg`, `--fg-1..3`, `--border`, `--border-1`, `--accent`, `--accent-soft`, `--accent-line`, `--warn`, `--error`, `--ok`, `--info`, `--thinking`, `--teal`, `--font-mono`, `--font-size`, `--line-height`.

## Bridge

You need a cc-ws bridge running somewhere reachable from the browser — see [`@somewhatintelligent/cc-ws-server`](https://www.npmjs.com/package/@somewhatintelligent/cc-ws-server) (`bun add -g @somewhatintelligent/cc-ws-server && cc-ws-server`).
