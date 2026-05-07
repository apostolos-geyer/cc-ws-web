<script lang="ts">
  let { text = "", pending = false }: { text: string; pending?: boolean } = $props();
</script>

<div class="row" class:pending>
  <span class="gutter">▷</span>
  <div class="body">{text}</div>
</div>

<style>
  .row {
    display: flex;
    gap: 10px;
    align-items: flex-start;
    padding: 8px 12px;
    background: var(--bg-1);
    border-left: 2px solid var(--accent-line);
    border-radius: 3px;
  }
  .row.pending { opacity: 0.65; }
  .gutter {
    color: var(--accent);
    flex-shrink: 0;
    user-select: none;
    padding-top: 1px;
  }
  .body {
    white-space: pre-wrap;
    word-break: break-word;
    flex: 1;
    color: var(--fg);
  }
</style>
