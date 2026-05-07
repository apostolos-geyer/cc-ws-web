<script lang="ts">
  import type { AssistantContentBlock, StreamingBlock } from "@cc-ws/svelte";
  import ToolUseCard from "./ToolUseCard.svelte";
  import ThinkingBlock from "./ThinkingBlock.svelte";

  // Live streaming uses StreamingBlock (which includes the lib's internal
  // _partialJson / _parsed flags on tool_use blocks); finalised assistant
  // frames use AssistantContentBlock (which doesn't). Accept either.
  let { content = [], streaming = false }: {
    content: AssistantContentBlock[] | StreamingBlock[];
    streaming?: boolean;
  } = $props();

  // Treat a block as "finished parsing" unless it's a streaming tool_use
  // that's still accumulating partial_json deltas. Reading _parsed off
  // the union requires a narrow — keep the cast localised here.
  function isParsed(block: AssistantContentBlock | StreamingBlock): boolean {
    if (block.type !== "tool_use") return true;
    const parsed = (block as { _parsed?: boolean })._parsed;
    return parsed ?? true;
  }
  function partialJson(block: AssistantContentBlock | StreamingBlock): string {
    if (block.type !== "tool_use") return "";
    return (block as { _partialJson?: string })._partialJson ?? "";
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
