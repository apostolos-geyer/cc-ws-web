<script lang="ts">
  import { ui, closePanel } from "../../lib/ui.svelte";
  import TasksPanel from "./TasksPanel.svelte";
  import PermissionsPanel from "./PermissionsPanel.svelte";
  import HooksPanel from "./HooksPanel.svelte";
  import SettingsPanel from "./SettingsPanel.svelte";
  import HelpPanel from "./HelpPanel.svelte";

  const titles: Record<string, string> = {
    tasks: "tasks",
    permissions: "permissions",
    hooks: "hooks",
    settings: "settings",
    help: "keys",
  };
</script>

{#if ui.activePanel}
  <div class="panel" role="dialog" aria-label={titles[ui.activePanel]}>
    <header class="panel-head">
      <span class="title">{titles[ui.activePanel]}</span>
      <button class="close" onclick={closePanel} aria-label="close" title="esc">✕</button>
    </header>
    <div class="panel-body">
      {#if ui.activePanel === "tasks"}
        <TasksPanel />
      {:else if ui.activePanel === "permissions"}
        <PermissionsPanel />
      {:else if ui.activePanel === "hooks"}
        <HooksPanel />
      {:else if ui.activePanel === "settings"}
        <SettingsPanel />
      {:else if ui.activePanel === "help"}
        <HelpPanel />
      {/if}
    </div>
  </div>
{/if}

<style>
  .panel {
    position: fixed;
    top: 60px;
    right: 14px;
    bottom: 100px;
    width: 360px;
    max-width: calc(100vw - 28px);
    background: var(--bg-1);
    border: 1px solid var(--border-1);
    border-radius: 4px;
    display: flex;
    flex-direction: column;
    box-shadow: 0 24px 48px rgba(0, 0, 0, 0.5), 0 4px 12px rgba(0, 0, 0, 0.3);
    z-index: 10;
    animation: pop 120ms ease-out;
  }
  @keyframes pop {
    from { opacity: 0; transform: translateY(-4px); }
    to { opacity: 1; transform: translateY(0); }
  }
  .panel-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 8px 12px;
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
  }
  .title {
    font-size: 11px;
    color: var(--accent);
    text-transform: uppercase;
    letter-spacing: 0.06em;
    font-weight: 600;
  }
  .close {
    color: var(--fg-3);
    font-size: 13px;
    width: 18px;
    height: 18px;
    border-radius: 3px;
  }
  .close:hover { color: var(--fg); background: var(--bg-2); }
  .panel-body {
    flex: 1;
    overflow-y: auto;
    padding: 4px 0;
  }
</style>
