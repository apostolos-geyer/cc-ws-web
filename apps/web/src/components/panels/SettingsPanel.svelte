<script lang="ts">
  import {
    getCcSession,
    EFFORT_OPTIONS,
    MODEL_OPTIONS,
    PERMISSION_MODE_OPTIONS,
    type Effort,
    type PermissionMode,
  } from "@somewhatintelligent/cc-ws-svelte";

  const session = getCcSession();
  const {
    activeMode, pendingMode, modeError,
    activeModel, pendingModel, modelError,
    activeEffort, pendingEffort, effortError,
  } = session.atoms;
</script>

<div class="section">
  <div class="head">model</div>
  <div class="grid">
    {#each MODEL_OPTIONS as opt (opt.value)}
      <button
        class="opt"
        class:active={$activeModel === opt.value}
        class:pending={$pendingModel === opt.value}
        onclick={() => session.setModel(opt.value)}
      >
        <span>{opt.label}</span>
      </button>
    {/each}
  </div>
  {#if $modelError}<div class="err">{$modelError}</div>{/if}
</div>

<div class="section">
  <div class="head">effort</div>
  <div class="grid">
    {#each EFFORT_OPTIONS as opt (opt.value)}
      <button
        class="opt"
        class:active={$activeEffort === opt.value}
        class:pending={$pendingEffort === opt.value}
        onclick={() => session.setEffort(opt.value as Effort)}
      >
        <span>{opt.label}</span>
      </button>
    {/each}
  </div>
  {#if $effortError}<div class="err">{$effortError}</div>{/if}
</div>

<div class="section">
  <div class="head">permission mode <span class="dim">(shift+tab to cycle)</span></div>
  <div class="grid">
    {#each PERMISSION_MODE_OPTIONS as opt (opt.value)}
      <button
        class="opt"
        class:active={$activeMode === opt.value}
        class:pending={$pendingMode === opt.value}
        onclick={() => session.setPermissionMode(opt.value as PermissionMode)}
      >
        <span>{opt.label}</span>
      </button>
    {/each}
  </div>
  {#if $modeError}<div class="err">{$modeError}</div>{/if}
</div>

<style>
  .section {
    padding: 10px 14px;
    border-bottom: 1px solid var(--border);
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .section:last-child { border-bottom: 0; }
  .head {
    font-size: 11px;
    color: var(--fg-2);
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }
  .dim { color: var(--fg-3); }
  .grid {
    display: grid;
    grid-template-columns: 1fr;
    gap: 4px;
  }
  .opt {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    text-align: left;
    padding: 6px 10px;
    border: 1px solid var(--border);
    border-radius: 3px;
    color: var(--fg-1);
    font-size: 12px;
  }
  .opt:hover { border-color: var(--fg-2); }
  .opt.active {
    border-color: var(--accent-line);
    background: var(--accent-soft);
    color: var(--accent);
  }
  .opt.pending {
    border-color: var(--warn);
    color: var(--warn);
  }
  .err {
    color: var(--error);
    font-size: 11px;
  }
</style>
