<script lang="ts">
  import { getCcSession } from "@somewhatintelligent/cc-ws-svelte";
  import { onMount, tick } from "svelte";
  import Suggestions, { type Item } from "./Suggestions.svelte";

  const session = getCcSession();
  const { activeEffort, shellEntries, init } = session.atoms;

  let textarea: HTMLTextAreaElement | null = $state(null);
  let value = $state("");
  // Shell vs chat is sticky state, not derived from `value`. Pressing `!`
  // on an empty input enters shell mode without writing the `!` itself
  // (the leading char is the mode signal, not part of the command).
  // Backspace on an empty shell-mode input exits back to chat mode.
  let isShell = $state(false);

  onMount(() => textarea?.focus());

  // ---------- shell pending hint above input ----------
  const pending = $derived($shellEntries.filter((e) => e.pending));

  // ---------- autocomplete trigger detection ----------
  type Mode =
    | { kind: "none" }
    | { kind: "slash"; query: string; replaceFrom: number; replaceTo: number }
    | { kind: "mention"; query: string; replaceFrom: number; replaceTo: number };

  let cursor = $state(0);
  function detect(text: string, pos: number): Mode {
    // Slash: only when slash is at the very start of the input and the
    // cursor is still inside that token (no whitespace yet).
    if (text.startsWith("/")) {
      const tokenEnd = (() => {
        const m = text.match(/^\/[^\s]*/);
        return m ? m[0].length : 1;
      })();
      if (pos <= tokenEnd) {
        return {
          kind: "slash",
          query: text.slice(1, tokenEnd),
          replaceFrom: 0,
          replaceTo: tokenEnd,
        };
      }
    }
    // Mention: walk back from cursor until we hit '@' or whitespace.
    for (let i = pos - 1; i >= 0; i--) {
      const ch = text[i]!;
      if (ch === "@") {
        // Only trigger if @ is at start or preceded by whitespace.
        if (i === 0 || /\s/.test(text[i - 1]!)) {
          return {
            kind: "mention",
            query: text.slice(i + 1, pos),
            replaceFrom: i,
            replaceTo: pos,
          };
        }
        break;
      }
      if (/\s/.test(ch)) break;
    }
    return { kind: "none" };
  }

  const mode = $derived(detect(value, cursor));

  // Slash items from init.slashCommands.
  const slashItems = $derived.by<Item[]>(() => {
    if (mode.kind !== "slash") return [];
    const q = mode.query.toLowerCase();
    return $init.slashCommands
      .filter((s) => s.toLowerCase().startsWith(q))
      .slice(0, 12)
      .map((s) => ({ id: s, label: "/" + s }));
  });

  // Mention items via fetchFileSuggestions (debounced).
  let mentionItems = $state<Item[]>([]);
  let mentionToken = 0;
  $effect(() => {
    const m = mode;
    if (m.kind !== "mention") {
      mentionItems = [];
      return;
    }
    const myToken = ++mentionToken;
    const t = setTimeout(async () => {
      try {
        const res = await session.fetchFileSuggestions(m.query);
        if (myToken !== mentionToken) return;
        mentionItems = res.slice(0, 14).map((r) => ({
          id: r.path,
          label: r.path,
        }));
      } catch {
        if (myToken === mentionToken) mentionItems = [];
      }
    }, 80);
    return () => clearTimeout(t);
  });

  const items = $derived(
    mode.kind === "slash" ? slashItems
    : mode.kind === "mention" ? mentionItems
    : []
  );
  const popupVisible = $derived(items.length > 0 && (mode.kind === "slash" || mode.kind === "mention"));
  let active = $state(0);

  // Reset highlight when the trigger token changes.
  $effect(() => {
    void mode.kind;
    if (mode.kind !== "none") void mode.query;
    active = 0;
  });

  function applySelection(item: Item) {
    if (!textarea) return;
    if (mode.kind === "slash") {
      const insert = "/" + item.id + " ";
      value = insert + value.slice(mode.replaceTo);
      tick().then(() => {
        textarea?.focus();
        const pos = insert.length;
        textarea?.setSelectionRange(pos, pos);
      });
      return;
    }
    if (mode.kind === "mention") {
      const before = value.slice(0, mode.replaceFrom);
      const after = value.slice(mode.replaceTo);
      const insert = "@" + item.id + " ";
      value = before + insert + after;
      tick().then(() => {
        textarea?.focus();
        const pos = before.length + insert.length;
        textarea?.setSelectionRange(pos, pos);
      });
      return;
    }
  }

  // ---------- autosize ----------
  function autosize() {
    if (!textarea) return;
    textarea.style.height = "0";
    textarea.style.height = Math.min(textarea.scrollHeight, 240) + "px";
  }
  $effect(() => {
    void value;
    void tick().then(autosize);
  });

  // ---------- send ----------
  function send() {
    const text = value.trim();
    if (!text) return;
    if (isShell) {
      session.sendShellContext(text);
    } else {
      session.sendMessage(text);
    }
    value = "";
    isShell = false;
  }

  function onKey(e: KeyboardEvent) {
    // Mode toggles. `!` on an empty input enters shell mode without
    // typing the bang itself; backspace on an empty shell-mode input
    // exits back to chat mode.
    if (e.key === "!" && !isShell && value === "" && !e.metaKey && !e.ctrlKey && !e.altKey) {
      e.preventDefault();
      isShell = true;
      return;
    }
    if (e.key === "Backspace" && isShell && value === "") {
      e.preventDefault();
      isShell = false;
      return;
    }

    // Autocomplete navigation has priority when popup is open.
    if (popupVisible) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        active = Math.min(items.length - 1, active + 1);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        active = Math.max(0, active - 1);
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        const item = items[active];
        if (item) applySelection(item);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        cursor = -1;
        return;
      }
    }
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      send();
    }
  }

  function syncCursor(e: Event) {
    const t = e.currentTarget as HTMLTextAreaElement;
    cursor = t.selectionStart;
  }
