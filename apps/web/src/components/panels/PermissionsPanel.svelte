<script lang="ts">
  import { getCcSession } from "@cc-ws/svelte";
  import { previewToolInput } from "../../lib/format";

  const session = getCcSession();
  const { pendingPermissions } = session.atoms;

  function allow(id: string) {
    session.respondToPermission(id, { behavior: "allow" });
  }
  function deny(id: string) {
    session.respondToPermission(id, { behavior: "deny", message: "Denied by user" });
  }
</script>

{#if $pendingPermissions.length === 0}
  <div class="empty">
    <div>no pending requests</div>
    <div class="dim">they'll appear here when claude calls a tool that needs your sign-off</div>
  </div>
{/if}

{#each $pendingPermissions as p (p.id)}
  <div class="perm">
    <div class="head">
      <span class="tool">{p.toolName}</span>
      <span class="dim">requests permission</span>
    </div>
    <pre class="input">{previewToolInput(p.input, 280)}</pre>
    <div class="actions">
      <button class="allow" onclick={() => allow(p.id)}>allow</button>
      <button class="deny" onclick={() => deny(p.id)}>deny</button>
    </div>
  </div>
{/each}

<style>
  .empty {
    padding: 24px 14px;
    color: var(--fg-2);
    font-size: 12px;
    text-align: center;
    line-height: 1.6;
  }
  .empty .dim { color: var(--fg-3); margin-top: 4px; font-size: 11px; }
  .perm {
    padding: 12px 14px;
    border-bottom: 1px solid var(--border);
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .perm:last-child { border-bottom: 0; }
  .head {
    display: flex;
    align-items: baseline;
    gap: 6px;
    font-size: 12.5px;
  }
  .tool { color: var(--accent); font-weight: 600; }
  .dim { color: var(--fg-2); }
  .input {
    margin: 0;
    padding: 8px;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 3px;
    font-size: 11px;
    color: var(--fg-1);
    white-space: pre-wrap;
    word-break: break-word;
    max-height: 200px;
    overflow: auto;
  }
  .actions {
    display: flex;
    gap: 6px;
  }
  .allow, .deny {
    flex: 1;
    padding: 5px 10px;
    border-radius: 3px;
    font-size: 12px;
    border: 1px solid var(--border-1);
  }
  .allow { color: var(--ok); border-color: rgba(109, 212, 148, 0.35); }
  .allow:hover { background: rgba(109, 212, 148, 0.12); }
  .deny { color: var(--error); border-color: rgba(225, 92, 92, 0.35); }
  .deny:hover { background: rgba(225, 92, 92, 0.12); }
</style>
