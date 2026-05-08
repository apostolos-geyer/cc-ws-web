import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";

// Dev: vite serves the UI on 5173, the cc-ws bridge runs separately on 3000
// (see package.json `dev` script). The UI connects directly to ws://localhost:3000/ws.
// In prod we ship `dist/` and the host serves it however it likes.
//
// `customElement: true` makes the svelte plugin compile every component
// in customElement-aware mode. The dev demo now mounts via the actual
// <cc-ws-chat> tag (shadow DOM), and child components need their scoped
// styles inlined into that shadow root — the global flag is what triggers
// that inlining (mirrors packages/element/vite.config.ts).

export default defineConfig({
  plugins: [
    svelte({
      compilerOptions: {
        customElement: true,
      },
    }),
  ],
  server: {
    port: 5173,
    strictPort: true,
  },
});
