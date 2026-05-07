<script lang="ts">
  import { getCcSession } from "@cc-ws/svelte";
  import { tick } from "svelte";
  import { createClassifier } from "../lib/classify";
  import UserRow from "./rows/UserRow.svelte";
  import AssistantRow from "./rows/AssistantRow.svelte";
  import ToolResultRow from "./rows/ToolResultRow.svelte";
  import SystemRow from "./rows/SystemRow.svelte";
  import ResultRow from "./rows/ResultRow.svelte";
  import BashRow from "./rows/BashRow.svelte";
  import ModeChangeRow from "./rows/ModeChangeRow.svelte";

  const session = getCcSession();
  const { messages, activeStreamId, shellEntries } = session.atoms;

  let scrollEl: HTMLElement | null = $state(null);
  let stickToBottom = $state(true);

  function isAtBottom(el: HTMLElement) {
    return el.scrollHeight - el.clientHeight - el.scrollTop < 32;
  }

  function onScroll() {
    if (!scrollEl) return;
    stickToBottom = isAtBottom(scrollEl);
  }

  $effect(() => {
    void $messages.length;
    void $activeStreamId;
    if (!stickToBottom || !scrollEl) return;
    void tick().then(() => {
      if (scrollEl) scrollEl.scrollTop = scrollEl.scrollHeight;
    });
  });

  // Long-lived classifier — memoises per entry.id so a streaming-token
  // delta only re-runs analysis on the trailing streaming row, not the
  // whole timeline. Survives the component lifetime.
  const classifier = createClassifier();
  const rows = $derived(classifier.classify($messages, $shellEntries));
</script>

<main bind:this={scrollEl} onscroll={onScroll}>
  <div class="inner">
    {#if rows.length === 0}
      <div class="empty">
        <div class="empty-glyph">◐</div>
        <div class="empty-line">connecting to the bridge…</div>
        <div class="empty-line dimmer">type a message to start  ·  <span class="kbd">!cmd</span> for shell  ·  <span class="kbd">⌘/</span> help</div>
      </div>
    {/if}
    {#each rows as r (r.id)}
      {#if r.kind === "local_user"}
        <UserRow text={r.text} pending />
      {:else if r.kind === "user"}
        <UserRow text={r.text} />
      {:else if r.kind === "bash"}
        <BashRow
          command={r.command}
          chunks={r.chunks ?? []}
          pending={r.pending ?? false}
          stdout={r.stdout ?? ""}
          stderr={r.stderr ?? ""}
          exit={r.exit ?? ""}
        />
      {:else if r.kind === "assistant"}
        <AssistantRow content={r.content} />
      {:else if r.kind === "streaming"}
        <AssistantRow content={r.content} streaming />
      {:else if r.kind === "tool_result"}
        <ToolResultRow content={r.content} />
      {:else if r.kind === "result"}
        <ResultRow frame={r.frame} />
      {:else if r.kind === "mode_change"}
        <ModeChangeRow mode={r.mode} />
      {:else if r.kind === "system"}
        <SystemRow frame={r.frame} />
      {/if}
    {/each}
  </div>
</main>

<style>
  main {
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
    padding: 0;
    min-height: 0;
  }
  .inner {
    max-width: 880px;
    margin: 0 auto;
    padding: 18px 20px 24px;
    display: flex;
    flex-direction: column;
    gap: 14px;
  }
  .empty {
    margin: 60px auto;
    text-align: center;
    color: var(--fg-2);
  }
  .empty-glyph {
    font-size: 28px;
    color: var(--accent);
    margin-bottom: 12px;
  }
  .empty-line {
    font-size: 12.5px;
    line-height: 1.7;
  }
  .dimmer { color: var(--fg-3); }
</style>
