// Streaming-friendly markdown renderer for assistant text. We re-parse
// the entire current text on every delta — a typical chat message is
// short enough that the per-token cost is dwarfed by the WebSocket
// round-trip, and re-parsing avoids the gnarly state machine that
// incremental parsing would need to handle mid-token edits (an unclosed
// `**bold` becoming `**bold**` etc.).
//
// Sanitised through DOMPurify before reaching {@html} so the agent
// can't smuggle <script>/onclick=… into a renderer that gets dropped
// straight into a host page's shadow root. Code blocks come out of
// shiki with inline `style="color:#..."` per token, which is why
// `style` is on the attr allowlist below.
//
// Shiki uses the synchronous core + JavaScript regex engine, so init
// happens at module load with no top-level await — code blocks
// highlight on the first render, no flicker. The downside is every
// shipped language is bundled; we curate to a chat-relevant set.

import { marked } from "marked";
import DOMPurify from "dompurify";
import { createHighlighterCoreSync, type HighlighterCore } from "shiki/core";
import { createJavaScriptRegexEngine } from "shiki/engine/javascript";

// Curated language set. Each grammar ships ~20–80kB of JSON; the full
// shiki bundle is ~3MB. We pick what's plausible in a chat code block:
// shells, the JS family, JSON, Python, HTML/CSS, diff. Anything else
// falls through to a plain <pre><code>.
import bash from "shiki/langs/bash.mjs";
import typescript from "shiki/langs/typescript.mjs";
import javascript from "shiki/langs/javascript.mjs";
import json from "shiki/langs/json.mjs";
import python from "shiki/langs/python.mjs";
import htmlLang from "shiki/langs/html.mjs";
import css from "shiki/langs/css.mjs";
import diff from "shiki/langs/diff.mjs";

import githubDark from "shiki/themes/github-dark.mjs";

const highlighter: HighlighterCore = createHighlighterCoreSync({
  themes: [githubDark],
  langs: [bash, typescript, javascript, json, python, htmlLang, css, diff],
  engine: createJavaScriptRegexEngine(),
});

// Lowercase the fence info-string token before lookup; map common
// aliases to the bundled grammar. Returns null for unsupported langs
// so the renderer falls back to plain `<pre><code>`.
const LOADED = new Set(highlighter.getLoadedLanguages());
const ALIASES: Record<string, string> = {
  sh: "bash",
  shell: "bash",
  zsh: "bash",
  ts: "typescript",
  // tsx/jsx aren't bundled separately — collapse to ts/js so they at
  // least get *some* highlighting instead of falling back to plain.
  tsx: "typescript",
  js: "javascript",
  jsx: "javascript",
  py: "python",
};
function pickLang(raw: string | undefined): string | null {
  if (!raw) return null;
  const head = raw.toLowerCase().split(/\s+/)[0]!;
  const lang = ALIASES[head] ?? head;
  return LOADED.has(lang) ? lang : null;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ESCAPE[c]!);
}
const ESCAPE: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

// Settled code blocks (anything that's not the trailing in-progress
// fence) re-render with identical text on every streaming delta. shiki
// is fast but not free — caching by `lang::text` avoids re-tokenising
// the whole timeline on each new token. Append-only chat → FIFO
// eviction; oldest is always the right thing to drop.
const HIGHLIGHT_CACHE = new Map<string, string>();
const CACHE_MAX = 128;
function cacheSet(key: string, value: string) {
  HIGHLIGHT_CACHE.set(key, value);
  if (HIGHLIGHT_CACHE.size > CACHE_MAX) {
    const oldest = HIGHLIGHT_CACHE.keys().next().value;
    if (oldest !== undefined) HIGHLIGHT_CACHE.delete(oldest);
  }
}

marked.use({
  gfm: true,
  // Treat single \n as <br>. Chat-style: the model rarely emits the
  // double-newline that strict markdown requires for line breaks, so
  // without this you get "two thoughts joined by a space" surprises.
  breaks: true,
  renderer: {
    code({ text, lang }: { text: string; lang?: string }) {
      const resolved = pickLang(lang);
      if (resolved) {
        // `md::` prefix segregates this cache from highlightCode below
        // — the marked path returns the raw shiki HTML (the outer
        // renderMarkdown sanitises the whole document afterwards),
        // whereas highlightCode caches already-sanitised output.
        const key = `md::${resolved}::${text}`;
        const hit = HIGHLIGHT_CACHE.get(key);
        if (hit) return hit;
        const html = highlighter.codeToHtml(text, { lang: resolved, theme: "github-dark" });
        cacheSet(key, html);
        return html;
      }
      const cls = lang ? ` class="language-${escapeHtml(lang)}"` : "";
      return `<pre><code${cls}>${escapeHtml(text)}</code></pre>`;
    },
  },
});

// Open external links in a new tab and strip referer. Belt-and-braces
// — the renderer is inside a shadow root, but a click that opens a
// malicious URL still lands the user there.
DOMPurify.addHook("afterSanitizeAttributes", (node) => {
  if (node.tagName === "A" && node instanceof HTMLAnchorElement) {
    node.setAttribute("target", "_blank");
    node.setAttribute("rel", "noopener noreferrer");
  }
});

const SANITIZE_OPTS = {
  ALLOWED_TAGS: [
    "h1", "h2", "h3", "h4", "h5", "h6",
    "p", "br", "hr",
    "strong", "em", "del", "ins", "sup", "sub", "mark",
    "ul", "ol", "li",
    "blockquote",
    "pre", "code",
    "table", "thead", "tbody", "tr", "th", "td",
    "a", "img",
    "span", "div",
  ],
  // `style` permits shiki's per-token color spans; `tabindex` permits
  // shiki's keyboard-navigable code blocks.
  ALLOWED_ATTR: ["href", "title", "alt", "src", "class", "target", "rel", "style", "tabindex"],
};

export function renderMarkdown(text: string): string {
  if (!text) return "";
  // marked.parse can return a Promise when async extensions are loaded
  // — we don't use any, so cast to string.
  const html = marked.parse(text, { async: false }) as string;
  return DOMPurify.sanitize(html, SANITIZE_OPTS);
}

// Standalone code highlighter for callers that already have a code string
// (e.g. ToolUseCard rendering an Edit/Write diff). Same shiki + sanitizer
// pipeline as fenced markdown blocks, with the same LRU cache.
export function highlightCode(code: string, lang: string): string {
  const resolved = pickLang(lang);
  if (!resolved) {
    return DOMPurify.sanitize(`<pre><code>${escapeHtml(code)}</code></pre>`, SANITIZE_OPTS);
  }
  const key = `code::${resolved}::${code}`;
  const hit = HIGHLIGHT_CACHE.get(key);
  if (hit) return hit;
  const html = highlighter.codeToHtml(code, { lang: resolved, theme: "github-dark" });
  const sanitised = DOMPurify.sanitize(html, SANITIZE_OPTS);
  cacheSet(key, sanitised);
  return sanitised;
}
