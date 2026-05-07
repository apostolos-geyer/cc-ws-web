import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import Markdown from "react-markdown";

import {
  CcSessionProvider,
  EFFORT_OPTIONS,
  KNOWN_MODELS,
  MODEL_OPTIONS,
  PERMISSION_MODE_OPTIONS,
  createCcSession,
  useActiveEffort,
  useActiveMode,
  useActiveModel,
  useActiveStreamId,
  useCcSession,
  useEffortError,
  useHookEvents,
  useInit,
  useMessages,
  useModeError,
  useModelError,
  usePendingEffort,
  usePendingMode,
  usePendingModel,
  usePendingPermissions,
  useShellEntries,
  useStatus,
  useTasks,
  type Effort,
  type FrameEntry,
  type InFlightMessage,
  type LocalUserEntry,
  type MessageEntry,
  type PermissionMode,
  type StreamingBlock,
  type StreamingEntry,
  type TaskEntry,
} from "@cc-ws/react";

// Single session per page, provided to the tree via CcSessionProvider.
const session = createCcSession({
  url: `ws://${location.host}/ws`,
  args: {
    mode: { kind: "continue" },
    permissionMode: "default",
    permissionPromptTool: "stdio",
    includePartialMessages: true,
    includeHookEvents: true,
  },
  onTrace: (dir, line) => console.log(`[${dir}]`, line),
});

// ---------- shell mode (UI only — affects input handling) ----------

type ShellMode = "off" | "context" | "sideChannel";

// ---------- autocomplete dropdowns ----------

type MentionItem =
  | { kind: "agent"; name: string }
  | { kind: "file"; path: string };

type CommandItem =
  | { kind: "command"; name: string }
  | { kind: "skill"; name: string };

