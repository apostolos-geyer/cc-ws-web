<script lang="ts">
  import { initStatus, sessionId } from "./stores/session";

  const status = initStatus;
  const id = sessionId;
</script>

<div class="status">
  <span class="dot {$status.tag}"></span>
  <span class="label">
    {#if $status.tag === "idle"}idle{:else if $status.tag === "running"}initializing{:else if $status.tag === "ready"}ready · cwd <code>{$status.result.cwd}</code>{:else}failed{/if}
  </span>
  <span class="sid">session <code>{$id.slice(0, 8)}</code></span>
</div>

<style>
  .status {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    font-size: 13px;
    color: #c4c4c8;
  }
  .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #6b7280;
  }
  .dot.running {
    background: #fbbf24;
    animation: pulse 1.4s ease-in-out infinite;
  }
  .dot.ready {
    background: #34d399;
  }
  .dot.failed {
    background: #f87171;
  }
  @keyframes pulse {
    0%, 100% { opacity: 0.4; }
    50% { opacity: 1; }
  }
  code {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    color: #e6e6e6;
    font-size: 0.9em;
  }
  .sid {
    color: #6b7280;
  }
</style>
