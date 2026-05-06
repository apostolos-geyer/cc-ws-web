import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import Markdown from "react-markdown";

// Anything we receive from the bridge.
type Event = any;

type PermissionMode = "default" | "acceptEdits" | "bypassPermissions" | "plan" | "dontAsk";

const PERMISSION_MODE_OPTIONS: { value: PermissionMode; label: string }[] = [
  { value: "default", label: "Default (ask)" },
  { value: "acceptEdits", label: "Auto-accept edits" },
  { value: "bypassPermissions", label: "Bypass all (dangerous)" },
  { value: "plan", label: "Plan mode (no tool execution)" },
  { value: "dontAsk", label: "Don't ask" },
];

// In-flight control_request tracker.
//   set_permission_mode  → updates UI mode on success.
//   file_suggestions     → fills the @-mention dropdown when the doubly-nested
//                          response payload arrives. We keep callers as
//                          closures so stale ones (request superseded by a
//                          newer keystroke) can be discarded.
type InFlight =
  | {
      kind: "set_permission_mode";
      mode: PermissionMode;
      prevMode: PermissionMode;
      timeoutId: ReturnType<typeof setTimeout>;
    }
  | {
      kind: "file_suggestions";
      query: string;
      onSuccess: (payload: any) => void;
      timeoutId: ReturnType<typeof setTimeout>;
    };

// Shell mode local-output entry rendered below the input.
type ShellOutput = {
  id: string;
  command: string;
  // Source mode: 'context' = local Bun.spawn via {_local:"shell"} (claude
  // sees it on the next turn); 'sideChannel' = bash_command wire frame
  // (claude does NOT see the output).
  source: "context" | "sideChannel";
  // Accumulated output text. For context-mode we set it once when the
  // shellResult frame arrives; for side-channel mode the CLI may stream
  // multiple chunks per command, so we accumulate by id (we mint the id
  // client-side and reuse the same one for the request frame's `uuid` so we
  // can later correlate if the binary echoes it back; for now we just stash
  // all subsequent bash-output events under the most-recent shell command —
  // empirically the binary doesn't tag them).
  chunks: string[];
};

// Three-state shell mode. 'off' is the default text-prompt mode.
type ShellMode = "off" | "context" | "sideChannel";

// In-flight context-shell command awaiting server reply, keyed by requestId.
type PendingContextShell = {
  command: string;
  followUp: string;
  outputId: string;
};

// @-mention dropdown item.
type MentionItem =
  | { kind: "agent"; name: string }
  | { kind: "file"; path: string };

// /-command dropdown item.
type CommandItem =
  | { kind: "command"; name: string }
  | { kind: "skill"; name: string };

