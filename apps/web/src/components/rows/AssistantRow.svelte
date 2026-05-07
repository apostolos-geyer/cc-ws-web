<script lang="ts">
  import type { AssistantContentBlock, StreamingBlock } from "@somewhatintelligent/cc-ws-svelte";
  import ToolUseCard from "./ToolUseCard.svelte";
  import ThinkingBlock from "./ThinkingBlock.svelte";

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
</script>

<div class="row" class:streaming>
  <span class="gutter">●</span>
  <div class="body">
    {#each content as block, i (i)}
      {#if block.type === "text"}
        <div class="text">{block.text}{#if streaming && i === content.length - 1}<span class="caret">▍</span>{/if}</div>
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
  .text {
    white-space: pre-wrap;
    word-break: break-word;
    color: var(--fg);
  }
  .caret {
    color: var(--accent);
    animation: blink 1s steps(2, end) infinite;
    margin-left: 1px;
  }
  @keyframes blink {
    0%, 100% { opacity: 1; }
    50% { opacity: 0; }
  }
</style>
