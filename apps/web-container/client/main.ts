// SPA entry. Side-effect-imports the published, pre-built element bundle so
// `<cc-ws-chat>` registers on `customElements` before any Svelte component
// in this app tries to render it. Matches slopbox's
// `void import("@somewhatintelligent/cc-ws-element")` pattern — going
// through the package's pre-bundled dist avoids re-running the svelte
// compiler on the element source under this app's compile context, which
// is fragile under @cloudflare/vite-plugin's split worker/client envs.

import "@somewhatintelligent/cc-ws-element";
import App from "./App.svelte";
import { mount } from "svelte";

const target = document.getElementById("app");
if (!target) throw new Error("missing #app");

mount(App, { target });
