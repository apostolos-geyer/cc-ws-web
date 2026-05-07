// React adapter for @somewhatintelligent/cc-ws-client. Provides a Provider/hook pair so consumers
// don't have to thread `session` everywhere, plus convenience hooks that wrap
// useStore() on the canonical atoms. Anyone who needs a less-common atom can
// reach for `useCcAtom(session.atoms.X)` directly.

import { useStore } from "@nanostores/react";
import { createContext, useContext, type ReactNode } from "react";
import type { Atom, ReadableAtom } from "nanostores";

import type {
  CcSession,
  HookEntry,
  InitData,
  MessageEntry,
  PendingPermission,
  SessionState,
  ShellEntry,
  TaskEntry,
  WsStatus,
  Effort,
  PermissionMode,
} from "@somewhatintelligent/cc-ws-client";

// Re-export the typed useStore as useCcAtom — same fn, more discoverable name.
export const useCcAtom: <T>(atom: ReadableAtom<T> | Atom<T>) => T = useStore;

// ---------- context ----------

const CcSessionCtx = createContext<CcSession | null>(null);

export function CcSessionProvider({
  session,
  children,
}: {
  session: CcSession;
  children: ReactNode;
}) {
  return <CcSessionCtx.Provider value={session}>{children}</CcSessionCtx.Provider>;
}

export function useCcSession(): CcSession {
  const s = useContext(CcSessionCtx);
  if (!s) {
    throw new Error(
      "useCcSession must be used inside <CcSessionProvider>. " +
        "Wrap your tree with <CcSessionProvider session={createCcSession({...})}>",
    );
  }
  return s;
}

// ---------- convenience hooks (wrap useStore on the canonical atoms) ----------

export function useStatus(): WsStatus {
  return useStore(useCcSession().atoms.status);
}

export function useLastError(): string | null {
  return useStore(useCcSession().atoms.lastError);
}

export function useInit(): InitData {
  return useStore(useCcSession().atoms.init);
}

export function useMessages(): MessageEntry[] {
  return useStore(useCcSession().atoms.messages);
}

export function useActiveStreamId(): string | null {
  return useStore(useCcSession().atoms.activeStreamId);
}

export function useActiveMode(): PermissionMode {
  return useStore(useCcSession().atoms.activeMode);
}

export function usePendingMode(): PermissionMode | null {
  return useStore(useCcSession().atoms.pendingMode);
}

export function useModeError(): string | null {
  return useStore(useCcSession().atoms.modeError);
}

export function useActiveModel(): string {
  return useStore(useCcSession().atoms.activeModel);
}

export function usePendingModel(): string | null {
  return useStore(useCcSession().atoms.pendingModel);
}

export function useModelError(): string | null {
  return useStore(useCcSession().atoms.modelError);
}

export function useActiveEffort(): Effort | "" {
  return useStore(useCcSession().atoms.activeEffort);
}

export function usePendingEffort(): Effort | null {
  return useStore(useCcSession().atoms.pendingEffort);
}

export function useEffortError(): string | null {
  return useStore(useCcSession().atoms.effortError);
}

export function usePendingPermissions(): PendingPermission[] {
  return useStore(useCcSession().atoms.pendingPermissions);
}

export function useHookEvents(): HookEntry[] {
  return useStore(useCcSession().atoms.hookEvents);
}

export function useShellEntries(): ShellEntry[] {
  return useStore(useCcSession().atoms.shellEntries);
}

export function useTasks(): TaskEntry[] {
  return useStore(useCcSession().atoms.tasks);
}

export function useSessionState(): SessionState {
  return useStore(useCcSession().atoms.sessionState);
}

// ---------- re-exports so consumers only need to depend on @somewhatintelligent/cc-ws-react ----------

export {
  createCcSession,
  CYCLE_ORDER,
  EFFORT_DEFS,
  EFFORT_OPTIONS,
  KNOWN_EFFORTS,
  KNOWN_MODELS,
  KNOWN_PERMISSION_MODES,
  MODEL_DEFS,
  MODEL_OPTIONS,
  PERMISSION_MODE_DEFS,
  PERMISSION_MODE_OPTIONS,
  nextCycleMode,
} from "@somewhatintelligent/cc-ws-client";
export type {
  CcAtoms,
  CcPersistenceOptions,
  CcSession,
  CcSessionOptions,
  Effort,
  FrameEntry,
  HookEntry,
  InFlightMessage,
  InitData,
  LocalUserEntry,
  MessageEntry,
  Model,
  OnCanUseTool,
  PendingPermission,
  PermissionDecision,
  PermissionMode,
  SessionMode,
  SessionState,
  ShellEntry,
  ShellSource,
  StorageLike,
  StreamingBlock,
  StreamingEntry,
  TaskEntry,
  TaskStatus,
  TaskUsage,
  TextBlock,
  ThinkingBlock,
  ToolUseBlock,
  WsStatus,
} from "@somewhatintelligent/cc-ws-client";
