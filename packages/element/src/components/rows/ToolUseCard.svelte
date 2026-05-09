<script lang="ts">
  import { diffLines } from "diff";
  import { ellipsis, previewToolInput } from "../../lib/format";
  import { highlightCode } from "../../lib/markdown";

  let {
    name = "",
    input = {},
    partialJson = "",
    parsed = true,
    streaming = false,
  }: {
    name: string;
    input: unknown;
    partialJson?: string;
    parsed?: boolean;
    streaming?: boolean;
  } = $props();

  let expanded = $state(false);

  const preview = $derived(
    !parsed ? (partialJson ? ellipsis(partialJson, 100) + "…" : "(streaming)") : previewToolInput(input, 120),
  );

  // ---------- file-mutating tools render as a highlighted diff ----------
  // Edit/MultiEdit → real before/after diff via jsdiff.
  // Write/NotebookEdit → all-additions (no prior content known).

  type EditEdit = { old_string?: unknown; new_string?: unknown };
  type EditInput = { file_path?: unknown; old_string?: unknown; new_string?: unknown; edits?: unknown };
  type WriteInput = { file_path?: unknown; content?: unknown; new_source?: unknown };

  function asString(v: unknown): string {
    return typeof v === "string" ? v : "";
  }

  // Trailing newline on either side produces an empty final element after
  // .split("\n"). Drop it so we don't emit a phantom " " context line.
  function pushPrefixed(out: string[], chunk: string, prefix: " " | "+" | "-") {
    const lines = chunk.split("\n");
    if (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
    for (const l of lines) out.push(prefix + l);
  }

  function unifiedDiff(oldText: string, newText: string): string {
    const parts = diffLines(oldText, newText);
    const out: string[] = [];
    for (const p of parts) {
      pushPrefixed(out, p.value, p.added ? "+" : p.removed ? "-" : " ");
    }
    return out.join("\n");
  }

  function buildEditDiff(i: EditInput): string {
    if (Array.isArray(i.edits)) {
      // MultiEdit: concat each edit's diff with a blank separator
      const parts: string[] = [];
      for (const raw of i.edits) {
        if (!raw || typeof raw !== "object") continue;
        const e = raw as EditEdit;
        const d = unifiedDiff(asString(e.old_string), asString(e.new_string));
        if (d) parts.push(d);
      }
      return parts.join("\n\n");
    }
    return unifiedDiff(asString(i.old_string), asString(i.new_string));
  }

  type Body =
    | { kind: "diff"; html: string; path: string }
    | { kind: "code"; html: string; path: string }
    | { kind: "json"; text: string };

  const body = $derived.by<Body>(() => {
    if (!parsed || !input || typeof input !== "object") {
      return { kind: "json", text: partialJson || "(streaming)" };
    }
    if (name === "Edit" || name === "MultiEdit") {
      const i = input as EditInput;
      const path = asString(i.file_path);
      const diff = buildEditDiff(i);
      if (diff) return { kind: "diff", html: highlightCode(diff, "diff"), path };
    }
    if (name === "Write") {
      const i = input as WriteInput;
      const content = asString(i.content);
      const path = asString(i.file_path);
      // A fresh write reads as all-additions — render that as a diff
      // too so it visually matches an Edit. Cheap, and the +-prefixes
      // make "this is what's about to land in the file" obvious.
      const diff = unifiedDiff("", content);
      return { kind: "diff", html: highlightCode(diff, "diff"), path };
    }
    if (name === "NotebookEdit") {
      const i = input as WriteInput;
      const src = asString(i.new_source);
      const path = asString(i.file_path);
      // Notebooks are nearly always Python; fall through to plain otherwise.
      const lang = path.endsWith(".py") ? "python" : "";
      return { kind: "code", html: highlightCode(src, lang), path };
    }
    return { kind: "json", text: JSON.stringify(input, null, 2) };
  });
</script>

<div class="card" class:streaming>
  <button class="head" onclick={() => (expanded = !expanded)}>
    <span class="glyph">⎿</span>
    <span class="name">{name}</span>
    <span class="preview">{preview}</span>
    <span class="toggle">{expanded ? "[hide]" : "[show]"}</span>
  </button>
  {#if expanded}
    {#if body.kind === "diff" || body.kind === "code"}
      {#if body.path}<div class="path">{body.path}</div>{/if}
      <div class="body shiki-body">{@html body.html}</div>
    {:else}
      <pre class="body json">{body.text}</pre>
    {/if}
  {/if}
</div>

<style>
  .card {
    border: 1px solid var(--border-1);
    border-radius: 3px;
    background: var(--bg-1);
    overflow: hidden;
  }
  .card.streaming { border-color: var(--accent-line); }
  .head {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 5px 10px;
    width: 100%;
    text-align: left;
    font-size: 12px;
  }
  .head:hover { background: var(--bg-2); }
  .glyph { color: var(--info); flex-shrink: 0; }
  .name {
    color: var(--info);
    font-weight: 600;
    flex-shrink: 0;
  }
  .preview {
    color: var(--fg-1);
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    min-width: 0;
  }
  .toggle { color: var(--fg-3); font-size: 11px; flex-shrink: 0; }

  .path {
    padding: 4px 12px;
    font-size: 11px;
    color: var(--fg-2);
    background: var(--bg);
    border-top: 1px solid var(--border);
    font-family: var(--font-mono);
  }

  .body {
    margin: 0;
    font-size: 11.5px;
    color: var(--fg-1);
    background: var(--bg);
    border-top: 1px solid var(--border);
    max-height: 360px;
    overflow: auto;
  }
  .body.json {
    padding: 8px 12px;
    white-space: pre-wrap;
    word-break: break-word;
  }
  /* shiki output sits inside .body unmodified — its <pre> brings its
     own padding via our overrides below, so .body itself is just a
     scroll/clip container. */
  .shiki-body :global(pre) {
    margin: 0;
    padding: 8px 12px;
    background: transparent !important;
    border: 0;
    border-radius: 0;
    font-size: inherit;
    line-height: 1.5;
    overflow: visible; /* outer .body handles scroll */
  }
  .shiki-body :global(code) {
    background: transparent;
    padding: 0;
    color: inherit;
  }
  .shiki-body :global(pre.shiki .line) { display: block; }
</style>
