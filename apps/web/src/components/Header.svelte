<script lang="ts">
  import { getCcSession } from "@somewhatintelligent/cc-ws-svelte";
  import { shortenPath } from "../lib/format";
  import { sessionHistory, forget } from "../lib/sessionHistory.svelte";

  const session = getCcSession();
  const { status, init } = session.atoms;

  let resumeOpen = $state(false);
  let resumeBtnEl: HTMLElement | null = $state(null);

  // Records other than the active one. CC's --resume picker excludes
  // the current session for the same reason (resuming yourself = no-op).
  const others = $derived(
    sessionHistory.records.filter((r) => r.id !== $init.sessionId),
  );

  async function newSession() {
    resumeOpen = false;
    await session.newSession();
  }

  async function resume(id: string) {
    resumeOpen = false;
    await session.resumeSession(id);
  }

  function copySession() {
    if (!$init.sessionId) return;
    void navigator.clipboard?.writeText($init.sessionId).catch(() => {});
  }

  function fmtAge(ms: number): string {
    const d = Date.now() - ms;
    if (d < 60_000) return "just now";
    if (d < 3_600_000) return `${Math.floor(d / 60_000)}m`;
    if (d < 86_400_000) return `${Math.floor(d / 3_600_000)}h`;
    return `${Math.floor(d / 86_400_000)}d`;
  }

  // Click-outside handler for the resume dropdown.
  function onDocClick(e: MouseEvent) {
    if (!resumeOpen) return;
    if (resumeBtnEl?.contains(e.target as Node)) return;
    resumeOpen = false;
  }
  $effect(() => {
    if (!resumeOpen) return;
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  });
</script>

<header>
  <span class="dot" data-status={$status}></span>
  <span class="name">cc-ws</span>

  <span class="sep">·</span>

  {#if $init.sessionId}
    <button class="chip session" onclick={copySession} title="click to copy · {$init.sessionId}">
      <span class="dim">session</span>
      <span class="mono">{$init.sessionId.slice(0, 8)}</span>
    </button>
  {:else}
    <span class="chip empty">
      <span class="dim">session</span>
      <span class="mono">—</span>
    </span>
  {/if}

  <button class="action" onclick={newSession} title="start a fresh session">+ new</button>

  <div class="resume-wrap" bind:this={resumeBtnEl}>
    <button
      class="action"
      onclick={() => (resumeOpen = !resumeOpen)}
      disabled={others.length === 0}
      title={others.length === 0 ? "no other sessions seen yet" : "resume a previous session"}
    >
      resume <span class="caret">▾</span>
    </button>
    {#if resumeOpen && others.length > 0}
      <div class="dropdown" role="listbox">
        {#each others as r (r.id)}
          <div class="row">
            <button class="row-main" onclick={() => resume(r.id)} title={r.id}>
              <span class="mono">{r.id.slice(0, 8)}</span>
              <span class="dim">{fmtAge(r.lastSeen)}</span>
            </button>
            <button class="row-x" onclick={() => forget(r.id)} title="forget" aria-label="forget">×</button>
          </div>
        {/each}
      </div>
    {/if}
  </div>

  <span class="cwd dim">{shortenPath($init.cwd)}</span>
</header>

<style>
  header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 18px;
    border-bottom: 1px solid var(--border);
    font-size: 12px;
    flex-shrink: 0;
    position: relative;
    z-index: 5;
  }
  .dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--fg-3);
    flex-shrink: 0;
  }
  .dot[data-status="open"] { background: var(--ok); }
  .dot[data-status="connecting"] { background: var(--warn); }
  .dot[data-status="closed"] { background: var(--error); }
  .name {
    color: var(--accent);
    font-weight: 600;
  }
  .sep { color: var(--fg-3); }
  .dim { color: var(--fg-3); }

  .chip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 2px 8px;
    border-radius: 3px;
    border: 1px solid var(--border-1);
    font-size: 11.5px;
    color: var(--fg-1);
  }
  .chip.session:hover { border-color: var(--fg-2); background: var(--bg-2); color: var(--fg); }
  .chip.empty { color: var(--fg-3); border-color: var(--border); }
  .chip .mono { color: var(--fg); }
  .chip.empty .mono { color: var(--fg-3); }

  .action {
    padding: 2px 10px;
    border: 1px solid var(--border-1);
    border-radius: 3px;
    font-size: 11.5px;
    color: var(--fg-1);
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }
  .action:hover:not(:disabled) {
    background: var(--bg-2);
    color: var(--fg);
    border-color: var(--fg-2);
  }
  .action:disabled { opacity: 0.4; cursor: not-allowed; }
  .caret { color: var(--fg-3); font-size: 10px; }

  .resume-wrap {
    position: relative;
  }
  .dropdown {
    position: absolute;
    top: calc(100% + 6px);
    left: 0;
    min-width: 200px;
    background: var(--bg-1);
    border: 1px solid var(--border-1);
    border-radius: 4px;
    padding: 4px;
    box-shadow: 0 12px 32px rgba(0, 0, 0, 0.5);
    z-index: 30;
    max-height: 320px;
    overflow-y: auto;
  }
  .row {
    display: flex;
    align-items: center;
  }
  .row-main {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 5px 8px;
    flex: 1;
    text-align: left;
    border-radius: 3px;
    color: var(--fg-1);
    font-size: 12px;
  }
  .row-main:hover { background: var(--accent-soft); color: var(--fg); }
  .row-main .mono { color: var(--fg); }
  .row-x {
    width: 22px;
    height: 22px;
    color: var(--fg-3);
    border-radius: 3px;
    font-size: 12px;
  }
  .row-x:hover { color: var(--error); background: var(--bg-2); }

  .mono {
    font-size: 11.5px;
  }
  .cwd {
    flex: 1;
    text-align: right;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    min-width: 0;
    color: var(--fg-2);
    font-size: 11.5px;
  }
</style>
