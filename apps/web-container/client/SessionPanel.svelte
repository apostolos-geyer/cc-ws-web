<script lang="ts">
  import { initStatus, runInit } from "./stores/session";
  import { clearSetup } from "./stores/setup";
  import type { Setup } from "../src/setup-flow";
  import SessionStatus from "./SessionStatus.svelte";
  import Chat from "./Chat.svelte";
  import { onMount } from "svelte";

  let { setup }: { setup: Setup } = $props();

  const status = initStatus;

  onMount(() => {
    if ($status.tag === "idle") {
      void runInit(setup);
    }
  });

  // Retry reuses the SAME sessionId. /init is idempotent — if a sandbox
  // already exists for this id, the worker attaches to it and restarts
  // the bridge in place instead of spinning up a fresh container.
  // Never generate a new id from the UI: that would orphan the existing
  // sandbox (resource leak — there's no destroy path).
  function retry() {
    void runInit(setup);
  }

  // Clear credentials returns to the setup form WITHOUT touching the
  // sessionId. Re-submitting the setup form will run /init on the same
  // sessionId again and reconnect to the existing container.
  function clearCreds() {
    clearSetup();
  }
</script>

<header>
  <SessionStatus />
  <div class="actions">
    {#if $status.tag === "failed"}
      <button onclick={retry}>Retry init</button>
    {/if}
    <button onclick={clearCreds}>Clear credentials</button>
  </div>
</header>

{#if $status.tag === "ready"}
  <Chat />
{:else if $status.tag === "failed"}
  <div class="error-pane">
    <h2>Session init failed: {$status.reason}</h2>
    {#if $status.detail}<pre>{$status.detail}</pre>{/if}
  </div>
{:else}
  <div class="pending-pane">Starting sandbox…</div>
{/if}

<style>
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.5rem 1rem;
    background: #161618;
    border-bottom: 1px solid #2a2a2d;
    font-size: 13px;
  }
  .actions {
    display: flex;
    gap: 0.5rem;
  }
  button {
    padding: 0.3rem 0.6rem;
    background: #232327;
    border: 1px solid #2a2a2d;
    color: #e6e6e6;
    border-radius: 4px;
    cursor: pointer;
    font-size: 12px;
  }
  button:hover {
    background: #2a2a2f;
  }
  .pending-pane,
  .error-pane {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    color: #9a9a9f;
    padding: 2rem;
  }
  .error-pane pre {
    background: #161618;
    border: 1px solid #2a2a2d;
    padding: 1rem;
    border-radius: 6px;
    max-width: 80ch;
    color: #f87171;
    white-space: pre-wrap;
  }
</style>