</script>

<div class="composer" class:shell={isShell}>
  {#if pending.length > 0}
    <div class="shell-pending">
      <span class="dimmer">queued</span>
      {#each pending as p (p.id)}
        <span class="cmd">!{p.command}</span>
      {/each}
      <span class="dimmer">— drains on next send</span>
    </div>
  {/if}

  <div class="input-row">
    <span class="glyph">{isShell ? "$" : "▷"}</span>
    <div class="ta-wrap">
      <Suggestions {items} bind:active onselect={applySelection} visible={popupVisible} />
      <textarea
        bind:this={textarea}
        bind:value
        data-composer
        rows="1"
        placeholder={isShell ? "shell command — runs on the bridge" : "message claude · / for commands · @ for files · ! for shell"}
        onkeydown={onKey}
        onkeyup={syncCursor}
        onclick={syncCursor}
        oninput={syncCursor}
      ></textarea>
    </div>
    <span class="hint">
      <span class="kbd">↵</span> {isShell ? "run" : "send"}
    </span>
  </div>

  <div class="affordance-row">
    {#if isShell}
      <span class="aff shell-aff">
        <span class="dimmer">shell mode</span>
        <span class="dimmer">·</span>
        <span class="dimmer">esc/backspace to exit</span>
      </span>
    {:else}
      <span class="aff">
        <span class="dimmer">⊙</span>
        <span class="accent">{$activeEffort || "default"}</span>
        <span class="dimmer">/effort</span>
      </span>
    {/if}
  </div>
</div>

<style>
  .composer {
    border-top: 1px solid var(--border);
    padding: 10px 18px 6px;
    flex-shrink: 0;
    background: var(--bg);
    transition: border-color 120ms ease;
  }
  .composer.shell {
    border-top-color: var(--ok);
    background: rgba(109, 212, 148, 0.04);
  }
  .shell-pending {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    padding: 4px 4px 8px;
    font-size: 11.5px;
    color: var(--fg-2);
  }
  .shell-pending .cmd {
    color: var(--accent);
    background: var(--accent-soft);
    padding: 0 6px;
    border-radius: 3px;
  }
  .input-row {
    display: flex;
    align-items: flex-start;
    gap: 10px;
  }
  .ta-wrap {
    flex: 1;
    position: relative;
    min-width: 0;
  }
  .glyph {
    color: var(--accent);
    padding-top: 2px;
    user-select: none;
    transition: color 120ms ease;
  }
  .composer.shell .glyph { color: var(--ok); }
  textarea {
    width: 100%;
    line-height: 1.55;
    padding: 2px 0;
    min-height: 22px;
    max-height: 240px;
    overflow-y: auto;
    color: var(--fg);
  }
  .composer.shell textarea { color: var(--ok); }
  .hint {
    color: var(--fg-3);
    font-size: 11px;
    padding-top: 4px;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    gap: 4px;
  }
  .affordance-row {
    display: flex;
    justify-content: flex-end;
    padding: 2px 0 0;
    min-height: 16px;
  }
  .aff {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 11.5px;
  }
  .shell-aff { color: var(--ok); }
  .dimmer { color: var(--fg-3); }
  .accent { color: var(--accent); }
</style>
