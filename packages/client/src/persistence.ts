// --continue restores claude's internal context but doesn't restream
// prior turns over stream-json, so without local persistence a refresh
// lands on an empty bubble list.

import type { ReadableAtom } from "nanostores";
import type { MessageEntry } from "@somewhatintelligent/cc-protocol/client";
import type { Effort, PermissionMode } from "./modes";

export type StorageLike = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
};

export type CcPersistenceOptions = {
  enabled?: boolean;
  storage?: StorageLike;
  key?: string;
  maxMessages?: number;
};

export type PersistenceConfig = {
  storage: StorageLike;
  key: string;
  maxMessages: number;
};

export type PersistedShape = {
  sessionId: string | null;
  messages?: MessageEntry[];
  permissionMode?: PermissionMode;
  model?: string;
  effort?: Effort;
};

export function resolvePersistence(
  opt: CcPersistenceOptions | false | undefined,
): PersistenceConfig | null {
  if (opt === false) return null;
  // Null on server keeps SSR off the missing-globals cliff
  const g = globalThis as { localStorage?: StorageLike };
  const defaultStorage: StorageLike | null = g.localStorage ?? null;
  const storage = opt?.storage ?? defaultStorage;
  if (!storage) return null;
  if (opt && opt.enabled === false) return null;
  return {
    storage,
    key: opt?.key ?? "cc-ws-session",
    maxMessages: opt?.maxMessages ?? 200,
  };
}

export function loadPersisted(cfg: PersistenceConfig): PersistedShape | null {
  try {
    const raw = cfg.storage.getItem(cfg.key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    return parsed as PersistedShape;
  } catch {
    return null;
  }
}

export function savePersisted(cfg: PersistenceConfig, payload: PersistedShape): void {
  try {
    // Serializing streaming entries would resurrect a half-decoded
    // message on reload; keep frame + local_user only
    const trimmed: PersistedShape = { ...payload };
    if (Array.isArray(payload.messages)) {
      const filtered = payload.messages.filter(
        (m) => m.kind === "frame" || m.kind === "local_user",
      );
      trimmed.messages = filtered.slice(-cfg.maxMessages);
    }
    cfg.storage.setItem(cfg.key, JSON.stringify(trimmed));
  } catch {
    // Best-effort UX, not a correctness requirement
  }
}

// Subscribe to a revision atom (bumps only on non-streaming changes) so
// streaming tokens don't kick the debounce timer.
export interface PersistenceWriterArgs {
  persistence: PersistenceConfig;
  sessionId: ReadableAtom<string | null>;
  messages: ReadableAtom<MessageEntry[]>;
  /** Bumps when `messages` changes in a save-worthy way (frame add / clear / hydrate). */
  messagesRevision: ReadableAtom<number>;
  activeMode: ReadableAtom<PermissionMode>;
  activeModel: ReadableAtom<string>;
  activeEffort: ReadableAtom<Effort | "">;
}

export function installPersistenceWriter(args: PersistenceWriterArgs): void {
  const { persistence, sessionId, messages, messagesRevision, activeMode, activeModel, activeEffort } = args;
  let saveTimer: ReturnType<typeof setTimeout> | null = null;
  const flush = () => {
    saveTimer = null;
    savePersisted(persistence, {
      sessionId: sessionId.get(),
      messages: messages.get(),
      permissionMode: activeMode.get(),
      model: activeModel.get() || undefined,
      effort: activeEffort.get() || undefined,
    });
  };
  const schedule = () => {
    if (saveTimer != null) return;
    saveTimer = setTimeout(flush, 250);
  };
  sessionId.subscribe(schedule);
  messagesRevision.subscribe(schedule);
  activeMode.subscribe(schedule);
  activeModel.subscribe(schedule);
  activeEffort.subscribe(schedule);
}
