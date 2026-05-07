<script lang="ts">
  import { ellipsis, previewToolInput } from "../../lib/format";

  let {
    name = "",
    input = {},
    partialJson = "",
    parsed = true,
    streaming = false,
  }: {
    name: string;
    input: unknown;
    partialJson?: string;
    parsed?: boolean;
    streaming?: boolean;
  } = $props();

  let expanded = $state(false);

  const preview = $derived(
    !parsed ? (partialJson ? ellipsis(partialJson, 100) + "…" : "(streaming)") : previewToolInput(input, 120),
  );
</script>

<div class="card" class:streaming>
  <button class="head" onclick={() => (expanded = !expanded)}>
    <span class="glyph">⎿</span>
    <span class="name">{name}</span>
    <span class="preview">{preview}</span>
    <span class="toggle">{expanded ? "[hide]" : "[show]"}</span>
  </button>
  {#if expanded}
    <pre class="body">{parsed ? JSON.stringify(input, null, 2) : partialJson}</pre>
  {/if}
</div>

<style>
  .card {
    border: 1px solid var(--border-1);
    border-radius: 3px;
    background: var(--bg-1);
    overflow: hidden;
  }
  .card.streaming { border-color: var(--accent-line); }
  .head {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 5px 10px;
    width: 100%;
    text-align: left;
    font-size: 12px;
  }
  .head:hover { background: var(--bg-2); }
  .glyph { color: var(--info); flex-shrink: 0; }
  .name {
    color: var(--info);
    font-weight: 600;
    flex-shrink: 0;
  }
  .preview {
    color: var(--fg-1);
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    min-width: 0;
  }
  .toggle { color: var(--fg-3); font-size: 11px; flex-shrink: 0; }
  .body {
    margin: 0;
    padding: 8px 12px;
    font-size: 11.5px;
    color: var(--fg-1);
    background: var(--bg);
    border-top: 1px solid var(--border);
    white-space: pre-wrap;
    word-break: break-word;
    max-height: 360px;
    overflow: auto;
  }
</style>
