import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";

export default {
  preprocess: vitePreprocess(),
  // customElement aware so the <cc-ws-chat> embed (imported in client/main.ts)
  // type-checks; SPA components are unaffected — none declare
  // <svelte:options customElement>.
  compilerOptions: {
    customElement: true,
  },
};
