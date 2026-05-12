<script lang="ts">
  import { sessionId } from "./stores/session";

  const id = sessionId;

  // Inline-style theme tokens. CSS custom properties pierce the shadow DOM
  // (see packages/element/src/embed/cc-ws-chat.svelte header comment), so
  // this is the host's only reliable knob for theming the element. Mirrors
  // slopbox's ELEMENT_TOKENS in
  //   Apostoli.ca/apps/slopbox/src/routes/_dashboard/admin/sessions/$sessionId/claude/web.tsx
  // Svelte scoped CSS targeting `cc-ws-chat` is NOT reliable: the compiler
  // adds a hash class that the externally-registered custom element won't
  // carry.
  const elementStyle = [
    "display: block",
    "height: 100%",
    "width: 100%",
    "flex: 1",
    "min-height: 0",
    '--font-mono: "Iosevka", monospace',
    "--bg: #0d0d0e",
    "--bg-1: #131316",
    "--bg-2: #1a1a1e",
    "--fg: #e6e6e6",
    "--accent: #d97757",
  ].join("; ");

  // Absolute ws:// or wss:// URL — matches slopbox's pattern. The element's
  // resolveWsUrl() trusts what we give it; relative paths technically work
  // in `new WebSocket()` but explicit is more robust across dev-proxy hops.
  let wsUrl = $derived.by(() => {
    if (typeof location === "undefined") return "";
    const proto = location.protocol === "https:" ? "wss:" : "ws:";
    return `${proto}//${location.host}/ws/${encodeURIComponent($id)}`;
  });
</script>

<cc-ws-chat
  ws-url={wsUrl}
  keybinds=""
  persist="local"
  storage-key={`cc-ws-container:${$id}`}
  style={elementStyle}
></cc-ws-chat>
