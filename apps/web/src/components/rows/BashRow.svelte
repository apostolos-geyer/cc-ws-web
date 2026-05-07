<script lang="ts">
  // Single terminal block for a `!cmd` exchange. Always left-aligned, full
  // chat-row width. The command line is rendered as `$ cmd`; clicking the
  // header expands to show stdout / stderr / exit-code. Live output (from
  // a still-running entry's chunks) appears immediately below the header
  // even when collapsed.

  let {
    command = "",
    chunks = [] as string[],
    pending = false,
    stdout = "",
    stderr = "",
    exit = "",
  }: {
    command: string;
    chunks?: string[];
    pending?: boolean;
    stdout?: string;
    stderr?: string;
    exit?: string;
  } = $props();

  let expanded = $state(true);

  // Output text: prefer chunks if present, else fall back to direct stdout
  // (drained-synthesis case where we have the XML directly).
  const output = $derived(chunks.length ? chunks.join("\n") : stdout);
  const hasOutput = $derived((output + stderr).trim().length > 0);
  const isErr = $derived(exit !== "" && exit !== "0");
</script>

<div class="row" data-pending={pending} class:err={isErr}>
  <button class="head" onclick={() => (expanded = !expanded)} disabled={!hasOutput && !pending}>
    <span class="prompt">$</span>
    <span class="cmd">{command}</span>
    {#if pending}
      <span class="status running">running…</span>
    {:else if isErr}
      <span class="status err">exit {exit}</span>
    {:else if exit}
      <span class="status ok">exit {exit}</span>
    {/if}
    {#if hasOutput}
      <span class="toggle">{expanded ? "[hide]" : "[show]"}</span>
    {/if}
  </button>
  {#if expanded && hasOutput}
    <div class="body">
      {#if output}<pre class="stdout">{output}</pre>{/if}
      {#if stderr}<pre class="stderr">{stderr}</pre>{/if}
    </div>
  {/if}
</div>

<style>
  .row {
    border: 1px solid var(--border-1);
    border-radius: 3px;
    background: var(--bg-1);
    overflow: hidden;
  }
  .row.err { border-color: rgba(225, 92, 92, 0.4); }
  .head {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 10px;
    width: 100%;
    text-align: left;
    font-size: 12px;
  }
  .head:hover:not(:disabled) { background: var(--bg-2); }
  .prompt { color: var(--accent); flex-shrink: 0; }
  .cmd {
    color: var(--fg);
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    min-width: 0;
  }
  .status {
    font-size: 10.5px;
    padding: 0 5px;
    border-radius: 2px;
    flex-shrink: 0;
  }
  .status.running { color: var(--warn); animation: pulse 1.2s ease-in-out infinite; }
  .status.ok { color: var(--ok); }
  .status.err { color: var(--error); }
  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
  }
  .toggle { color: var(--fg-3); font-size: 11px; flex-shrink: 0; }
  .body {
    border-top: 1px solid var(--border);
    background: var(--bg);
  }
  pre {
    margin: 0;
    padding: 6px 12px;
    white-space: pre-wrap;
    word-break: break-word;
    font-size: 11.5px;
    max-height: 280px;
    overflow: auto;
  }
  .stdout { color: var(--fg-1); }
  .stderr { color: var(--error); border-top: 1px dashed var(--border); }
</style>
