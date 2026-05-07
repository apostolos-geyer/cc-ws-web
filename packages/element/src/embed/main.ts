// Entry point for the embed build. Importing the .svelte file with a
// <svelte:options customElement={...}> directive auto-registers the
// element on the global customElements registry. No further wiring
// needed — drop the bundled script tag into a host page and the
// <cc-ws-chat> tag becomes a usable element.

import "./cc-ws-chat.svelte";
