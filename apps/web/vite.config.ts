import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";

// Dev: vite serves the UI on 5173, the cc-ws bridge runs separately on 3000
// (see package.json `dev` script). The UI connects directly to ws://localhost:3000/ws.
// In prod we ship `dist/` and the host serves it however it likes.

export default defineConfig({
  plugins: [svelte()],
  server: {
    port: 5173,
    strictPort: true,
  },
});
