// Global keybinds. Bound on document; ignored when the target is an
// input/textarea/contenteditable so typing doesn't trigger commands.
// Cmd/Ctrl modifier is required for most shortcuts to avoid clashing with
// the composer. Shift+Tab cycles permission mode (CC TUI parity).

import type { CcSession } from "@somewhatintelligent/cc-ws-svelte";
import { closePanel, togglePanel, ui } from "./ui.svelte";

type Disposer = () => void;

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA";
}

export function installKeymap(session: CcSession): Disposer {
  function onKey(e: KeyboardEvent) {
    const mod = e.metaKey || e.ctrlKey;
    const typing = isTyping(e.target);

    // Esc — close panel, blur input.
    if (e.key === "Escape") {
      if (ui.activePanel) {
        e.preventDefault();
        closePanel();
        return;
      }
      if (typing && document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
      return;
    }

    // Shift+Tab — cycle permission mode (works regardless of focus).
    if (e.shiftKey && e.key === "Tab") {
      e.preventDefault();
      void session.cyclePermissionMode();
      return;
    }

    // The rest require a modifier so they don't fight the textarea.
    if (!mod) return;

    switch (e.key.toLowerCase()) {
      case "t":
        e.preventDefault();
        togglePanel("tasks");
        return;
      case "p":
        e.preventDefault();
        togglePanel("permissions");
        return;
      case "h":
        e.preventDefault();
        togglePanel("hooks");
        return;
      case ",":
        e.preventDefault();
        togglePanel("settings");
        return;
      case "/":
        e.preventDefault();
        togglePanel("help");
        return;
      case "i":
        e.preventDefault();
        void session.interrupt();
        return;
      case "k":
        // ⌘K focus the composer (idiomatic).
        e.preventDefault();
        document.querySelector<HTMLTextAreaElement>("textarea[data-composer]")?.focus();
        return;
    }
  }

  document.addEventListener("keydown", onKey);
  return () => document.removeEventListener("keydown", onKey);
}
