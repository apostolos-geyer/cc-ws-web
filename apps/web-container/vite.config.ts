import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { cloudflare } from "@cloudflare/vite-plugin";

// Single dev process: vite serves the SPA, the cloudflare plugin runs the
// worker (src/worker.ts) in the same vite dev server so /init/:id and
// /ws/:id are handled by the worker while every other route falls through
// to the SPA. `wrangler dev` machinery is delegated to the plugin.
export default defineConfig({
  plugins: [
    svelte({
      compilerOptions: { customElement: true },
    }),
    cloudflare(),
  ],
  build: {
    outDir: "dist/client",
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    strictPort: false,
  },
});
