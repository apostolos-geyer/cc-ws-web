<script lang="ts">
  import { getCcSession, getFrameUsage, sumContextTokens } from "@cc-ws/svelte";
  import { togglePanel, openPanel } from "../lib/ui.svelte";
  import { formatCtx } from "../lib/format";
  import { modeColor, modeGlyph, modeShort } from "../lib/modes";

  const session = getCcSession();
  const {
    status,
    activeModel,
    activeEffort,
    activeMode,
    tasks,
    pendingPermissions,
    hookEvents,
    init,
    messages,
  } = session.atoms;

  const runningTasks = $derived($tasks.filter((t) => t.status === "running").length);
  const pendingPerms = $derived($pendingPermissions.length);
  const hookCount = $derived($hookEvents.length);

  // Most-recent-frame's context-window load. CC TUI shows ctx% as a
  // window-load indicator, not lifetime tokens.
  const ctx = $derived.by(() => {
    const arr = $messages;
    for (let i = arr.length - 1; i >= 0; i--) {
      const e = arr[i];
      if (e.kind !== "frame") continue;
      const usage = getFrameUsage(e.frame);
      const sum = sumContextTokens(usage);
      if (sum != null) return sum;
    }
    return null;
  });

  function shortModel(m: string): string {
    return m.replace(/^claude-/, "").replace(/\[1m\]$/, "·1m");
  }
</script>

<footer>
  <div class="left">
    <span class="status-dot" data-status={$status}></span>
    <span class="dim">{$status}</span>
    <span class="sep">·</span>
    <button class="seg" onclick={() => openPanel("settings")} title="model · click to change">
      <span>{shortModel($activeModel) || "—"}</span>
    </button>
    <span class="sep">·</span>
    <button class="seg" onclick={() => openPanel("settings")} title="effort · click to change">
      <span>{$activeEffort || "default"}</span>
    </button>
    <span class="sep">·</span>
    <button
      class="seg mode"
      onclick={() => openPanel("settings")}
      title="permission mode · ⇧⇥ to cycle"
      style:color={modeColor($activeMode)}
    >
      <span>{modeGlyph($activeMode)} {modeShort($activeMode)}</span>
    </button>
    {#if ctx != null}
      <span class="sep">·</span>
      <span class="dim" title="context window load (input + cache_read + cache_creation + output)">
        {formatCtx(ctx)} ctx
      </span>
    {/if}
    {#if $init.sessionId}
      <span class="sep">·</span>
      <span class="dimmer" title={$init.sessionId}>{$init.sessionId.slice(0, 8)}</span>
    {/if}
  </div>
  <div class="right">
    {#if pendingPerms > 0}
      <button class="badge perm" onclick={() => togglePanel("permissions")} title="⌘P">
        <span class="glyph">?</span>
        <span>{pendingPerms} perm</span>
      </button>
    {/if}
    {#if runningTasks > 0}
      <button class="badge task" onclick={() => togglePanel("tasks")} title="⌘T">
        <span class="glyph">●</span>
        <span>{runningTasks} task{runningTasks === 1 ? "" : "s"}</span>
      </button>
    {/if}
    {#if hookCount > 0}
      <button class="badge hook" onclick={() => togglePanel("hooks")} title="⌘H">
        <span class="glyph">~</span>
        <span>{hookCount}</span>
      </button>
    {/if}
    <button class="badge help" onclick={() => togglePanel("help")} title="⌘/">
      <span>?</span>
    </button>
  </div>
</footer>

<style>
  footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 5px 18px;
    border-top: 1px solid var(--border);
    font-size: 11px;
    color: var(--fg-2);
    flex-shrink: 0;
    gap: 12px;
  }
  .left, .right {
    display: flex;
    align-items: center;
    gap: 6px;
    overflow: hidden;
    min-width: 0;
  }
  .left { flex-shrink: 1; }
  .right { gap: 4px; flex-shrink: 0; }
  .sep { color: var(--fg-3); }
  .dim { color: var(--fg-2); }
  .dimmer { color: var(--fg-3); }
  .seg {
    color: var(--fg-1);
    padding: 1px 4px;
    border-radius: 2px;
  }
  .seg:hover { background: var(--bg-2); color: var(--fg); }
  .seg.mode { font-weight: 600; }
  .seg.mode:hover { background: var(--bg-2); }
  .status-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--fg-3);
  }
  .status-dot[data-status="open"] { background: var(--ok); }
  .status-dot[data-status="connecting"] { background: var(--warn); }
  .status-dot[data-status="closed"] { background: var(--error); }
  .badge {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 2px 8px;
    border-radius: 3px;
    border: 1px solid var(--border-1);
    color: var(--fg-1);
    font-size: 11px;
  }
  .badge:hover { border-color: var(--fg-2); color: var(--fg); }
  .badge .glyph { font-size: 10px; }
  .badge.perm { color: var(--accent); border-color: var(--accent-line); }
  .badge.perm:hover { background: var(--accent-soft); }
  .badge.task { color: var(--info); }
  .badge.hook { color: var(--fg-2); }
  .badge.help { padding: 2px 6px; }
</style>
