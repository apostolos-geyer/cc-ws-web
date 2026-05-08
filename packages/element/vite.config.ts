import { copyFileSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";

// Library-mode build that emits a single drop-in IIFE at
// dist/cc-ws-chat.js. Run with: bun run build.
//
// Why one file: the svelte plugin's `compilerOptions.customElement: true`
// switches every component referenced from the embed entry to inline its
// scoped styles into the JS bundle (instead of extracting to a sidecar
// .css). Combined with `cssCodeSplit: false` + IIFE format, the build
// produces exactly one .js the host page can <script src=...> with no
// extra fetch.

export default defineConfig({
  plugins: [
    svelte({
      compilerOptions: {
        customElement: true,
      },
    }),
    {
      name: "copy-embed-dts",
      apply: "build",
      closeBundle() {
        const root = import.meta.dirname;
        copyFileSync(
          resolve(root, "src/embed/cc-ws-chat.d.ts"),
          resolve(root, "dist/cc-ws-chat.d.ts"),
        );
      },
    },
  ],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    cssCodeSplit: false,
    sourcemap: false,
    lib: {
      entry: "src/embed/main.ts",
      name: "CcWsChat",
      formats: ["iife"],
      fileName: () => "cc-ws-chat.js",
    },
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
      },
    },
  },
});
