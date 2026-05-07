<script lang="ts">
  let { text = "", streaming = false }: { text: string; streaming?: boolean } = $props();
  let expanded = $state(false);

  // Auto-collapse when not streaming and longer than ~3 lines.
  const collapsed = $derived(!expanded && !streaming && text.split("\n").length > 3);
  const preview = $derived(text.split("\n").slice(0, 3).join("\n"));
</script>

<div class="thinking">
  <button class="head" onclick={() => (expanded = !expanded)} disabled={streaming}>
    <span class="glyph">*</span>
    <span class="label">{streaming ? "thinking…" : expanded ? "thinking" : "thinking"}</span>
    {#if !streaming}
      <span class="toggle">{expanded ? "[hide]" : "[show]"}</span>
    {/if}
  </button>
  <div class="body" class:streaming>
    {collapsed ? preview + "\n…" : text}
  </div>
</div>

<style>
  .thinking {
    border-left: 2px solid var(--thinking);
    padding: 4px 0 4px 10px;
    color: var(--fg-1);
  }
  .head {
    display: flex;
    align-items: center;
    gap: 6px;
    color: var(--thinking);
    font-size: 12px;
    margin-bottom: 4px;
  }
  .head:disabled { cursor: default; opacity: 0.85; }
  .glyph { font-size: 14px; line-height: 1; }
  .toggle { color: var(--fg-3); font-size: 11px; }
  .body {
    white-space: pre-wrap;
    word-break: break-word;
    color: var(--fg-1);
    font-style: italic;
    font-size: 12.5px;
  }
  .body.streaming::after {
    content: "▍";
    color: var(--thinking);
    margin-left: 1px;
    animation: blink 1s steps(2, end) infinite;
  }
  @keyframes blink {
    0%, 100% { opacity: 1; }
    50% { opacity: 0; }
  }
</style>
