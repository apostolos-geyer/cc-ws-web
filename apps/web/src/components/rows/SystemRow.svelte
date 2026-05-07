<script lang="ts">
  import type { SystemFrame, UnknownSystemFrame } from "@cc-ws/svelte";

  // Catch-all line for system frames the renderer doesn't have a richer
  // template for. Keeps unknown subtypes visible without forcing a
  // bespoke component each.

  let { frame }: { frame: SystemFrame | UnknownSystemFrame } = $props();
  const subtype = $derived(frame.subtype);
</script>

<div class="row">
  <span class="glyph">·</span>
  <span class="label">{subtype}</span>
</div>

<style>
  .row {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 11px;
    color: var(--fg-3);
  }
  .label { font-style: italic; }
</style>
