<script lang="ts">
  import type { ToolResultContentBlock } from "@somewhatintelligent/cc-ws-svelte";

  let { content = [] }: { content: ToolResultContentBlock[] } = $props();
  let expanded = $state(false);

  const blocks = $derived(content.filter((b) => b.type === "tool_result"));

  function asText(b: ToolResultContentBlock): string {
    if (typeof b.content === "string") return b.content;
    if (Array.isArray(b.content)) {
      return b.content
        .flatMap((c) => (c.type === "text" && typeof c.text === "string" ? [c.text] : []))
        .join("\n");
    }
    return JSON.stringify(b.content ?? "");
  }
</script>

{#each blocks as b, i (i)}
  {@const text = asText(b)}
  {@const lineCount = text.split("\n").length}
  {@const collapsed = !expanded && lineCount > 6}
  <div class="row" class:error={b.is_error}>
    <button class="head" onclick={() => (expanded = !expanded)}>
      <span class="glyph">↳</span>
      <span class="label">{b.is_error ? "tool error" : "tool result"}</span>
      <span class="meta">{lineCount} line{lineCount === 1 ? "" : "s"}</span>
      <span class="toggle">{expanded ? "[hide]" : "[show]"}</span>
    </button>
    {#if expanded}
      <pre class="body">{text}</pre>
    {:else}
      <pre class="body preview">{collapsed ? text.split("\n").slice(0, 4).join("\n") + "\n…" : text}</pre>
    {/if}
  </div>
{/each}

<style>
  .row {
    border-left: 2px solid var(--border-1);
    padding-left: 10px;
    color: var(--fg-1);
  }
  .row.error { border-left-color: var(--error); }
  .head {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 11.5px;
    color: var(--fg-2);
    margin-bottom: 3px;
  }
  .row.error .head { color: var(--error); }
  .glyph { color: var(--fg-2); flex-shrink: 0; }
  .row.error .glyph { color: var(--error); }
  .label { font-weight: 600; }
  .meta { color: var(--fg-3); }
  .toggle { color: var(--fg-3); font-size: 11px; }
  .body {
    margin: 0;
    font-size: 11.5px;
    color: var(--fg-1);
    white-space: pre-wrap;
    word-break: break-word;
    max-height: 280px;
    overflow: auto;
  }
  .body.preview { color: var(--fg-2); }
</style>
