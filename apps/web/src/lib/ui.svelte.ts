// UI-only reactive state. Nothing here belongs in the lib — these are
// purely demo concerns (which floating panel is open, focus modes, etc).
// Plain $state object so anything that imports it gets reactivity for free.

export type PanelKind =
  | "tasks"
  | "permissions"
  | "hooks"
  | "settings"
  | "help"
  | null;

export const ui = $state({
  activePanel: null as PanelKind,
  // When a permission request lands and no panel is already open, we pop
  // the permissions panel automatically. User can dismiss it.
  autoOpenPerms: true,
});

export function togglePanel(p: NonNullable<PanelKind>) {
  ui.activePanel = ui.activePanel === p ? null : p;
}

export function closePanel() {
  ui.activePanel = null;
}

export function openPanel(p: NonNullable<PanelKind>) {
  ui.activePanel = p;
}
