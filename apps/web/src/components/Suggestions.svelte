<script lang="ts">
  // Generic keyboard-navigable suggestion popup. The composer owns the
  // textarea + the trigger logic (which prefix is active, what query
  // string, what filtered items); this component is purely presentation
  // + "which row is highlighted" state. The composer drives selection
  // via bind:active and reacts to `select` events.

  import { tick } from "svelte";

  export type Item = { id: string; label: string; hint?: string };

  let {
    items = [] as Item[],
    active = $bindable(0),
    onselect,
    visible = false,
  }: {
    items: Item[];
    active?: number;
    onselect: (item: Item) => void;
    visible?: boolean;
  } = $props();

  let listEl: HTMLElement | null = $state(null);

  // Clamp active when items shrink.
  $effect(() => {
    if (active >= items.length) active = Math.max(0, items.length - 1);
    if (active < 0) active = 0;
  });

  // Scroll active row into view.
  $effect(() => {
    void active;
    void tick().then(() => {
      const el = listEl?.querySelector<HTMLElement>(`[data-idx="${active}"]`);
      el?.scrollIntoView({ block: "nearest" });
    });
  });
</script>

{#if visible && items.length > 0}
  <div class="popup" role="listbox" bind:this={listEl}>
    {#each items as item, i (item.id)}
      <button
        class="row"
        class:active={i === active}
        data-idx={i}
        role="option"
        aria-selected={i === active}
        onmousedown={(e) => { e.preventDefault(); onselect(item); }}
        onmouseenter={() => (active = i)}
      >
        <span class="label">{item.label}</span>
        {#if item.hint}<span class="hint">{item.hint}</span>{/if}
      </button>
    {/each}
  </div>
{/if}

<style>
  .popup {
    position: absolute;
    bottom: 100%;
    left: 0;
    right: 0;
    margin-bottom: 8px;
    max-height: 260px;
    overflow-y: auto;
    background: var(--bg-1);
    border: 1px solid var(--border-1);
    border-radius: 4px;
    padding: 4px;
    box-shadow: 0 12px 32px rgba(0, 0, 0, 0.5);
    z-index: 20;
  }
  .row {
    display: flex;
    align-items: baseline;
    gap: 10px;
    padding: 5px 8px;
    width: 100%;
    border-radius: 3px;
    text-align: left;
    color: var(--fg-1);
    font-size: 12px;
  }
  .row.active {
    background: var(--accent-soft);
    color: var(--fg);
  }
  .label {
    color: inherit;
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    min-width: 0;
  }
  .hint {
    color: var(--fg-3);
    font-size: 11px;
    flex-shrink: 0;
  }
  .row.active .hint { color: var(--fg-2); }
</style>
