<script lang="ts">
  import { getCcSession } from "@cc-ws/svelte";

  const session = getCcSession();
  const { hookEvents } = session.atoms;

  // Newest first.
  const reversed = $derived([...$hookEvents].reverse());

  function fmtTs(ms: number): string {
    const d = new Date(ms);
    return d.toLocaleTimeString("en-US", { hour12: false });
  }
</script>

{#if reversed.length === 0}
  <div class="empty">no hook events yet</div>
{/if}

{#each reversed as h (h.id)}
  <div class="row" data-subtype={h.subtype}>
    <span class="ts">{fmtTs(h.ts)}</span>
    <span class="name">{h.hookName ?? "hook"}</span>
    <span class="sub">{h.subtype.replace("hook_", "")}</span>
  </div>
{/each}

<style>
  .empty {
    padding: 24px 14px;
    color: var(--fg-3);
    font-size: 12px;
    text-align: center;
  }
  .row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px 14px;
    font-size: 11.5px;
    color: var(--fg-1);
    border-bottom: 1px solid var(--border);
  }
  .row:last-child { border-bottom: 0; }
  .ts { color: var(--fg-3); width: 64px; flex-shrink: 0; }
  .name { color: var(--fg); flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .sub { color: var(--fg-2); font-size: 11px; }
  .row[data-subtype="hook_response"] .sub { color: var(--ok); }
  .row[data-subtype="hook_started"] .sub { color: var(--info); }
</style>
