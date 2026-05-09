<svelte:options customElement={{
  tag: "cc-ws-chat",
  shadow: "open",
  props: {
    wsUrl:        { attribute: "ws-url",        type: "String"  },
    persist:      { attribute: "persist",       type: "String"  },
    storageKey:   { attribute: "storage-key",   type: "String"  },
    initialState: { attribute: "initial-state", type: "String"  },
    keybinds:     { attribute: "keybinds",      type: "Boolean" },
  },
}} />

<script lang="ts">
  // Drop-in custom element: <cc-ws-chat ws-url="..."></cc-ws-chat>.
  //
  // shadow:"open" — host-page CSS can't reach inside, our scoped Svelte
  // component styles can't reach out. The host can still theme via CSS
  // custom properties on the element itself, e.g.
  //   cc-ws-chat { --accent: #6ba6e0; --bg: #0a0a0a; }
  // because CSS variables pierce the shadow boundary.
  //
  // Children (Header, MessageStream, etc.) are regular Svelte components;
  // their scoped styles are bundled into THIS shadow root by the compiler
  // when the parent is a customElement-tagged component.
  //
  // Persistence: see App.svelte / session.svelte.ts. Default is no
  // persistence — the host opts in via:
  //   <cc-ws-chat persist="local" storage-key="my-chat">         // ← built-in localStorage
  //   <cc-ws-chat persist="session" storage-key="my-chat">       // ← built-in sessionStorage
  //   <cc-ws-chat initial-state='{"sessionId":"…"}'>             // ← host-driven via attribute
  //   el.addEventListener("cc-ws-state-change", e => save(e.detail))  // ← snapshot mirror
  import App from "../App.svelte";
  import { onMount } from "svelte";

  let {
    wsUrl,
    persist,
    storageKey,
    initialState,
    keybinds = false,
  }: {
    wsUrl?: string;
    persist?: "local" | "session" | "none";
    storageKey?: string;
    initialState?: string;
    keybinds?: boolean;
  } = $props();

  // Resolve the host element so we can dispatch CustomEvents on the
  // `<cc-ws-chat>` itself (host code does
  // `el.addEventListener("cc-ws-state-change", …)`).
  let rootEl: HTMLDivElement | null = $state(null);
  let host: HTMLElement | null = null;
  onMount(() => {
    // The shadow root's host is the cc-ws-chat element. Walk up via
    // getRootNode() so this works regardless of where in the tree
    // <App> mounts.
    const root = rootEl?.getRootNode();
    if (root instanceof ShadowRoot) host = root.host as HTMLElement;
  });

  function emitSnapshot(snapshot: string) {
    host?.dispatchEvent(new CustomEvent("cc-ws-state-change", {
      detail: snapshot,
      bubbles: false,
      composed: false,
    }));
  }
</script>

<div class="root" bind:this={rootEl}>
  <App
    {wsUrl}
    {persist}
    {storageKey}
    {initialState}
    onSnapshot={emitSnapshot}
    installKeybinds={keybinds}
  />
</div>

<style>
  /* Tokens. The host page can override any of these with
     `cc-ws-chat { --accent: ...; --bg: ...; }` because CSS vars cross
     the shadow boundary. */
  :host {
    --bg: #0d0d0e;
    --bg-1: #131316;
    --bg-2: #1a1a1e;
    --bg-3: #232328;
    --fg: #e6e6e8;
    --fg-1: #b4b4ba;
    --fg-2: #6b6b72;
    --fg-3: #3f3f44;
    --border: #1c1c20;
    --border-1: #2a2a30;

    --accent: #d97757;
    --accent-soft: rgba(217, 119, 87, 0.14);
    --accent-line: rgba(217, 119, 87, 0.35);

    --warn: #e0a458;
    --error: #e15c5c;
    --ok: #6dd494;
    --info: #6ba6e0;
    --thinking: #b08ad9;
    --teal: #4fb8b0;

    --font-mono: "Iosevka", "JetBrains Mono", ui-monospace, "SF Mono", Menlo, Consolas, monospace;
    --font-size: 13.5px;
    --line-height: 1.55;

    color-scheme: dark;
    display: block;
    height: 100%;
    contain: layout paint style;
  }

  /* Resets — global resets from the SPA's app.css scoped to the shadow
     root. `:global(...)` is required because the elements they target
     live in descendant components, not in this component's template. */
  :host { box-sizing: border-box; }
  :host :global(*) { box-sizing: border-box; }

  :host :global(button) {
    font: inherit;
    color: inherit;
    background: transparent;
    border: 0;
    padding: 0;
    cursor: pointer;
  }

  :host :global(input),
  :host :global(textarea) {
    font: inherit;
    color: inherit;
    background: transparent;
    border: 0;
    outline: 0;
    resize: none;
  }

  :host :global(a) { color: var(--accent); text-decoration: none; }
  :host :global(a:hover) { text-decoration: underline; }

  :host :global(::-webkit-scrollbar) { width: 8px; height: 8px; }
  :host :global(::-webkit-scrollbar-track) { background: transparent; }
  :host :global(::-webkit-scrollbar-thumb) { background: var(--bg-3); border-radius: 4px; }
  :host :global(::-webkit-scrollbar-thumb:hover) { background: var(--border-1); }

  /* The component-tree root. Shadow DOM gives us a single anchor
     element; flex-column makes Header / MessageStream / Composer /
     StatusFooter stack the way they do in the SPA's #app. */
  .root {
    display: flex;
    flex-direction: column;
    height: 100%;
    width: 100%;
    min-height: 0;
    background: var(--bg);
    color: var(--fg);
    font-family: var(--font-mono);
    font-size: var(--font-size);
    line-height: var(--line-height);
    font-feature-settings: "calt" 1, "ss01" 1;
    -webkit-font-smoothing: antialiased;
    text-rendering: optimizeLegibility;
  }

  /* These are referenced by class from inside child components but
     defined here so they apply inside the shadow root. */
  .root :global(.gutter) {
    display: inline-block;
    width: 14px;
    text-align: center;
    color: var(--fg-3);
    user-select: none;
    flex-shrink: 0;
  }
  .root :global(.dim) { color: var(--fg-2); }
  .root :global(.dimmer) { color: var(--fg-3); }
  .root :global(.accent) { color: var(--accent); }
  .root :global(.kbd) {
    font-family: inherit;
    font-size: 0.85em;
    padding: 0 4px;
    border: 1px solid var(--border-1);
    border-radius: 3px;
    color: var(--fg-1);
    background: var(--bg-1);
  }
</style>