function App() {
  const session = useCcSession();
  const status = useStatus();
  const messages = useMessages();
  const init = useInit();
  const activeMode = useActiveMode();
  const pendingMode = usePendingMode();
  const modeError = useModeError();
  const activeModel = useActiveModel();
  const pendingModel = usePendingModel();
  const modelError = useModelError();
  const activeEffort = useActiveEffort();
  const pendingEffort = usePendingEffort();
  const effortError = useEffortError();
  const pendingPermissions = usePendingPermissions();
  const hookEvents = useHookEvents();
  const shellEntries = useShellEntries();
  const activeStreamId = useActiveStreamId();
  const tasks = useTasks();

  const connected = status === "open";

  // Local UI state.
  const [input, setInput] = useState("");
  const [shellMode, setShellMode] = useState<ShellMode>("off");
  const [hookExpanded, setHookExpanded] = useState(false);
  const [hookOpenIds, setHookOpenIds] = useState<Record<string, boolean>>({});

  // Autocomplete state (mention = `@`, command = `/`).
  const [mentionStart, setMentionStart] = useState<number | null>(null);
  const [mentionMatches, setMentionMatches] = useState<MentionItem[]>([]);
  const [commandStart, setCommandStart] = useState<number | null>(null);
  const [commandMatches, setCommandMatches] = useState<CommandItem[]>([]);
  const [dropdownIndex, setDropdownIndex] = useState(0);

  const mainRef = useRef<HTMLElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const fileSuggestDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestFileQueryRef = useRef<string>("");

  // Connect on mount.
  useEffect(() => {
    session.connect();
    return () => session.disconnect();
  }, []);

  // Auto-scroll on new messages / streaming deltas.
  useEffect(() => {
    const el = mainRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  // Cmd+Shift+1 toggles side-channel shell mode (Digit1 keeps the binding
  // stable across keyboard layouts where Cmd suppresses Shift's symbol).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.metaKey || !e.shiftKey || e.code !== "Digit1") return;
      e.preventDefault();
      setShellMode((m) => (m === "sideChannel" ? "off" : "sideChannel"));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Shift+Tab cycles permission modes. Always preventDefault so focus
  // doesn't leave the input even when a previous set_permission_mode is
  // mid-flight (the early-return below would otherwise let the browser run
  // its focus-cycle default).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.shiftKey || e.key !== "Tab") return;
      e.preventDefault();
      if (pendingMode != null) return;
      void session.cyclePermissionMode();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pendingMode]);

  // ---- send paths ----

  function sendPrompt() {
    const text = input.trim();
    if (!text) return;

    if (shellMode === "context") {
      const lines = input.split("\n");
      const firstRaw = lines[0] ?? "";
      const first = firstRaw.startsWith("!") ? firstRaw.slice(1).trimStart() : firstRaw.trim();
      const followUp = lines.slice(1).join("\n").trim();
      if (first) session.sendShellContext(first, followUp);
      setInput("");
      setShellMode("off");
      closeAllDropdowns();
      return;
    }

    if (shellMode === "sideChannel") {
      const cmd = text.startsWith("!") ? text.slice(1).trimStart() : text;
      if (cmd) session.sendBashSideChannel(cmd);
      setInput("");
      setShellMode("off");
      closeAllDropdowns();
      return;
    }

    session.sendMessage(text);
    setInput("");
    closeAllDropdowns();
  }

  function changeMode(next: PermissionMode) {
    void session.setPermissionMode(next);
  }

  // ---- autocomplete ----

  function closeAllDropdowns() {
    setMentionStart(null);
    setMentionMatches([]);
    setCommandStart(null);
    setCommandMatches([]);
    setDropdownIndex(0);
  }

  function computeAgentOnlyMatches(): MentionItem[] {
    return init.agents.slice(0, 8).map((name) => ({ kind: "agent" as const, name }));
  }

  function computeCommandMatches(query: string): CommandItem[] {
    const ql = query.toLowerCase();
    const cmdItems: CommandItem[] = init.slashCommands
      .filter((n) => !ql || n.toLowerCase().includes(ql))
      .map((name) => ({ kind: "command" as const, name }));
    const skillItems: CommandItem[] = init.skills
      .filter((n) => !ql || n.toLowerCase().includes(ql))
      .map((name) => ({ kind: "skill" as const, name }));
    return [...cmdItems, ...skillItems].slice(0, 20);
  }

  function scheduleFileSuggestions(query: string) {
    if (fileSuggestDebounceRef.current) clearTimeout(fileSuggestDebounceRef.current);
    fileSuggestDebounceRef.current = setTimeout(async () => {
      latestFileQueryRef.current = query;
      const sugg = await session.fetchFileSuggestions(query);
      // Stale-response guard.
      if (latestFileQueryRef.current !== query) return;
      const isPathy = query.includes("/") || query.includes(".");
      const ql = query.toLowerCase();
      const agentMatches: MentionItem[] = isPathy
        ? []
        : init.agents
            .filter((a) => !ql || a.toLowerCase().includes(ql))
            .map((name) => ({ kind: "agent" as const, name }));
      const fileMatches: MentionItem[] = sugg.map((s) => ({ kind: "file" as const, path: s.path }));
      setMentionMatches([...agentMatches.slice(0, 5), ...fileMatches.slice(0, 15)]);
      setDropdownIndex(0);
    }, 150);
  }

  function refreshAutocomplete(value: string, caret: number) {
    if (value.startsWith("/")) {
      const ws = value.search(/\s/);
      const tokenEnd = ws === -1 ? value.length : ws;
      if (caret <= tokenEnd) {
        const query = value.slice(1, caret);
        setCommandStart(0);
        setCommandMatches(computeCommandMatches(query));
        setDropdownIndex(0);
        setMentionStart(null);
        setMentionMatches([]);
        return;
      }
    }
    setCommandStart(null);
    setCommandMatches([]);

    let i = caret - 1;
    while (i >= 0 && !/\s/.test(value[i]!)) i--;
    const tokenStart = i + 1;
    const tokenSlice = value.slice(tokenStart, caret);
    if (tokenSlice.startsWith("@")) {
      const query = tokenSlice.slice(1);
      setMentionStart(tokenStart);
      const isPathy = query.includes("/") || query.includes(".");
      if (!query) {
        setMentionMatches(computeAgentOnlyMatches());
        setDropdownIndex(0);
        latestFileQueryRef.current = "";
      } else if (!isPathy) {
        setMentionMatches(
          init.agents
            .filter((a) => a.toLowerCase().includes(query.toLowerCase()))
            .slice(0, 8)
            .map((name) => ({ kind: "agent" as const, name })),
        );
        setDropdownIndex(0);
        scheduleFileSuggestions(query);
      } else {
        setMentionMatches([]);
        setDropdownIndex(0);
        scheduleFileSuggestions(query);
      }
      return;
    }
    setMentionStart(null);
    setMentionMatches([]);
  }

  function applyMention(item: MentionItem) {
    if (mentionStart == null) return;
    const after = input.slice(mentionStart);
    const wsIdx = after.search(/\s/);
    const tokenEnd = wsIdx === -1 ? input.length : mentionStart + wsIdx;
    const replacement = item.kind === "agent" ? `@${item.name}` : `@${item.path}`;
    const next = input.slice(0, mentionStart) + replacement + " " + input.slice(tokenEnd);
    setInput(next);
    closeAllDropdowns();
    requestAnimationFrame(() => {
      const ta = textareaRef.current;
      if (ta) {
        const pos = mentionStart + replacement.length + 1;
        ta.focus();
        ta.setSelectionRange(pos, pos);
      }
    });
  }

  function applyCommand(item: CommandItem) {
    const ws = input.search(/\s/);
    const tokenEnd = ws === -1 ? input.length : ws;
    const next = `/${item.name} ` + input.slice(tokenEnd).replace(/^\s*/, "");
    setInput(next);
    closeAllDropdowns();
    requestAnimationFrame(() => {
      const ta = textareaRef.current;
      if (ta) {
        const pos = next.length;
        ta.focus();
        ta.setSelectionRange(pos, pos);
      }
    });
  }

  const dropdownOpen: "mention" | "command" | null =
    mentionStart != null && mentionMatches.length > 0
      ? "mention"
      : commandStart != null && commandMatches.length > 0
      ? "command"
      : null;

  function handleTextareaKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Escape") {
      if (dropdownOpen) {
        e.preventDefault();
        closeAllDropdowns();
        return;
      }
      if (shellMode !== "off") {
        e.preventDefault();
        setShellMode("off");
        return;
      }
    }

    if (e.key === "Backspace" && shellMode !== "off" && input.length === 0) {
      e.preventDefault();
      setShellMode("off");
      return;
    }

    if (dropdownOpen) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        const len = dropdownOpen === "mention" ? mentionMatches.length : commandMatches.length;
        setDropdownIndex((i) => (i + 1) % Math.max(len, 1));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        const len = dropdownOpen === "mention" ? mentionMatches.length : commandMatches.length;
        setDropdownIndex((i) => (i - 1 + Math.max(len, 1)) % Math.max(len, 1));
        return;
      }
      if (e.key === "Tab" || e.key === "Enter") {
        e.preventDefault();
        if (dropdownOpen === "mention") {
          const item = mentionMatches[dropdownIndex];
          if (item) applyMention(item);
        } else {
          const item = commandMatches[dropdownIndex];
          if (item) applyCommand(item);
        }
        return;
      }
    }

    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      sendPrompt();
    }
  }

  function handleTextareaChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const next = e.target.value;
    if (shellMode === "off" && next.startsWith("!")) {
      setShellMode("context");
      setInput(next.slice(1));
      e.target.value = next.slice(1);
      closeAllDropdowns();
      return;
    }
    setInput(next);
    refreshAutocomplete(next, e.target.selectionStart ?? next.length);
  }

  function handleTextareaCaret(e: React.SyntheticEvent<HTMLTextAreaElement>) {
    const ta = e.currentTarget;
    refreshAutocomplete(ta.value, ta.selectionStart ?? ta.value.length);
  }

  const renderedModelOptions: { value: string; label: string }[] = useMemo(() => {
    const base = MODEL_OPTIONS.map((o) => ({ value: o.value as string, label: o.label }));
    if (activeModel && !(KNOWN_MODELS as readonly string[]).includes(activeModel as any)) {
      base.unshift({ value: activeModel, label: `${activeModel} (current)` });
    }
    return base;
  }, [activeModel]);

  return (
    <>
      <header>
        <div className="chip">
          {connected
            ? init.model
              ? `model: ${init.model} · cwd: ${init.cwd ?? "?"}`
              : "connected, waiting for init…"
            : "disconnected"}
          {init.sessionId && (
            <span className="session-id" title="Current session id (click to copy)" onClick={() => navigator.clipboard?.writeText(init.sessionId!)}>
              · session: {init.sessionId.slice(0, 8)}…
            </span>
          )}
        </div>
        <SessionControls />
        <button onClick={() => void session.interrupt()} disabled={!connected}>Interrupt</button>
      </header>
      <main ref={mainRef}>
        {messages.map((entry) => (
          <MessageRow
            key={entry.id}
            entry={entry}
            messages={messages}
            activeStreamId={activeStreamId}
          />
        ))}
        {pendingPermissions.map((p) => (
          <div className="perm" key={p.id}>
            <div><strong>Tool permission requested</strong>: {p.toolName}</div>
            <pre style={{ fontSize: 12, whiteSpace: "pre-wrap" }}>
              {JSON.stringify(p.input ?? {}, null, 2)}
            </pre>
            <button
              className="approve"
              onClick={() => session.respondToPermission(p.id, { behavior: "allow", updatedInput: p.input ?? {} })}
            >
              Approve
            </button>
            <button
              className="deny"
              onClick={() => session.respondToPermission(p.id, { behavior: "deny", message: "Denied by user" })}
            >
              Deny
            </button>
          </div>
        ))}
      </main>
      {tasks.length > 0 && (
        <div className="tasks-panel">
          <div className="tasks-head">
            Tasks <span className="dim">({tasks.filter((t) => t.status === "running").length} running, {tasks.length} total)</span>
          </div>
          <div className="tasks-body">
            {tasks.slice().sort((a, b) => b.startTime - a.startTime).map((t) => (
              <TaskRow key={t.taskId} task={t} />
            ))}
          </div>
        </div>
      )}
      {hookEvents.length > 0 && (
        <div className="hooks-panel">
          <div className="hooks-head">
            <label>
              <input
                type="checkbox"
                checked={hookExpanded}
                onChange={(e) => setHookExpanded(e.target.checked)}
              />
              Hooks ({hookEvents.length})
            </label>
          </div>
          {hookExpanded && (
            <div className="hooks-body">
              {hookEvents.map((h) => {
                const open = !!hookOpenIds[h.id];
                const tsStr = new Date(h.ts).toISOString().slice(11, 23);
                return (
                  <div className="hook-entry" key={h.id}>
                    <div
                      className="hook-line"
                      onClick={() =>
                        setHookOpenIds((prev) => ({ ...prev, [h.id]: !open }))
                      }
                    >
                      <span className="hook-ts">[{tsStr}]</span>
                      <span className="hook-sub">{h.subtype}</span>
                      {h.hookName && <span className="hook-name">{h.hookName}</span>}
                      <span className="hook-toggle">{open ? "▾" : "▸"}</span>
                    </div>
                    {open && (
                      <pre className="hook-raw">{JSON.stringify(h.raw, null, 2)}</pre>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
      {shellEntries.length > 0 && (
        <div className="shell-panel">
          {shellEntries.map((s) => (
            <div className="shell-entry" key={s.id}>
              <div className="shell-head">
                <span className="shell-prompt">$</span>
                <span className="shell-cmd">{s.command}</span>
                <span className={"shell-source " + s.source}>
                  {s.source === "context" ? "context" : "side-channel"}
                </span>
                {s.pending && s.source === "context" && (
                  <span className="shell-queued" title="Queued — will ride out as <bash-input>/<bash-stdout> XML on your next prompt">queued for next send</span>
                )}
                <button className="shell-dismiss" onClick={() => session.dismissShellEntry(s.id)} title="Dismiss">×</button>
              </div>
              {s.chunks.length > 0 && (
                <pre className="shell-out">{s.chunks.join("")}</pre>
              )}
            </div>
          ))}
        </div>
      )}
      <footer>
        <div className="mode-control">
          <select
            className="mode-select"
            value={pendingMode ?? activeMode}
            onChange={(e) => changeMode(e.target.value as PermissionMode)}
            disabled={!connected || pendingMode != null}
            title="Permission mode (Shift+Tab to cycle)"
          >
            {PERMISSION_MODE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          <select
            className="mode-select"
            value={pendingModel ?? activeModel}
            onChange={(e) => void session.setModel(e.target.value)}
            disabled={!connected || pendingModel != null}
            title="Model (set_model control_request, in-process)"
          >
            <option value="">(model)</option>
            {renderedModelOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          <select
            className="mode-select"
            value={pendingEffort ?? activeEffort}
            onChange={(e) => void session.setEffort(e.target.value as Effort)}
            disabled={!connected || pendingEffort != null}
            title="Effort level (kills + respawns claude with --effort; conversation continues via --continue)"
          >
            <option value="">(launch default)</option>
            {EFFORT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          <span className="mode-hint">Shift+Tab to cycle</span>
          {modeError && <span className="mode-error">{modeError}</span>}
          {modelError && <span className="mode-error">{modelError}</span>}
          {effortError && <span className="mode-error">{effortError}</span>}
        </div>
        <div className="input-row">
          <div className="input-wrap">
            {shellMode === "context" && (
              <span className="shell-chip context">Shell + context</span>
            )}
            {shellMode === "sideChannel" && (
              <span className="shell-chip side">Shell (side-channel)</span>
            )}
            <textarea
              ref={textareaRef}
              rows={2}
              value={input}
              onChange={handleTextareaChange}
              onKeyDown={handleTextareaKey}
              onKeyUp={handleTextareaCaret}
              onClick={handleTextareaCaret}
              onBlur={() => {
                setTimeout(() => closeAllDropdowns(), 100);
              }}
              placeholder={
                shellMode === "context"
                  ? "shell command on line 1; optional follow-up prompt on subsequent lines (claude sees the output)"
                  : shellMode === "sideChannel"
                  ? "run a shell command — output stays local, claude does NOT see it"
                  : "Type a prompt — Cmd/Ctrl+Enter to send · ! for shell · @ to mention · / for commands"
              }
              className={shellMode !== "off" ? "shell-on" : undefined}
            />
            {dropdownOpen === "mention" && (
              <ul className="ac-dropdown" role="listbox">
                {mentionMatches.map((m, i) => (
                  <li
                    key={(m.kind === "agent" ? "a:" : "f:") + (m.kind === "agent" ? m.name : m.path)}
                    className={i === dropdownIndex ? "active" : ""}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      applyMention(m);
                    }}
                  >
                    <span className={"ac-tag " + (m.kind === "agent" ? "agent" : "file")}>
                      {m.kind === "agent" ? "agent" : "file"}
                    </span>
                    <span className="ac-label">{m.kind === "agent" ? m.name : m.path}</span>
                  </li>
                ))}
              </ul>
            )}
            {dropdownOpen === "command" && (
              <ul className="ac-dropdown" role="listbox">
                {commandMatches.map((m, i) => (
                  <li
                    key={m.kind + ":" + m.name}
                    className={i === dropdownIndex ? "active" : ""}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      applyCommand(m);
                    }}
                  >
                    <span className={"ac-tag " + (m.kind === "command" ? "command" : "skill")}>
                      {m.kind === "command" ? "command" : "skill"}
                    </span>
                    <span className="ac-label">/{m.name}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <button onClick={sendPrompt} disabled={!connected}>Send</button>
        </div>
      </footer>
    </>
  );
}

// ---------- timeline rendering ----------

function MessageRow({
  entry,
  messages,
  activeStreamId,
}: {
  entry: MessageEntry;
  messages: MessageEntry[];
  activeStreamId: string | null;
}) {
  if (entry.kind === "local_user") return <LocalUserRow entry={entry} />;
  if (entry.kind === "streaming") return <StreamingRow entry={entry} isActive={entry.msg.id === activeStreamId} />;
  return <FrameRow entry={entry} messages={messages} />;
}

// ---------- session lifecycle controls ----------
//
// New / Continue / Resume <id> all do the same thing under the hood: kill
// the running claude child and respawn with new session args. Reflects the
// `mode` field of the lib's CcSessionOptions.args. End fires the
// end_session control_request; the next New/Continue/Resume revives.

function SessionControls() {
  const session = useCcSession();
  const status = useStatus();
  const init = useInit();
  const [resumeId, setResumeId] = useState("");
  const [busy, setBusy] = useState<null | "new" | "continue" | "resume" | "end">(null);
  const [err, setErr] = useState<string | null>(null);
  const connected = status === "open";

  function flashError(msg: string) {
    setErr(msg);
    setTimeout(() => setErr(null), 5000);
  }

  async function run(label: typeof busy, fn: () => Promise<void>) {
    if (!label || busy) return;
    setBusy(label);
    setErr(null);
    try {
      await fn();
    } catch (e) {
      flashError(`${label} failed: ${e}`);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="session-control">
      <button
        onClick={() => run("new", () => session.newSession())}
        disabled={!connected || busy != null}
        title="Start a fresh conversation (kills + respawns claude with no --continue/--resume)"
      >
        {busy === "new" ? "starting…" : "New"}
      </button>
      <button
        onClick={() => run("continue", () => session.continueSession())}
        disabled={!connected || busy != null}
        title="Continue the most recent session (--continue)"
      >
        {busy === "continue" ? "loading…" : "Continue"}
      </button>
      <input
        className="resume-input"
        type="text"
        placeholder="resume <session-id>"
        value={resumeId}
        onChange={(e) => setResumeId(e.target.value)}
        onPaste={(e) => {
          // Auto-fire on paste of a UUID-shaped string.
          const text = e.clipboardData.getData("text").trim();
          if (/^[0-9a-f-]{36}$/i.test(text)) {
            setResumeId(text);
            setTimeout(() => run("resume", () => session.resumeSession(text)), 0);
            e.preventDefault();
          }
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && resumeId.trim()) {
            run("resume", () => session.resumeSession(resumeId.trim()));
          }
        }}
        disabled={!connected || busy != null}
      />
      <button
        onClick={() => run("resume", () => session.resumeSession(resumeId.trim()))}
        disabled={!connected || busy != null || !resumeId.trim()}
        title="Resume a specific session by id (--resume)"
      >
        {busy === "resume" ? "resuming…" : "Resume"}
      </button>
      <button
        className="session-end"
        onClick={() => run("end", () => session.endSession())}
        disabled={!connected || busy != null}
        title="End the current session (end_session control_request)"
      >
        {busy === "end" ? "ending…" : "End"}
      </button>
      {err && <span className="session-err">{err}</span>}
      {init.sessionId == null && connected && (
        <span className="session-hint">no session yet — pick one</span>
      )}
    </div>
  );
}

// ---------- Tasks panel ----------
//
// Live view of every task the binary has emitted task_started for. Shows
// type, current activity, token/tool usage, elapsed time, and a Stop
// button while running. Sub-agent transcripts (if any) expand inline as
// raw frame entries — minimal styling, since our normal MessageRow
// renderer assumes a top-level timeline.

function TaskRow({ task }: { task: TaskEntry }) {
  const session = useCcSession();
  const [expanded, setExpanded] = useState(false);
  const [stopping, setStopping] = useState(false);
  const elapsed = task.lastUpdate - task.startTime;
  const elapsedStr = formatElapsed(elapsed);
  const running = task.status === "running";

  async function handleStop() {
    if (!running || stopping) return;
    setStopping(true);
    try { await session.stopTask(task.taskId); } catch {}
    setStopping(false);
  }

  return (
    <div className={"task-row task-" + task.status}>
      <div className="task-head" onClick={() => setExpanded((v) => !v)}>
        <span className="task-status-dot" />
        <span className="task-type">{task.taskType ?? "task"}</span>
        <span className="task-desc">{task.description || task.summary || task.taskId.slice(0, 12)}</span>
        {task.lastToolName && <span className="task-tool">→ {task.lastToolName}</span>}
        <span className="task-elapsed">{elapsedStr}</span>
        {task.usage?.toolUses != null && <span className="task-usage">{task.usage.toolUses} tools</span>}
        {task.usage?.totalTokens != null && (
          <span className="task-usage" title="Context-window load (input + cache + output) per the binary's getTokenCountFromUsage">
            {formatCtx(task.usage.totalTokens)} ctx
          </span>
        )}
        <span className={"task-status-tag " + task.status}>{task.status}</span>
        {running && (
          <button className="task-stop" disabled={stopping} onClick={(e) => { e.stopPropagation(); void handleStop(); }}>
            {stopping ? "stopping…" : "Stop"}
          </button>
        )}
        {task.transcript.length > 0 && <span className="task-transcript-toggle">{expanded ? "▾" : "▸"}</span>}
      </div>
      {expanded && task.transcript.length > 0 && (
        <div className="task-transcript">
          {task.transcript.map((entry) => (
            <div key={entry.id} className="task-frame">
              {summarizeSubAgentFrame(entry)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function summarizeSubAgentFrame(entry: MessageEntry): React.ReactNode {
  if (entry.kind !== "frame") return null;
  const ev: any = entry.frame;
  if (ev.type === "assistant" && Array.isArray(ev.message?.content)) {
    return ev.message.content.map((b: any, i: number) => {
      if (b.type === "text") return <div key={i} className="sub-text">{b.text}</div>;
      if (b.type === "tool_use") return <div key={i} className="sub-tool">→ <strong>{b.name}</strong> {JSON.stringify(b.input).slice(0, 120)}</div>;
      if (b.type === "thinking") return <div key={i} className="sub-thinking">✦ {(b.thinking || "").slice(0, 200)}</div>;
      return null;
    });
  }
  if (ev.type === "result") return <div className="sub-result">— turn complete ({ev.subtype ?? ""}) —</div>;
  if (ev.type === "system" && ev.subtype === "init") return <div className="sub-init">init · model={ev.model}</div>;
  return <div className="sub-misc">{ev.type}{ev.subtype ? ":" + ev.subtype : ""}</div>;
}

// Compact token-count formatter — agent contexts run six figures fast
// (cache_read dominates), so render in k for readability.
function formatCtx(n: number): string {
  if (n < 1000) return `${n}`;
  if (n < 100_000) return `${(n / 1000).toFixed(1)}k`;
  return `${Math.round(n / 1000)}k`;
}

function formatElapsed(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return `${m}m${s % 60}s`;
}

function LocalUserRow({ entry }: { entry: LocalUserEntry }) {
  return (
    <div className="row user">
      <div className="bubble">{entry.text}</div>
    </div>
  );
}

function FrameRow({
  entry,
  messages,
}: {
  entry: FrameEntry;
  messages: MessageEntry[];
}) {
  const ev: any = entry.frame;

  if (ev.type === "system" && ev.subtype === "init") return null; // shown in header

  if (ev.type === "assistant" && ev.message) {
    const content = ev.message.content;
    if (Array.isArray(content)) {
      return (
        <div className="row assistant">
          <div className="bubble" style={{ width: "80%" }}>
            {content.map((block: any, i: number) => (
              <ContentBlock key={i} block={block} messages={messages} />
            ))}
          </div>
        </div>
      );
    }
    if (typeof content === "string") {
      return (
        <div className="row assistant">
          <div className="bubble md"><Markdown>{content}</Markdown></div>
        </div>
      );
    }
  }

  if (ev.type === "result") {
    return <div className="debug">— turn complete ({ev.subtype ?? ""}) —</div>;
  }

  if (ev.type === "user" && Array.isArray(ev.message?.content)) {
    const onlyToolResults = ev.message.content.every((c: any) => c?.type === "tool_result");
    if (onlyToolResults) return null;
  }

  // !cmd / bash_command replays land here as user-role frames with
  // string content carrying the canonical <bash-input> echo or the
  // <bash-stdout>/<bash-stderr>/<bash-exit-code> output. Render them as
  // a terminal-style block so the chat scrollback mirrors the TUI.
  if (ev.type === "user" && ev.isReplay && typeof ev.message?.content === "string") {
    const c = ev.message.content as string;
    const inputMatch = c.match(/^<bash-input>([\s\S]*)<\/bash-input>$/);
    const outMatch = c.match(/<bash-stdout>([\s\S]*?)<\/bash-stdout>/);
    const errMatch = c.match(/<bash-stderr>([\s\S]*?)<\/bash-stderr>/);
    const rcMatch = c.match(/<bash-exit-code>([\s\S]*?)<\/bash-exit-code>/);
    const decode = (s: string) =>
      s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
    if (inputMatch) {
      return (
        <div className="row bash-row">
          <div className="bash-bubble bash-input-bubble">
            <span className="bash-prompt">$</span>
            <span className="bash-cmd">{decode(inputMatch[1] ?? "")}</span>
          </div>
        </div>
      );
    }
    if (outMatch || errMatch || rcMatch) {
      const stdout = decode(outMatch?.[1] ?? "");
      const stderr = decode(errMatch?.[1] ?? "");
      const rc = rcMatch?.[1] ?? "";
      return (
        <div className="row bash-row">
          <div className="bash-bubble bash-output-bubble">
            {stdout && <pre className="bash-stdout">{stdout}</pre>}
            {stderr && <pre className="bash-stderr">{stderr}</pre>}
            {rc && rc !== "0" && <span className="bash-exit">[exit {rc}]</span>}
          </div>
        </div>
      );
    }
  }

  if (ev.type === "rate_limit_event") return null;

  // can_use_tool widgets are rendered separately off the pendingPermissions
  // atom (the lib's permissions gate consumes the frame, so it doesn't reach
  // this code path).

  if (ev.type === "control_request" || ev.type === "control_response") {
    const rid = ev.request_id ?? ev.response?.request_id ?? "";
    const sub = ev.request?.subtype ?? ev.response?.subtype ?? "";
    return <div className="debug">{ev.type} {sub} {rid}</div>;
  }

  return <div className="debug">{ev.type}{ev.subtype ? ":" + ev.subtype : ""}</div>;
}

function ContentBlock({ block, messages }: { block: any; messages: MessageEntry[] }) {
  if (block.type === "text") {
    return <div className="md"><Markdown>{block.text || ""}</Markdown></div>;
  }
  if (block.type === "tool_use") {
    let result: any = null;
    for (const m of messages) {
      if (m.kind !== "frame") continue;
      const ev: any = m.frame;
      if (ev?.message?.content && Array.isArray(ev.message.content)) {
        for (const c of ev.message.content) {
          if (c?.type === "tool_result" && c.tool_use_id === block.id) {
            result = c;
          }
        }
      }
    }
    return (
      <details className="tool" open>
        <summary>
          tool_use · <strong>{block.name}</strong>
          <span className="status">{result ? (result.is_error ? "error" : "done") : "running…"}</span>
        </summary>
        <div style={{ marginTop: 6 }}>
          <div style={{ fontSize: 11, color: "#888" }}>input</div>
          <pre>{JSON.stringify(block.input, null, 2)}</pre>
          {result && (
            <>
              <div style={{ fontSize: 11, color: "#888", marginTop: 6 }}>result</div>
              <pre>{typeof result.content === "string" ? result.content : JSON.stringify(result.content, null, 2)}</pre>
            </>
          )}
        </div>
      </details>
    );
  }
  if (block.type === "thinking") {
    return <ThinkingBlockView text={block.thinking ?? ""} streaming={false} />;
  }
  return <div className="debug">block: {block.type}</div>;
}

function ThinkingBlockView({ text, streaming }: { text: string; streaming: boolean }) {
  // Default open while streaming so the user sees the trail of thought as
  // it arrives; collapsible afterwards so finalized turns can compact.
  return (
    <details className="thinking" open={streaming}>
      <summary>
        <span className="thinking-icon">✦</span> thinking
        {streaming && <span className="thinking-status">streaming…</span>}
      </summary>
      <div className="thinking-body">{text || "(no thoughts yet)"}{streaming && <span className="stream-cursor" />}</div>
    </details>
  );
}

function StreamingRow({ entry, isActive }: { entry: StreamingEntry; isActive: boolean }) {
  const msg: InFlightMessage = entry.msg;
  let lastTextIdx = -1;
  for (let i = msg.content.length - 1; i >= 0; i--) {
    if (msg.content[i]?.type === "text") {
      lastTextIdx = i;
      break;
    }
  }
  const showCursor = isActive && !msg.done;
  return (
    <div className="row assistant">
      <div className="bubble" style={{ width: "80%" }}>
        {msg.content.map((block: StreamingBlock | undefined, i: number) => {
          if (!block) return null;
          if (block.type === "text") {
            const trailing = showCursor && i === lastTextIdx;
            return (
              <div className="md" key={i}>
                <Markdown>{block.text || ""}</Markdown>
                {trailing && <span className="stream-cursor" />}
              </div>
            );
          }
          if (block.type === "tool_use") {
            return (
              <details className="tool" open key={i}>
                <summary>
                  tool_use · <strong>{block.name || "(naming…)"}</strong>
                  <span className="status">
                    {block._parsed ? "args ready" : "[streaming args…]"}
                  </span>
                </summary>
                <div style={{ marginTop: 6 }}>
                  <div style={{ fontSize: 11, color: "#888" }}>input</div>
                  <pre>
                    {block._parsed
                      ? JSON.stringify(block.input, null, 2)
                      : block._partialJson || "(no deltas yet)"}
                  </pre>
                </div>
              </details>
            );
          }
          if (block.type === "thinking") {
            const isLatest = i === msg.content.length - 1;
            return (
              <ThinkingBlockView
                key={i}
                text={block.thinking || ""}
                streaming={showCursor && isLatest}
              />
            );
          }
          return null;
        })}
        {showCursor && msg.content.length === 0 && <span className="stream-cursor" />}
      </div>
    </div>
  );
}

const root = createRoot(document.getElementById("root")!);
root.render(
  <CcSessionProvider session={session}>
    <App />
  </CcSessionProvider>,
);
