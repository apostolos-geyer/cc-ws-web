// The dev demo now exercises the actual <cc-ws-chat> custom element so
// local testing matches what consumers ship. Importing the embed entry
// side-effect-registers the tag on customElements; we just forward the
// VITE_WS_URL env (if set) onto the host element as the ws-url attribute.

import "../../../packages/element/src/embed/cc-ws-chat.svelte";

const wsUrl = import.meta.env.VITE_WS_URL as string | undefined;
if (wsUrl) {
  document.querySelector("cc-ws-chat")?.setAttribute("ws-url", wsUrl);
}
