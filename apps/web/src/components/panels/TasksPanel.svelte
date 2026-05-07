<script lang="ts">
  import { getCcSession, type TaskStatus } from "@somewhatintelligent/cc-ws-svelte";
  import { formatDuration, formatCtx } from "../../lib/format";

  const session = getCcSession();
  const { tasks } = session.atoms;

  // Typed param: TS will flag a missing branch when TaskStatus grows a new variant.
  function statusGlyph(s: TaskStatus): string {
    switch (s) {
      case "running": return "●";
      case "completed": return "✓";
      case "failed": return "✗";
      case "stopped": return "■";
    }
  }
</script>

{#if $tasks.length === 0}
  <div class="empty">no tasks yet</div>
{/if}

{#each $tasks as t (t.taskId)}
  <div class="task" data-status={t.status}>
    <div class="head">
      <span class="glyph">{statusGlyph(t.status)}</span>
      <span class="type">{t.taskType ?? "task"}</span>
      <span class="status">{t.status}</span>
      {#if t.status === "running"}
        <button class="stop" onclick={() => session.stopTask(t.taskId)} title="⌘I to interrupt all">stop</button>
      {/if}
    </div>
    {#if t.toolUseId}
      <div class="meta dim">via tool_use {t.toolUseId.slice(0, 8)}</div>
    {/if}
    <div class="meta">
      {#if t.usage?.durationMs != null}<span>{formatDuration(t.usage.durationMs)}</span>{/if}
      {#if t.usage?.totalTokens != null}<span class="sep">·</span><span>{formatCtx(t.usage.totalTokens)} ctx</span>{/if}
      {#if t.usage?.toolUses != null}<span class="sep">·</span><span>{t.usage.toolUses} tool{t.usage.toolUses === 1 ? "" : "s"}</span>{/if}
    </div>
  </div>
{/each}

<style>
  .empty {
    padding: 24px 14px;
    color: var(--fg-3);
    font-size: 12px;
    text-align: center;
  }
  .task {
    padding: 10px 14px;
    border-bottom: 1px solid var(--border);
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .task:last-child { border-bottom: 0; }
  .head {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 12px;
  }
  .glyph { width: 12px; text-align: center; flex-shrink: 0; }
  .task[data-status="running"] .glyph { color: var(--accent); animation: pulse 1.2s ease-in-out infinite; }
  .task[data-status="completed"] .glyph { color: var(--ok); }
  .task[data-status="failed"] .glyph { color: var(--error); }
  .task[data-status="stopped"] .glyph { color: var(--warn); }
  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.45; }
  }
  .type { color: var(--fg); font-weight: 600; flex-shrink: 0; }
  .status { color: var(--fg-2); font-size: 11px; }
  .stop {
    margin-left: auto;
    padding: 2px 8px;
    border: 1px solid var(--border-1);
    border-radius: 3px;
    color: var(--warn);
    font-size: 11px;
  }
  .stop:hover { background: var(--bg-2); border-color: var(--warn); }
  .meta { font-size: 11px; color: var(--fg-2); display: flex; gap: 4px; align-items: center; flex-wrap: wrap; }
  .dim { color: var(--fg-3); }
  .sep { color: var(--fg-3); }
</style>