function App() {
  const [events, setEvents] = useState<Event[]>([]);
  const [input, setInput] = useState("");
  const [connected, setConnected] = useState(false);
  const [pendingPerms, setPendingPerms] = useState<Record<string, Event>>({});
  const [activeMode, setActiveMode] = useState<PermissionMode>("default");
  const [pendingMode, setPendingMode] = useState<PermissionMode | null>(null);
  const [modeError, setModeError] = useState<string | null>(null);

  // !/@// affordance state.
  const [shellMode, setShellMode] = useState<ShellMode>("off");
  const [shellOutputs, setShellOutputs] = useState<ShellOutput[]>([]);
  const [agents, setAgents] = useState<string[]>([]);
  const [slashCommands, setSlashCommands] = useState<string[]>([]);
  const [skills, setSkills] = useState<string[]>([]);
  // Cursor index into `input` where the active `@` or `/` lives.
  const [mentionStart, setMentionStart] = useState<number | null>(null);
  const [mentionMatches, setMentionMatches] = useState<MentionItem[]>([]);
  const [commandStart, setCommandStart] = useState<number | null>(null);
  const [commandMatches, setCommandMatches] = useState<CommandItem[]>([]);
  // Highlighted index in whichever dropdown is open.
  const [dropdownIndex, setDropdownIndex] = useState(0);

  const inFlightRef = useRef<Map<string, InFlight>>(new Map());
  const initSeenRef = useRef(false);
  const errorClearRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const mainRef = useRef<HTMLElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const fileSuggestDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Keep the last requested file_suggestions query so the dropdown only shows
  // matches from the freshest in-flight request.
  const latestFileQueryRef = useRef<string>("");
  // Stable id of the most recent side-channel shell command, used to bucket
  // bash-stdout/stderr replay events from the CLI.
  const activeShellIdRef = useRef<string | null>(null);
  // requestId → pending context-shell metadata (command, optional follow-up
  // prompt, the ShellOutput id we're filling in). Cleared when the
  // matching `_local:"shellResult"` frame arrives.
  const pendingContextShellRef = useRef<Map<string, PendingContextShell>>(new Map());

  useEffect(() => {
    const ws = new WebSocket(`ws://${location.host}/ws`);
    wsRef.current = ws;
    ws.onopen = () => setConnected(true);
    ws.onclose = () => setConnected(false);
    ws.onerror = (e) => console.error("ws error", e);
    ws.onmessage = (e) => {
      let parsed: Event;
      try {
        parsed = JSON.parse(e.data);
      } catch {
        console.warn("non-json frame", e.data);
        return;
      }
      console.log("[recv]", parsed);
      // Server-side context-shell result. Match by requestId, fill in the
      // ShellOutput entry, then construct + send an SDKUserMessage so the
      // model sees the command + output on its next turn. Optional follow-up
      // text typed after the command on subsequent input lines is appended.
      if (parsed?._local === "shellResult" && typeof parsed.requestId === "string") {
        const pending = pendingContextShellRef.current.get(parsed.requestId);
        if (pending) {
          pendingContextShellRef.current.delete(parsed.requestId);
          const stdout = typeof parsed.stdout === "string" ? parsed.stdout : "";
          const stderr = typeof parsed.stderr === "string" ? parsed.stderr : "";
          const exitCode = typeof parsed.exitCode === "number" ? parsed.exitCode : -1;
          // Render in the shell panel for the operator's reference.
          const parts: string[] = [];
          if (stdout) parts.push(stdout);
          if (stderr) parts.push("[stderr]\n" + stderr);
          parts.push(`[exit ${exitCode}]`);
          const renderedOutput = parts.join("\n");
          setShellOutputs((prev) =>
            prev.map((s) =>
              s.id === pending.outputId ? { ...s, chunks: [renderedOutput] } : s
            )
          );
          // Build the SDKUserMessage payload for claude.
          const summary =
            "```sh\n" +
            `$ ${pending.command}\n` +
            stdout +
            (stderr ? "\n[stderr]\n" + stderr : "") +
            `\n[exit ${exitCode}]\n` +
            "```" +
            (pending.followUp ? "\n\n" + pending.followUp : "");
          // Mirror the user's bubble in the local event log so they can see
          // what was sent — match the standard sendPrompt() pattern.
          setEvents((prev) => [...prev, { type: "_local_user", text: summary }]);
          const ws = wsRef.current;
          if (ws && ws.readyState === WebSocket.OPEN) {
            const frame = { type: "user", message: { role: "user", content: summary } };
            console.log("[send]", frame);
            // NDJSON framing — match the existing user-message Send code's
            // "one frame per line" expectation downstream.
            ws.send(JSON.stringify(frame) + "\n");
          }
        }
        return;
      }
      if (parsed.type === "control_request" && parsed.request?.subtype === "can_use_tool") {
        setPendingPerms((p) => ({ ...p, [parsed.request_id]: parsed }));
      }
      if (parsed.type === "control_response" && parsed.response?.request_id) {
        const id = parsed.response.request_id;
        // Tear down any pending can_use_tool widget if the response is matching.
        setPendingPerms((p) => {
          if (!(id in p)) return p;
          const { [id]: _gone, ...rest } = p;
          return rest;
        });
        // Match against our control-request in-flight Map.
        const flight = inFlightRef.current.get(id);
        if (flight) {
          inFlightRef.current.delete(id);
          clearTimeout(flight.timeoutId);
          if (flight.kind === "set_permission_mode") {
            if (parsed.response.subtype === "success") {
              setActiveMode(flight.mode);
              setPendingMode(null);
              setModeError(null);
            } else {
              const errMsg = parsed.response.error ?? "unknown error";
              setPendingMode(null);
              setModeError(`could not change to ${flight.mode}: ${errMsg}`);
              if (errorClearRef.current) clearTimeout(errorClearRef.current);
              errorClearRef.current = setTimeout(() => setModeError(null), 5000);
            }
          } else if (flight.kind === "file_suggestions") {
            if (parsed.response.subtype === "success") {
              // Per the schema raw zod body, success carries response.response
              // as { suggestions: Array<{path, score?}> }. Be defensive in
              // case the binary nests it differently in practice.
              const inner = parsed.response.response ?? parsed.response;
              flight.onSuccess(inner);
            }
            // No UI action on error — operator just gets no matches.
          }
        }
      }
      // Capture initial system:init payload (first one only) — model/mode chip
      // plus the agents/slash_commands/skills arrays we render in dropdowns.
      if (
        !initSeenRef.current &&
        parsed.type === "system" &&
        parsed.subtype === "init"
      ) {
        initSeenRef.current = true;
        const m = parsed.permissionMode ?? parsed.permission_mode;
        const known: PermissionMode[] = [
          "default",
          "acceptEdits",
          "bypassPermissions",
          "plan",
          "dontAsk",
        ];
        if (typeof m === "string" && (known as string[]).includes(m)) {
          setActiveMode(m as PermissionMode);
        }
        if (Array.isArray(parsed.agents)) setAgents(parsed.agents);
        if (Array.isArray(parsed.slash_commands)) setSlashCommands(parsed.slash_commands);
        if (Array.isArray(parsed.skills)) setSkills(parsed.skills);
        console.log("[init] agents", parsed.agents, "slash", parsed.slash_commands, "skills", parsed.skills);
      }
      // Bash command echo & output. Empirically the CLI does NOT emit
      // local_command_output for `bash_command`; instead it round-trips two
      // user-role events with isReplay:true:
      //   1. <bash-input>$cmd</bash-input>           (echo of the command)
      //   2. <bash-stdout>$out</bash-stdout>
      //      <bash-stderr>$err</bash-stderr>
      //      <bash-exit-code>$rc</bash-exit-code>     (combined output)
      // These are technically in the conversation transcript (the binary
      // re-injects them on resume), but per the schema's "input-only,
      // output not appended to assistant transcript" semantics we surface
      // them in the shell panel and suppress them from the main log.
      if (parsed.type === "user" && parsed.isReplay && typeof parsed.message?.content === "string") {
        const c = parsed.message.content as string;
        const stdoutMatch = c.match(/<bash-stdout>([\s\S]*?)<\/bash-stdout>/);
        const stderrMatch = c.match(/<bash-stderr>([\s\S]*?)<\/bash-stderr>/);
        const exitMatch = c.match(/<bash-exit-code>([\s\S]*?)<\/bash-exit-code>/);
        if (stdoutMatch || stderrMatch || exitMatch) {
          if (activeShellIdRef.current) {
            const id = activeShellIdRef.current;
            // HTML-decode the few entities we know the CLI escapes (&amp;
            // shows up in commands like `cmd1 && cmd2`).
            const decode = (s: string) =>
              s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
            const parts: string[] = [];
            if (stdoutMatch?.[1]) parts.push(decode(stdoutMatch[1]));
            const stderrText = stderrMatch?.[1];
            if (stderrText && stderrText.length > 0) parts.push("[stderr] " + decode(stderrText));
            const rc = exitMatch?.[1];
            if (rc && rc !== "0") parts.push(`[exit ${rc}]`);
            const chunk = parts.join("\n");
            setShellOutputs((prev) =>
              prev.map((s) => (s.id === id ? { ...s, chunks: [...s.chunks, chunk] } : s))
            );
          }
          return; // suppress from event log
        }
        if (c.startsWith("<bash-input>") && c.endsWith("</bash-input>")) {
          // Pure input echo — already shown in our shell-panel header, drop it.
          return;
        }
      }
      // Reserve also for the schema-blessed local_command_output channel,
      // in case the binary uses it for some `!cmd` variants we haven't hit.
      if (
        parsed.type === "system" &&
        parsed.subtype === "local_command_output" &&
        activeShellIdRef.current
      ) {
        const id = activeShellIdRef.current;
        setShellOutputs((prev) =>
          prev.map((s) =>
            s.id === id ? { ...s, chunks: [...s.chunks, String(parsed.content ?? "")] } : s
          )
        );
        return;
      }
      setEvents((prev) => [...prev, parsed]);
    };
    return () => ws.close();
  }, []);

  // Auto-scroll on new events.
  useEffect(() => {
    const el = mainRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [events.length]);

  // Global Cmd+Shift+1 (== Cmd+! on US layouts) toggles side-channel shell
  // mode. We use `e.code === 'Digit1'` rather than `e.key === '!'` because
  // on macOS Chrome the keypress with Cmd+Shift held emits `key === '1'`
  // (Cmd suppresses Shift's symbol layer for printable keys), and Digit1 is
  // the layout-stable codepoint regardless. Cmd+Shift+1 toggles to
  // sideChannel; pressing again with sideChannel active drops to off.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.metaKey || !e.shiftKey || e.code !== "Digit1") return;
      e.preventDefault();
      setShellMode((m) => (m === "sideChannel" ? "off" : "sideChannel"));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function send(frame: any) {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    const line = JSON.stringify(frame);
    console.log("[send]", frame);
    ws.send(line);
  }

  function sendBashCommand(command: string) {
    // Side-channel: top-level wire type, NOT wrapped in control_request.
    // Output comes back out-of-band as user/isReplay <bash-stdout> events
    // (or system:local_command_output) and is NOT visible to claude per the
    // schema's input-only @internal note.
    const id = crypto.randomUUID();
    activeShellIdRef.current = id;
    setShellOutputs((prev) => [
      ...prev,
      { id, command, source: "sideChannel", chunks: [] },
    ]);
    send({ type: "bash_command", command });
  }

  function sendContextShell(command: string, followUp: string) {
    // Context-shell: server runs the command via Bun.spawn and returns
    // stdout/stderr/exit; we then synthesize an SDKUserMessage so claude
    // sees the command + output on its next turn (TUI !cmd muscle memory).
    const requestId = crypto.randomUUID();
    const outputId = crypto.randomUUID();
    pendingContextShellRef.current.set(requestId, { command, followUp, outputId });
    setShellOutputs((prev) => [
      ...prev,
      { id: outputId, command, source: "context", chunks: [] },
    ]);
    send({ _local: "shell", command, requestId });
  }

  function sendPrompt() {
    const text = input.trim();
    if (!text) return;

    // Context-shell mode: command on first line (leading `!` consumed if
    // present); any subsequent lines become an optional follow-up prompt
    // appended after the fenced output block in the SDKUserMessage we
    // synthesize on shellResult. Closes shell mode after send so the
    // operator doesn't accidentally repeat-fire shell commands.
    if (shellMode === "context") {
      // Use the raw input here (not `text`, which was trimmed) so we don't
      // collapse a deliberately blank first line. We still expect the
      // command on line 1 in practice.
      const lines = input.split("\n");
      const firstRaw = lines[0] ?? "";
      const first = firstRaw.startsWith("!") ? firstRaw.slice(1).trimStart() : firstRaw.trim();
      const followUp = lines.slice(1).join("\n").trim();
      if (first) sendContextShell(first, followUp);
      setInput("");
      setShellMode("off");
      closeAllDropdowns();
      return;
    }

    // Side-channel shell mode: legacy bash_command path, claude does NOT
    // see the output. Same `!`-prefix consumption rule for muscle memory.
    if (shellMode === "sideChannel") {
      const cmd = text.startsWith("!") ? text.slice(1).trimStart() : text;
      if (cmd) sendBashCommand(cmd);
      setInput("");
      setShellMode("off");
      closeAllDropdowns();
      return;
    }

    setEvents((prev) => [...prev, { type: "_local_user", text }]);
    send({ type: "user", message: { role: "user", content: text } });
    setInput("");
    closeAllDropdowns();
  }

  function interrupt() {
    send({ type: "control_request", request_id: crypto.randomUUID(), request: { subtype: "interrupt" } });
  }

  function changeMode(next: PermissionMode) {
    if (next === activeMode || pendingMode != null) return;
    const requestId = crypto.randomUUID();
    const prevMode = activeMode;
    setPendingMode(next);
    setModeError(null);
    if (errorClearRef.current) {
      clearTimeout(errorClearRef.current);
      errorClearRef.current = null;
    }
    const timeoutId = setTimeout(() => {
      if (!inFlightRef.current.has(requestId)) return;
      inFlightRef.current.delete(requestId);
      setPendingMode(null);
      setModeError(`could not change to ${next}: timed out after 10s`);
      if (errorClearRef.current) clearTimeout(errorClearRef.current);
      errorClearRef.current = setTimeout(() => setModeError(null), 5000);
    }, 10_000);
    inFlightRef.current.set(requestId, {
      kind: "set_permission_mode",
      mode: next,
      prevMode,
      timeoutId,
    });
    send({
      type: "control_request",
      request_id: requestId,
      request: { subtype: "set_permission_mode", mode: next },
    });
  }

  function respondPerm(req: Event, behavior: "allow" | "deny") {
    const inner =
      behavior === "allow"
        ? { behavior: "allow" as const, updatedInput: req.request?.input ?? req.input ?? {} }
        : { behavior: "deny" as const, message: "Denied by user" };
    send({
      type: "control_response",
      response: {
        subtype: "success",
        request_id: req.request_id,
        response: inner,
      },
    });
    setPendingPerms((p) => {
      const { [req.request_id]: _g, ...rest } = p;
      return rest;
    });
  }

  // ---- !/@// affordance helpers --------------------------------------

  function closeAllDropdowns() {
    setMentionStart(null);
    setMentionMatches([]);
    setCommandStart(null);
    setCommandMatches([]);
    setDropdownIndex(0);
  }

  function dismissShellOutput(id: string) {
    setShellOutputs((prev) => prev.filter((s) => s.id !== id));
  }

  function requestFileSuggestions(query: string) {
    latestFileQueryRef.current = query;
    const requestId = crypto.randomUUID();
    const timeoutId = setTimeout(() => {
      inFlightRef.current.delete(requestId);
    }, 5000);
    inFlightRef.current.set(requestId, {
      kind: "file_suggestions",
      query,
      onSuccess: (payload) => {
        // Stale-response guard: if a newer keystroke fired since this request,
        // drop this payload on the floor.
        if (latestFileQueryRef.current !== query) return;
        const sugg = Array.isArray(payload?.suggestions) ? payload.suggestions : [];
        // Combine with agents (only when query has no path-shaped chars).
        const isPathy = query.includes("/") || query.includes(".");
        const ql = query.toLowerCase();
        const agentMatches: MentionItem[] = isPathy
          ? []
          : agents
              .filter((a) => !ql || a.toLowerCase().includes(ql))
              .map((name) => ({ kind: "agent" as const, name }));
        const fileMatches: MentionItem[] = sugg
          .filter((s: any) => typeof s?.path === "string")
          .map((s: any) => ({ kind: "file" as const, path: s.path }));
        const combined = [...agentMatches.slice(0, 5), ...fileMatches.slice(0, 15)];
        setMentionMatches(combined);
        setDropdownIndex(0);
      },
      timeoutId,
    });
    send({
      type: "control_request",
      request_id: requestId,
      request: { subtype: "file_suggestions", query },
    });
  }

  // Compute matches synchronously for `@` with no query (agents only) and `/`.
  function computeAgentOnlyMatches(): MentionItem[] {
    return agents.slice(0, 8).map((name) => ({ kind: "agent" as const, name }));
  }

  function computeCommandMatches(query: string): CommandItem[] {
    const ql = query.toLowerCase();
    const cmdItems: CommandItem[] = slashCommands
      .filter((n) => !ql || n.toLowerCase().includes(ql))
      .map((name) => ({ kind: "command" as const, name }));
    const skillItems: CommandItem[] = skills
      .filter((n) => !ql || n.toLowerCase().includes(ql))
      .map((name) => ({ kind: "skill" as const, name }));
    return [...cmdItems, ...skillItems].slice(0, 20);
  }

  // Re-derive autocomplete state from the input + caret position. Called from
  // onChange and onKeyUp / onClick on the textarea.
  function refreshAutocomplete(value: string, caret: number) {
    // `/` autocomplete: only when the input STARTS with `/` and caret is
    // within the leading slash-token. This matches CLI behavior — a slash
    // anywhere else is just literal text.
    if (value.startsWith("/")) {
      // Find end of slash-token (first whitespace, or eol).
      const ws = value.search(/\s/);
      const tokenEnd = ws === -1 ? value.length : ws;
      if (caret <= tokenEnd) {
        const query = value.slice(1, caret);
        setCommandStart(0);
        setCommandMatches(computeCommandMatches(query));
        setDropdownIndex(0);
        // Make sure mention dropdown isn't competing.
        setMentionStart(null);
        setMentionMatches([]);
        return;
      }
    }
    setCommandStart(null);
    setCommandMatches([]);

    // `@` autocomplete: scan back from caret to find an unbroken
    // non-whitespace `@`-prefixed token. Only trigger if the `@` is at start
    // of input or preceded by whitespace.
    let i = caret - 1;
    while (i >= 0 && !/\s/.test(value[i]!)) i--;
    const tokenStart = i + 1;
    const tokenSlice = value.slice(tokenStart, caret);
    if (tokenSlice.startsWith("@")) {
      const query = tokenSlice.slice(1);
      setMentionStart(tokenStart);
      // Empty / non-pathy query: agents only synchronously.
      const isPathy = query.includes("/") || query.includes(".");
      if (!query) {
        setMentionMatches(computeAgentOnlyMatches());
        setDropdownIndex(0);
        latestFileQueryRef.current = ""; // disarm any stale file response
      } else if (!isPathy) {
        // Show agents immediately (synchronous), fire file_suggestions
        // request in the background; the response handler will merge in
        // file matches.
        setMentionMatches(
          agents
            .filter((a) => a.toLowerCase().includes(query.toLowerCase()))
            .slice(0, 8)
            .map((name) => ({ kind: "agent" as const, name }))
        );
        setDropdownIndex(0);
        scheduleFileSuggestions(query);
      } else {
        // Pathy query: skip agents, fire file request.
        setMentionMatches([]);
        setDropdownIndex(0);
        scheduleFileSuggestions(query);
      }
      return;
    }
    setMentionStart(null);
    setMentionMatches([]);
  }

  function scheduleFileSuggestions(query: string) {
    if (fileSuggestDebounceRef.current) clearTimeout(fileSuggestDebounceRef.current);
    fileSuggestDebounceRef.current = setTimeout(() => {
      requestFileSuggestions(query);
    }, 150);
  }

  // Apply a selected dropdown item to the input.
  function applyMention(item: MentionItem) {
    if (mentionStart == null) return;
    // Find current end of the @-token (caret might have advanced; we just
    // replace from mentionStart to next whitespace / eol).
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
    // Replace the leading slash-token with `/<name> `.
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

  // Whichever dropdown is open right now (mutually exclusive).
  const dropdownOpen: "mention" | "command" | null =
    mentionStart != null && mentionMatches.length > 0
      ? "mention"
      : commandStart != null && commandMatches.length > 0
      ? "command"
      : null;

  function handleTextareaKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // Esc closes any open dropdown OR exits shell mode (in that order).
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

    // Backspace-at-start while a shell mode is active drops us back to
    // text-prompt mode without sending. Watching keydown lets us catch the
    // empty-input case before onChange fires.
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
    // Auto-enter context-shell mode when input STARTS with `!` and we're
    // currently off. We strip the bang from the visible input — the chip
    // tells the user this is a shell command, so the leading `!` would be
    // duplicate signal. (Side-channel mode is entered only via Cmd+Shift+1
    // — see the global keydown listener.)
    if (shellMode === "off" && next.startsWith("!")) {
      setShellMode("context");
      setInput(next.slice(1));
      e.target.value = next.slice(1);
      // No autocomplete in shell mode.
      closeAllDropdowns();
      return;
    }
    setInput(next);
    refreshAutocomplete(next, e.target.selectionStart ?? next.length);
  }

  function handleTextareaCaret(e: React.SyntheticEvent<HTMLTextAreaElement>) {
    // Re-evaluate autocomplete on cursor moves (arrow keys, clicks). Without
    // this, e.g. arrowing back to mid-`@token` wouldn't reopen the dropdown.
    const ta = e.currentTarget;
    refreshAutocomplete(ta.value, ta.selectionStart ?? ta.value.length);
  }

  // Pre-compute init system event for the header chip.
  const init = events.find((e) => e.type === "system" && e.subtype === "init");

  return (
    <>
      <header>
        <div className="chip">
          {connected ? (init ? `model: ${init.model ?? "?"} · cwd: ${init.cwd ?? "?"}` : "connected, waiting for init…") : "disconnected"}
        </div>
        <div className="mode-control">
          <select
            className="mode-select"
            value={pendingMode ?? activeMode}
            onChange={(e) => changeMode(e.target.value as PermissionMode)}
            disabled={!connected || pendingMode != null}
            title="Permission mode"
          >
            {PERMISSION_MODE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          {modeError && <span className="mode-error">{modeError}</span>}
        </div>
        <button onClick={interrupt} disabled={!connected}>Interrupt</button>
      </header>
      <main ref={mainRef}>
        {events.map((ev, i) => (
          <EventRow key={i} ev={ev} pendingPerms={pendingPerms} respondPerm={respondPerm} allEvents={events} />
        ))}
      </main>
      {shellOutputs.length > 0 && (
        <div className="shell-panel">
          {shellOutputs.map((s) => (
            <div className="shell-entry" key={s.id}>
              <div className="shell-head">
                <span className="shell-prompt">$</span>
                <span className="shell-cmd">{s.command}</span>
                <span className={"shell-source " + s.source}>
                  {s.source === "context" ? "context" : "side-channel"}
                </span>
                <button className="shell-dismiss" onClick={() => dismissShellOutput(s.id)} title="Dismiss">×</button>
              </div>
              {s.chunks.length > 0 && (
                <pre className="shell-out">{s.chunks.join("")}</pre>
              )}
            </div>
          ))}
        </div>
      )}
      <footer>
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
              // Slight delay so click on dropdown can land first.
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
      </footer>
    </>
  );
}

function EventRow({
  ev,
  pendingPerms,
  respondPerm,
  allEvents,
}: {
  ev: Event;
  pendingPerms: Record<string, Event>;
  respondPerm: (req: Event, b: "allow" | "deny") => void;
  allEvents: Event[];
}) {
  if (ev.type === "_local_user") {
    return (
      <div className="row user">
        <div className="bubble">{ev.text}</div>
      </div>
    );
  }

  if (ev.type === "system" && ev.subtype === "init") {
    return null; // shown in header
  }

  if (ev.type === "assistant" && ev.message) {
    const content = ev.message.content;
    if (Array.isArray(content)) {
      return (
        <div className="row assistant">
          <div className="bubble" style={{ width: "80%" }}>
            {content.map((block: any, i: number) => <ContentBlock key={i} block={block} allEvents={allEvents} />)}
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

  // CLI emits a "user" event with tool_result blocks echoing what it fed back into
  // the conversation. We already inline these into the matching tool_use card, so
  // suppress the standalone row.
  if (ev.type === "user" && Array.isArray(ev.message?.content)) {
    const onlyToolResults = ev.message.content.every((c: any) => c?.type === "tool_result");
    if (onlyToolResults) return null;
  }

  if (ev.type === "rate_limit_event") {
    return null; // noise
  }

  if (ev.type === "control_request" && ev.request?.subtype === "can_use_tool" && pendingPerms[ev.request_id]) {
    return (
      <div className="perm">
        <div><strong>Tool permission requested</strong>: {ev.request?.tool_name ?? "?"}</div>
        <pre style={{ fontSize: 12, whiteSpace: "pre-wrap" }}>{JSON.stringify(ev.request?.input ?? {}, null, 2)}</pre>
        <button className="approve" onClick={() => respondPerm(ev, "allow")}>Approve</button>
        <button className="deny" onClick={() => respondPerm(ev, "deny")}>Deny</button>
      </div>
    );
  }

  if (ev.type === "control_request" || ev.type === "control_response") {
    const rid = ev.request_id ?? ev.response?.request_id ?? "";
    const sub = ev.request?.subtype ?? ev.response?.subtype ?? "";
    return <div className="debug">{ev.type} {sub} {rid}</div>;
  }

  return <div className="debug">{ev.type}{ev.subtype ? ":" + ev.subtype : ""}</div>;
}

function ContentBlock({ block, allEvents }: { block: any; allEvents: Event[] }) {
  if (block.type === "text") {
    return <div className="md"><Markdown>{block.text || ""}</Markdown></div>;
  }
  if (block.type === "tool_use") {
    let result: any = null;
    for (const ev of allEvents) {
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
    return <div className="debug">[thinking] {block.thinking?.slice(0, 100)}…</div>;
  }
  return <div className="debug">block: {block.type}</div>;
}

const root = createRoot(document.getElementById("root")!);
root.render(<App />);
