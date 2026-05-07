<script lang="ts">
  const rows: Array<[string, string]> = [
    ["⌘ ↵", "send message"],
    ["⇧ ↵", "newline in composer"],
    ["⌘ K", "focus composer"],
    ["⌘ I", "interrupt current turn"],
    ["⌘ T", "toggle tasks panel"],
    ["⌘ P", "toggle permissions panel"],
    ["⌘ H", "toggle hooks panel"],
    ["⌘ ,", "toggle settings panel"],
    ["⌘ /", "this help"],
    ["⇧ ⇥", "cycle permission mode (TUI parity)"],
    ["esc", "close panel / blur input"],
    ["!cmd", "send shell exchange (drains on next message)"],
  ];
</script>

<div class="help">
  {#each rows as [k, label] (k)}
    <div class="row">
      <span class="kbd">{k}</span>
      <span class="label">{label}</span>
    </div>
  {/each}
</div>

<style>
  .help {
    padding: 8px 14px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .row {
    display: flex;
    align-items: center;
    gap: 12px;
    font-size: 12px;
    color: var(--fg-1);
    padding: 3px 0;
  }
  .kbd {
    width: 78px;
    flex-shrink: 0;
    color: var(--fg);
    font-size: 11.5px;
    border: 1px solid var(--border-1);
    border-radius: 3px;
    padding: 1px 6px;
    text-align: center;
    background: var(--bg);
  }
  .label { color: var(--fg-1); }
</style>
