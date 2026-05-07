<script lang="ts">
  import { sumContextTokens, type ResultFrame } from "@somewhatintelligent/cc-ws-svelte";
  import { formatDuration, formatCtx } from "../../lib/format";

  let { frame }: { frame: ResultFrame } = $props();

  const isErr = $derived(!!frame.subtype && frame.subtype !== "success");
  const dur = $derived(frame.duration_ms ?? null);
  const tokens = $derived(sumContextTokens(frame.usage));
  const cost = $derived(frame.total_cost_usd ?? null);
</script>

<div class="row" class:error={isErr}>
  <span class="glyph">{isErr ? "✗" : "✓"}</span>
  <span class="label">{isErr ? frame.subtype || "error" : "turn complete"}</span>
  <span class="dim">
    {#if dur != null}{formatDuration(dur)}{/if}
    {#if tokens != null}<span class="sep">·</span>{formatCtx(tokens)} ctx{/if}
    {#if cost != null}<span class="sep">·</span>${cost.toFixed(4)}{/if}
  </span>
</div>

<style>
  .row {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 11px;
    color: var(--fg-2);
    padding: 2px 0;
  }
  .row.error { color: var(--error); }
  .glyph { color: var(--ok); flex-shrink: 0; }
  .row.error .glyph { color: var(--error); }
  .label { font-weight: 600; }
  .dim { color: var(--fg-3); display: inline-flex; gap: 6px; align-items: center; }
  .sep { color: var(--fg-3); }
</style>
