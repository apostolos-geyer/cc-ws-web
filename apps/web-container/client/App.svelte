<script lang="ts">
  import { setupStore } from "./stores/setup";
  import SetupForm from "./SetupForm.svelte";
  import SessionPanel from "./SessionPanel.svelte";

  const setup = setupStore;
</script>

<main>
  {#if $setup === null}
    <SetupForm />
  {:else}
    <SessionPanel setup={$setup} />
  {/if}
</main>

<style>
  main {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: #0d0d0e;
    color: #e6e6e6;
  }
</style>
