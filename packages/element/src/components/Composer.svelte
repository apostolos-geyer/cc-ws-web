<script lang="ts">
  import { getCcSession } from "@somewhatintelligent/cc-ws-svelte";
  import { onMount } from "svelte";
  import { EditorView, keymap, placeholder } from "@codemirror/view";
  import { EditorState, Compartment, Prec } from "@codemirror/state";
  import { history, historyKeymap, defaultKeymap, insertNewlineAndIndent } from "@codemirror/commands";
  import { vim, getCM } from "@replit/codemirror-vim";
  import Suggestions, { type Item } from "./Suggestions.svelte";

  const session = getCcSession();
  const { activeEffort, shellEntries, init } = session.atoms;

  // ---------- composer state ----------
  let editorEl: HTMLDivElement | null = $state(null);
  let view: EditorView | null = null;
  // vim wrapper — re-acquired on extension toggle so the mode-change event
  // observer survives a vim-off → vim-on round-trip
  let cmWrapper: ReturnType<typeof getCM> | null = null;
  let value = $state("");
  let cursor = $state(0);
  let isShell = $state(false);

  // ---------- vim toggle (persisted) ----------
  const VIM_KEY = "@somewhatintelligent/cc-ws-web/composer-vim";
  let vimEnabled = $state<boolean>(loadVim());
  let vimMode = $state<"insert" | "normal" | "visual" | "replace">("insert");

  function loadVim(): boolean {
    try { return localStorage.getItem(VIM_KEY) === "1"; } catch { return false; }
  }
  function saveVim(on: boolean) {
    try { localStorage.setItem(VIM_KEY, on ? "1" : "0"); } catch {}
  }

  // ---------- shell pending hint above input ----------
  const pending = $derived($shellEntries.filter((e) => e.pending));

  // ---------- autocomplete trigger detection ----------
  type Mode =
    | { kind: "none" }
    | { kind: "slash"; query: string; replaceFrom: number; replaceTo: number }
    | { kind: "mention"; query: string; replaceFrom: number; replaceTo: number };

  function detect(text: string, pos: number): Mode {
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
    for (let i = pos - 1; i >= 0; i--) {
      const ch = text[i]!;
      if (ch === "@") {
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

  const slashItems = $derived.by<Item[]>(() => {
    if (mode.kind !== "slash") return [];
    const q = mode.query.toLowerCase();
    return $init.slashCommands
      .filter((s) => s.toLowerCase().startsWith(q))
      .slice(0, 12)
      .map((s) => ({ id: s, label: "/" + s }));
  });

  let mentionItems = $state<Item[]>([]);
  let mentionToken = 0;
  $effect(() => {
    if (mode.kind !== "mention") {
      if (mentionItems.length > 0) mentionItems = [];
      return;
    }
    const query = mode.query;
    const myToken = ++mentionToken;
    const t = setTimeout(async () => {
      try {
        const res = await session.fetchFileSuggestions(query);
        if (myToken !== mentionToken) return;
        mentionItems = res.slice(0, 14).map((r) => ({ id: r.path, label: r.path }));
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
    if (!view) return;
    if (mode.kind === "slash") {
      const insert = "/" + item.id + " ";
      view.dispatch({
        changes: { from: 0, to: mode.replaceTo, insert },
        selection: { anchor: insert.length },
      });
      view.focus();
      return;
    }
    if (mode.kind === "mention") {
      const insert = "@" + item.id + " ";
      const start = mode.replaceFrom;
      view.dispatch({
        changes: { from: start, to: mode.replaceTo, insert },
        selection: { anchor: start + insert.length },
      });
      view.focus();
      return;
    }
  }

  // ---------- send ----------
  function send() {
    const text = value.trim();
    if (!text) return;
    if (isShell) {
      session.sendShellContext(text);
    } else {
      session.sendMessage(text);
    }
    setDoc("");
    isShell = false;
  }

  function setDoc(next: string) {
    value = next;
    if (view) {
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: next },
        selection: { anchor: next.length },
      });
    }
  }

  // ---------- CodeMirror wiring ----------
  const vimCompartment = new Compartment();
  const placeholderCompartment = new Compartment();

  const placeholderText = () =>
    isShell
      ? "shell command — runs on the bridge"
      : "message claude · / for commands · @ for files · ! for shell";

  // Placeholder needs to react to isShell. Reconfigure the compartment
  // when the shell flag flips.
  $effect(() => {
    void isShell;
    if (!view) return;
    view.dispatch({
      effects: placeholderCompartment.reconfigure(placeholder(placeholderText())),
    });
  });

  // Vim toggle: reconfigure compartment in/out, and re-bind the mode-change
  // observer when we add the extension back.
  $effect(() => {
    const enabled = vimEnabled;
    saveVim(enabled);
    if (!view) return;
    view.dispatch({
      effects: vimCompartment.reconfigure(enabled ? vim() : []),
    });
    if (enabled) {
      bindVimModeObserver();
    } else {
      cmWrapper = null;
      vimMode = "insert";
    }
  });

  function bindVimModeObserver() {
    if (!view) return;
    cmWrapper = getCM(view);
    if (!cmWrapper) return;
    // Plugin starts in normal mode when vim is enabled
    vimMode = "normal";
    cmWrapper.on("vim-mode-change", (e: { mode: string }) => {
      if (e.mode === "insert" || e.mode === "normal" || e.mode === "visual" || e.mode === "replace") {
        vimMode = e.mode;
      }
    });
  }

  // Custom keymap takes priority over vim/default. Closures capture the
  // current reactive snapshots at call time, so popup visibility / vim
  // mode are always live.
  const customKeymap = keymap.of([
    {
      key: "Enter",
      run: (v) => {
        if (popupVisible) {
          const item = items[active];
          if (item) applySelection(item);
          return true;
        }
        // In vim normal/visual, Enter is "next line" — let vim handle it.
        if (vimEnabled && vimMode !== "insert") return false;
        send();
        return true;
      },
    },
    { key: "Shift-Enter", run: insertNewlineAndIndent },
    {
      key: "Tab",
      run: () => {
        if (!popupVisible) return false;
        const item = items[active];
        if (item) applySelection(item);
        return true;
      },
    },
    {
      key: "ArrowDown",
      run: () => {
        if (!popupVisible) return false;
        active = Math.min(items.length - 1, active + 1);
        return true;
      },
    },
    {
      key: "ArrowUp",
      run: () => {
        if (!popupVisible) return false;
        active = Math.max(0, active - 1);
        return true;
      },
    },
    {
      key: "Escape",
      run: () => {
        if (!popupVisible) return false;
        // Steer detect() into kind:"none" by parking cursor outside any
        // active token — flips the popup off without nuking input.
        cursor = -1;
        return true;
      },
    },
    {
      key: "!",
      run: (v) => {
        if (isShell) return false;
        const sel = v.state.selection.main;
        if (sel.head !== 0 || sel.anchor !== 0) return false;
        isShell = true;
        return true; // swallow the bang — it's the mode signal, not content
      },
    },
    {
      key: "Backspace",
      run: (v) => {
        if (!isShell || v.state.doc.length !== 0) return false;
        isShell = false;
        return true;
      },
    },
  ]);

  onMount(() => {
    if (!editorEl) return;
    const startState = EditorState.create({
      doc: value,
      extensions: [
        Prec.highest(customKeymap),
        vimCompartment.of(vimEnabled ? vim() : []),
        history(),
        EditorView.lineWrapping,
        placeholderCompartment.of(placeholder(placeholderText())),
        EditorView.updateListener.of((u) => {
          if (u.docChanged) {
            value = u.state.doc.toString();
            cursor = u.state.selection.main.head;
          } else if (u.selectionSet) {
            cursor = u.state.selection.main.head;
          }
        }),
        keymap.of(historyKeymap),
        keymap.of(defaultKeymap),
      ],
    });
    // CM6 reads/writes selection through `document` by default — inside a
    // shadow root that's the wrong document, so clicks don't park the
    // caret (typing still works because keydown lands on the contenteditable).
    // Telling CM the actual root fixes click-to-focus.
    const root = editorEl.getRootNode() as Document | ShadowRoot;
    view = new EditorView({ state: startState, parent: editorEl, root });
    if (vimEnabled) bindVimModeObserver();
    view.focus();

    // ⌘K (and any other "focus the composer" caller) routes through this
    // event so we don't have to rely on querying for a [data-composer]
    // node — CM's contenteditable doesn't accept .focus() on the wrapper.
    const focusHandler = () => view?.focus();
    document.addEventListener("ccws:composer-focus", focusHandler);

    return () => {
      document.removeEventListener("ccws:composer-focus", focusHandler);
      view?.destroy();
      view = null;
      cmWrapper = null;
    };
  });

  function toggleVim() {
    vimEnabled = !vimEnabled;
    view?.focus();
  }

  // Single-letter glyph for the current vim mode in the affordance row.
  const vimGlyph = $derived(
    vimMode === "normal" ? "N"
    : vimMode === "insert" ? "I"
    : vimMode === "visual" ? "V"
    : vimMode === "replace" ? "R"
    : "I",
  );
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
      <div class="cm-host" data-composer bind:this={editorEl}></div>
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
    <button
      class="vim-toggle"
      class:on={vimEnabled}
      onclick={toggleVim}
      title={vimEnabled ? "disable vim mode" : "enable vim mode"}
    >
      {#if vimEnabled}
        <span class="vim-label">vim</span><span class="vim-mode">{vimGlyph}</span>
      {:else}
        <span class="vim-label dimmer">vim</span>
      {/if}
    </button>
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

  /* CodeMirror reset — host page doesn't import a CM theme, so we do
     just enough to make the editor look like the prior <textarea>. */
  .cm-host { width: 100%; }
  .cm-host :global(.cm-editor) {
    background: transparent;
    color: var(--fg);
    font: inherit;
    line-height: 1.55;
    max-height: 240px;
    outline: none;
  }
  .cm-host :global(.cm-editor.cm-focused) { outline: none; }
  .cm-host :global(.cm-scroller) {
    font-family: inherit;
    font-size: inherit;
    line-height: inherit;
    overflow-y: auto;
  }
  .cm-host :global(.cm-content) {
    padding: 2px 0;
    caret-color: var(--accent);
    min-height: 22px;
  }
  .cm-host :global(.cm-line) { padding: 0; }
  .cm-host :global(.cm-placeholder) { color: var(--fg-3); }
  .cm-host :global(.cm-cursor) { border-left-color: var(--accent); }
  /* vim block cursor in normal/visual mode */
  .cm-host :global(.cm-fat-cursor) {
    background: var(--accent);
    color: var(--bg);
    outline: none;
  }
  .composer.shell .cm-host :global(.cm-content) { color: var(--ok); }
  .composer.shell .cm-host :global(.cm-cursor) { border-left-color: var(--ok); }
  .composer.shell .cm-host :global(.cm-fat-cursor) { background: var(--ok); }

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
    justify-content: space-between;
    align-items: center;
    padding: 2px 0 0;
    min-height: 16px;
    gap: 12px;
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

  .vim-toggle {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 1px 7px;
    border: 1px solid var(--border-1);
    border-radius: 3px;
    font-size: 11px;
    color: var(--fg-2);
    background: transparent;
  }
  .vim-toggle:hover { border-color: var(--fg-2); color: var(--fg); }
  .vim-toggle.on {
    border-color: var(--accent);
    color: var(--accent);
  }
  .vim-toggle .vim-mode {
    font-weight: 600;
    color: var(--accent);
    min-width: 9px;
    text-align: center;
  }
  .vim-toggle.on .vim-label { color: var(--accent); }
</style>
