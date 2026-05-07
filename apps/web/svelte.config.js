import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";

export default {
  preprocess: vitePreprocess(),
  // customElement:true tells the compiler the build can produce custom
  // elements where a component declares <svelte:options customElement>.
  // Other components are unaffected — they still compile as regular
  // Svelte components. Required so the embed entry's cc-ws-chat.svelte
  // type-checks under svelte-check (the SPA build also picks it up; no
  // observable change there because no SPA component has the directive).
  compilerOptions: {
    customElement: true,
  },
};
