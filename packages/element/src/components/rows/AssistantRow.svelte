<script lang="ts">
  import type { AssistantContentBlock, StreamingBlock } from "@somewhatintelligent/cc-ws-svelte";
  import ToolUseCard from "./ToolUseCard.svelte";
  import ThinkingBlock from "./ThinkingBlock.svelte";
  import { renderMarkdown } from "../../lib/markdown";

  // Live streaming uses StreamingBlock (tool_use carries partialJson / parsed
  // for in-flight rendering); finalised assistant frames use
  // AssistantContentBlock (no streaming fields). Accept either.
  let { content = [], streaming = false }: {
    content: AssistantContentBlock[] | StreamingBlock[];
    streaming?: boolean;
  } = $props();

  function isParsed(block: AssistantContentBlock | StreamingBlock): boolean {
    if (block.type !== "tool_use") return true;
    return "parsed" in block ? block.parsed : true;
  }
  function partialJson(block: AssistantContentBlock | StreamingBlock): string {
    if (block.type !== "tool_use") return "";
    return "partialJson" in block ? block.partialJson : "";
  }

  // Streaming caret: append a span to the deepest trailing leaf of the
  // rendered markdown so it sits inline next to the last word, not on
  // its own line. Cheaper to maintain than enumerating every block-level
  // element marked might emit as the last child.
  function attachCaret(node: HTMLElement, args: { text: string; active: boolean }) {
    const update = ({ text, active }: { text: string; active: boolean }) => {
      node.innerHTML = renderMarkdown(text);
      if (!active) return;
      let leaf: Element = node;
      while (leaf.lastElementChild) leaf = leaf.lastElementChild;
      const caret = document.createElement("span");
      caret.className = "ccws-caret";
      caret.textContent = "▍";
      leaf.appendChild(caret);
    };
    update(args);
    return { update };
  }
</script>

<div class="row" class:streaming>
  <span class="gutter">●</span>
  <div class="body">
    {#each content as block, i (i)}
      {#if block.type === "text"}
        <div
          class="md"
          use:attachCaret={{ text: block.text, active: streaming && i === content.length - 1 }}
        ></div>
      {:else if block.type === "thinking"}
        <ThinkingBlock text={block.thinking} {streaming} />
      {:else if block.type === "tool_use"}
        <ToolUseCard
          name={block.name}
          input={block.input}
          partialJson={partialJson(block)}
          parsed={isParsed(block)}
          {streaming}
        />
      {/if}
    {/each}
  </div>
</div>

<style>
  .row {
    display: flex;
    gap: 10px;
    align-items: flex-start;
  }
  .gutter {
    color: var(--accent);
    flex-shrink: 0;
    user-select: none;
    padding-top: 1px;
  }
  .body {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  /* ----- markdown prose ----- */
  .md {
    color: var(--fg);
    word-break: break-word;
  }
  /* Marked emits a <p> per paragraph; we want chat-style tight rhythm,
     not document-style spacing — kill outer margins, use a small gap
     between block siblings. */
  .md :global(> *:first-child) { margin-top: 0; }
  .md :global(> *:last-child) { margin-bottom: 0; }
  .md :global(p) { margin: 0 0 8px; line-height: 1.55; }
  .md :global(p:last-child) { margin-bottom: 0; }
  .md :global(h1),
  .md :global(h2),
  .md :global(h3),
  .md :global(h4),
  .md :global(h5),
  .md :global(h6) {
    margin: 14px 0 6px;
    line-height: 1.3;
    color: var(--fg);
    font-weight: 600;
  }
  .md :global(h1) { font-size: 1.4em; }
  .md :global(h2) { font-size: 1.25em; }
  .md :global(h3) { font-size: 1.12em; }
  .md :global(h4),
  .md :global(h5),
  .md :global(h6) { font-size: 1em; color: var(--fg-1); }

  .md :global(ul),
  .md :global(ol) {
    margin: 0 0 8px;
    padding-left: 22px;
  }
  .md :global(li) { margin: 2px 0; }
  .md :global(li > p) { margin: 0; }
  .md :global(li > ul),
  .md :global(li > ol) { margin: 2px 0; }

  .md :global(blockquote) {
    margin: 0 0 8px;
    padding: 2px 10px;
    border-left: 2px solid var(--accent-line);
    color: var(--fg-1);
  }

  .md :global(hr) {
    border: 0;
    border-top: 1px solid var(--border-1);
    margin: 12px 0;
  }

  .md :global(a) {
    color: var(--accent);
    text-decoration: none;
    border-bottom: 1px dotted var(--accent-line);
  }
  .md :global(a:hover) { border-bottom-style: solid; }

  .md :global(strong) { color: var(--fg); font-weight: 600; }
  .md :global(em) { color: var(--fg); font-style: italic; }
  .md :global(del) { color: var(--fg-2); }

  .md :global(code) {
    font-family: var(--font-mono);
    font-size: 0.92em;
    padding: 1px 5px;
    border-radius: 3px;
    background: var(--bg-2);
    color: var(--fg);
  }
  .md :global(pre) {
    margin: 0 0 8px;
    padding: 10px 12px;
    background: var(--bg-1);
    border: 1px solid var(--border);
    border-radius: 4px;
    overflow-x: auto;
    line-height: 1.5;
  }
  .md :global(pre code) {
    padding: 0;
    background: transparent;
    border-radius: 0;
    font-size: 0.92em;
    color: var(--fg);
  }
  /* Shiki sets `style="background-color:#..."` inline for its theme bg
     and `tabindex="0"`; we keep token foregrounds (the whole point) but
     re-skin the box to our --bg-1 so it sits in our palette instead of
     looking like a transplant from a different editor. */
  .md :global(pre.shiki) {
    background: var(--bg-1) !important;
    outline: none;
  }
  .md :global(pre.shiki code) {
    color: inherit;
  }
  .md :global(pre.shiki .line) { display: block; }

  .md :global(table) {
    border-collapse: collapse;
    margin: 0 0 8px;
    font-size: 0.95em;
  }
  .md :global(th),
  .md :global(td) {
    border: 1px solid var(--border-1);
    padding: 4px 8px;
    text-align: left;
  }
  .md :global(th) { background: var(--bg-1); color: var(--fg); font-weight: 600; }

  .md :global(img) {
    max-width: 100%;
    border-radius: 4px;
  }

  /* Streaming caret. attachCaret() appends a .ccws-caret span to the
     deepest trailing leaf of the rendered markdown so it sits inline
     next to the last word regardless of the leaf's tag. */
  .md :global(.ccws-caret) {
    color: var(--accent);
    margin-left: 2px;
    animation: blink 1s steps(2, end) infinite;
  }
  @keyframes blink {
    0%, 100% { opacity: 1; }
    50% { opacity: 0; }
  }
</style>
