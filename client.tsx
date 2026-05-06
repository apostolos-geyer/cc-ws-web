import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import Markdown from "react-markdown";

// Anything we receive from the bridge.
type Event = any;

// In-flight assistant message reconstruction from `stream_event` SSE deltas.
// Mutated in-place via a ref + tick-bump for re-render — using setState here
// would batch-thrash given 50-100 deltas per assistant turn.
type TextBlock = { type: "text"; text: string };
type ToolUseBlock = {
  type: "tool_use";
  id: string;
  name: string;
  input: any;
  // Accumulated input_json_delta partial JSON, parsed at content_block_stop.
  _partialJson: string;
  // Set after a successful JSON.parse on stop, or cleared if parse fails.
  _parsed: boolean;
};
type ThinkingBlock = { type: "thinking"; thinking: string };
type StreamingBlock = TextBlock | ToolUseBlock | ThinkingBlock;
type InFlightMessage = {
  id: string;
  role: "assistant";
  model?: string;
  content: StreamingBlock[];
  done: boolean;
  // Order-of-arrival index so the renderer can slot streaming bubbles into
  // their natural chat-stream position.
  arrivalIdx: number;
};

// Hook-event entry, surfaced in a collapsible "Hooks" pane (out of the main
// chat per the plumbing-events convention — slopbox ADR-C002-2).
type HookEntry = {
  id: string;
  ts: number;
  subtype: string;
  // hook_event_name when present (e.g. "PreToolUse", "PostToolUse").
  hookName?: string;
  raw: any;
};

// Single source of truth for permission modes. `inCycle: true` means the
// entry participates in the Shift+Tab cycle (mirrors the binary's
// getNextPermissionMode at v2.1.132); array order IS the cycle order.
// Set `inCycle: false` for modes that are dropdown-selectable but not part
// of the rotation (e.g. dontAsk — the binary's switch falls back to default
// when it lands there).
const PERMISSION_MODE_DEFS = [
  { value: "default",           label: "Default (ask)",                    inCycle: true  },
  { value: "acceptEdits",       label: "Auto-accept edits",                inCycle: true  },
  { value: "plan",              label: "Plan mode (no tool execution)",    inCycle: true  },
  { value: "bypassPermissions", label: "Bypass all (dangerous)",           inCycle: true  },
  { value: "auto",              label: "Auto (classifier)",                inCycle: true  },
  { value: "dontAsk",           label: "Don't ask",                        inCycle: false },
] as const;

type PermissionMode = (typeof PERMISSION_MODE_DEFS)[number]["value"];
const PERMISSION_MODE_OPTIONS: { value: PermissionMode; label: string }[] =
  PERMISSION_MODE_DEFS.map((m) => ({ value: m.value, label: m.label }));
const KNOWN_PERMISSION_MODES: readonly PermissionMode[] =
  PERMISSION_MODE_DEFS.map((m) => m.value);
const CYCLE_ORDER: readonly PermissionMode[] = PERMISSION_MODE_DEFS
  .filter((m) => m.inCycle)
  .map((m) => m.value);

function nextCycleMode(current: PermissionMode): PermissionMode {
  const idx = CYCLE_ORDER.indexOf(current);
  if (idx === -1) return "default";
  return CYCLE_ORDER[(idx + 1) % CYCLE_ORDER.length]!;
}

// Single source of truth for selectable model names. set_model takes the
// model id verbatim; the binary resolves aliases. Order = display order.
const MODEL_DEFS = [
  { value: "claude-opus-4-7",   label: "Opus 4.7" },
  { value: "claude-opus-4-6",   label: "Opus 4.6" },
  { value: "claude-sonnet-4-6", label: "Sonnet 4.6" },
  { value: "claude-haiku-4-5",  label: "Haiku 4.5" },
] as const;
type Model = (typeof MODEL_DEFS)[number]["value"];
const MODEL_OPTIONS: { value: Model; label: string }[] =
  MODEL_DEFS.map((m) => ({ value: m.value, label: m.label }));
const KNOWN_MODELS: readonly Model[] = MODEL_DEFS.map((m) => m.value);

// Single source of truth for effort levels. The CLI accepts these via
// `--effort <level>` at launch only — there is no set_effort
// control_request, so changing effort mid-session triggers a respawn.
const EFFORT_DEFS = [
  { value: "low",    label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high",   label: "High" },
  { value: "max",    label: "Max" },
  { value: "xhigh",  label: "xHigh" },
] as const;
type Effort = (typeof EFFORT_DEFS)[number]["value"];
const EFFORT_OPTIONS: { value: Effort; label: string }[] =
  EFFORT_DEFS.map((e) => ({ value: e.value, label: e.label }));
const KNOWN_EFFORTS: readonly Effort[] = EFFORT_DEFS.map((e) => e.value);

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
    }
  | {
      kind: "set_model";
      model: Model;
      prevModel: Model | "";
      timeoutId: ReturnType<typeof setTimeout>;
    }
  | {
      kind: "respawn-effort";
      effort: Effort;
      prevEffort: Effort | "";
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

  // Model selector state. activeModel tracks what claude is actually using
  // (seeded from system:init.model when it matches a known value), and
  // pendingModel covers the optimistic in-flight set_model request window.
  const [activeModel, setActiveModel] = useState<Model | "">("");
  const [pendingModel, setPendingModel] = useState<Model | null>(null);
  const [modelError, setModelError] = useState<string | null>(null);
  const modelErrorClearRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Effort selector state. system:init does not carry effort, so
  // activeEffort starts blank ("(launch default)" placeholder) — operator
  // sets it explicitly. Pending tracks the respawn window.
  const [activeEffort, setActiveEffort] = useState<Effort | "">("");
  const [pendingEffort, setPendingEffort] = useState<Effort | null>(null);
  const [effortError, setEffortError] = useState<string | null>(null);
  const effortErrorClearRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  // Hook-event log (surfaced in the collapsible Hooks pane).
  const [hookEvents, setHookEvents] = useState<HookEntry[]>([]);
  const [hookExpanded, setHookExpanded] = useState(false);
  // Per-entry expansion for raw JSON details.
  const [hookOpenIds, setHookOpenIds] = useState<Record<string, boolean>>({});

  // In-flight streaming reconstruction. Mutable map keyed by message id; we
  // bump `streamTick` to force a re-render after each delta. Refs avoid the
  // setState batch-thrash that otherwise comes from 50-100 deltas per turn.
  const streamingRef = useRef<Map<string, InFlightMessage>>(new Map());
  // Monotonic counter used as `arrivalIdx` for InFlightMessage so the
  // renderer can slot streaming bubbles into their natural chat-stream
  // position (relative to events captured at that moment).
  const streamArrivalRef = useRef(0);
  // Most-recently-started in-flight message id — used to pin the "active"
  // streaming cursor.
  const activeStreamIdRef = useRef<string | null>(null);
  const [streamTick, setStreamTick] = useState(0);

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
      // Server-side respawn result for the effort selector. ok:true → swap
      // activeEffort to the in-flight effort and clear pendingEffort. The
      // post-respawn system:init that arrives shortly will also reseat the
      // model chip naturally.
      if (parsed?._local === "respawnResult" && typeof parsed.requestId === "string") {
        const flight = inFlightRef.current.get(parsed.requestId);
        if (flight && flight.kind === "respawn-effort") {
          inFlightRef.current.delete(parsed.requestId);
          clearTimeout(flight.timeoutId);
          if (parsed.ok === true) {
            setActiveEffort(flight.effort);
            setPendingEffort(null);
            setEffortError(null);
          } else {
            const errMsg = typeof parsed.error === "string" ? parsed.error : "unknown error";
            setPendingEffort(null);
            setEffortError(`could not change effort to ${flight.effort}: ${errMsg}`);
            if (effortErrorClearRef.current) clearTimeout(effortErrorClearRef.current);
            effortErrorClearRef.current = setTimeout(() => setEffortError(null), 5000);
          }
          // After a respawn we want the next system:init to re-seed the
          // chip / model, so allow it to be processed again.
          initSeenRef.current = false;
        }
        return;
      }
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
              // Auto-advance: if a forbidden mode (e.g. bypassPermissions
              // when the session wasn't launched with
              // --dangerously-skip-permissions) blocked us, skip to the
              // next cycle slot so cycling doesn't get stuck. Only triggers
              // for modes that participate in the cycle; explicit dropdown
              // picks of out-of-cycle modes (dontAsk) just surface the
              // error without auto-advancing.
              if (CYCLE_ORDER.includes(flight.mode)) {
                const skip = nextCycleMode(flight.mode);
                setModeError(`${flight.mode} not allowed (${errMsg}) — skipping to ${skip}`);
                if (errorClearRef.current) clearTimeout(errorClearRef.current);
                errorClearRef.current = setTimeout(() => setModeError(null), 5000);
                // Defer one tick so React commits pendingMode=null before
                // the next changeMode reads it.
                setTimeout(() => changeMode(skip), 0);
              } else {
                setModeError(`could not change to ${flight.mode}: ${errMsg}`);
                if (errorClearRef.current) clearTimeout(errorClearRef.current);
                errorClearRef.current = setTimeout(() => setModeError(null), 5000);
              }
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
          } else if (flight.kind === "set_model") {
            if (parsed.response.subtype === "success") {
              setActiveModel(flight.model);
              setPendingModel(null);
              setModelError(null);
            } else {
              const errMsg = parsed.response.error ?? "unknown error";
              setPendingModel(null);
              setModelError(`could not change model to ${flight.model}: ${errMsg}`);
              if (modelErrorClearRef.current) clearTimeout(modelErrorClearRef.current);
              modelErrorClearRef.current = setTimeout(() => setModelError(null), 5000);
            }
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
        if (typeof m === "string" && (KNOWN_PERMISSION_MODES as readonly string[]).includes(m)) {
          setActiveMode(m as PermissionMode);
        }
        // Seed activeModel from init.model if it matches a known value.
        // Otherwise leave it blank so the placeholder option shows.
        const im = typeof parsed.model === "string" ? parsed.model : "";
        if (im && (KNOWN_MODELS as readonly string[]).includes(im)) {
          setActiveModel(im as Model);
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
      // --- stream_event: incremental assistant tokens ----------------------
      // Reconstructs the same message shape that the final type:"assistant"
      // envelope will carry, so we can render tokens as they arrive and
      // swap to the canonical envelope on turn completion.
      if (parsed.type === "stream_event" && parsed.event && typeof parsed.event === "object") {
        const ev = parsed.event;
        try {
          if (ev.type === "message_start" && ev.message?.id) {
            const id = ev.message.id as string;
            streamingRef.current.set(id, {
              id,
              role: "assistant",
              model: ev.message.model,
              content: [],
              done: false,
              arrivalIdx: streamArrivalRef.current++,
            });
            activeStreamIdRef.current = id;
          } else if (ev.type === "content_block_start" && typeof ev.index === "number") {
            const id = activeStreamIdRef.current;
            const msg = id ? streamingRef.current.get(id) : null;
            if (msg) {
              const cb = ev.content_block ?? {};
              let block: StreamingBlock;
              if (cb.type === "tool_use") {
                block = {
                  type: "tool_use",
                  id: cb.id ?? "",
                  name: cb.name ?? "",
                  input: cb.input ?? {},
                  _partialJson: "",
                  _parsed: false,
                };
              } else if (cb.type === "thinking") {
                block = { type: "thinking", thinking: cb.thinking ?? "" };
              } else {
                // Default to text — covers the canonical text block and any
                // unknown/forward-compat block types defensively.
                block = { type: "text", text: cb.text ?? "" };
              }
              msg.content[ev.index] = block;
            }
          } else if (ev.type === "content_block_delta" && typeof ev.index === "number") {
            const id = activeStreamIdRef.current;
            const msg = id ? streamingRef.current.get(id) : null;
            if (msg) {
              const block = msg.content[ev.index];
              const delta = ev.delta ?? {};
              if (block?.type === "text" && delta.type === "text_delta" && typeof delta.text === "string") {
                block.text += delta.text;
              } else if (
                block?.type === "tool_use" &&
                delta.type === "input_json_delta" &&
                typeof delta.partial_json === "string"
              ) {
                block._partialJson += delta.partial_json;
              } else if (
                block?.type === "thinking" &&
                delta.type === "thinking_delta" &&
                typeof delta.thinking === "string"
              ) {
                block.thinking += delta.thinking;
              }
              // signature_delta and any unknown delta variants are silently
              // tolerated — they don't affect the rendered shape.
            }
          } else if (ev.type === "content_block_stop" && typeof ev.index === "number") {
            const id = activeStreamIdRef.current;
            const msg = id ? streamingRef.current.get(id) : null;
            const block = msg?.content[ev.index];
            if (block?.type === "tool_use" && !block._parsed) {
              if (block._partialJson) {
                try {
                  block.input = JSON.parse(block._partialJson);
                  block._parsed = true;
                } catch (err) {
                  console.warn("[stream_event] tool_use partial_json parse failed", err, block._partialJson);
                }
              } else {
                // No deltas arrived (rare — empty input). Mark parsed so the
                // UI flips off the "[streaming args…]" placeholder.
                block._parsed = true;
              }
            }
          } else if (ev.type === "message_stop") {
            const id = activeStreamIdRef.current;
            const msg = id ? streamingRef.current.get(id) : null;
            if (msg) msg.done = true;
          }
        } catch (err) {
          console.warn("[stream_event] handler error", err, ev);
        }
        setStreamTick((t) => t + 1);
        return; // do NOT push raw stream_event into the main events log
      }
      // --- hook events ----------------------------------------------------
      if (
        parsed.type === "system" &&
        typeof parsed.subtype === "string" &&
        (parsed.subtype === "hook_started" ||
          parsed.subtype === "hook_progress" ||
          parsed.subtype === "hook_response")
      ) {
        const entry: HookEntry = {
          id: crypto.randomUUID(),
          ts: Date.now(),
          subtype: parsed.subtype,
          hookName:
            typeof parsed.hook_event_name === "string"
              ? parsed.hook_event_name
              : typeof parsed.hookEventName === "string"
              ? parsed.hookEventName
              : undefined,
          raw: parsed,
        };
        setHookEvents((prev) => [...prev, entry]);
        return; // out of the main chat by default
      }
      // When the canonical assistant envelope arrives, swap out our in-flight
      // reconstruction (the envelope is authoritative).
      if (parsed.type === "assistant" && parsed.message?.id) {
        const id = parsed.message.id as string;
        if (streamingRef.current.has(id)) {
          streamingRef.current.delete(id);
          if (activeStreamIdRef.current === id) activeStreamIdRef.current = null;
          setStreamTick((t) => t + 1);
        }
      }
      setEvents((prev) => [...prev, parsed]);
    };
    return () => ws.close();
  }, []);

  // Auto-scroll on new events or streaming deltas.
  useEffect(() => {
    const el = mainRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [events.length, streamTick]);

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

  // Global Shift+Tab cycles permission modes, mirroring the TUI's
  // getNextPermissionMode (default → acceptEdits → plan → bypassPermissions
  // → auto → default). Skips while a set_permission_mode is in flight so
  // back-to-back presses don't queue stale changes.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.shiftKey || e.key !== "Tab") return;
      // Always preventDefault so focus stays put even while a previous
      // set_permission_mode is mid-flight; the browser otherwise reads our
      // no-op early-return as "no handler" and runs the focus-cycle default.
      e.preventDefault();
      if (pendingMode != null) return;
      changeMode(nextCycleMode(activeMode));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [activeMode, pendingMode]);

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

  function changeModel(next: Model) {
    if (!next) return;
    if (next === activeModel || pendingModel != null) return;
    const requestId = crypto.randomUUID();
    const prevModel = activeModel;
    setPendingModel(next);
    setModelError(null);
    if (modelErrorClearRef.current) {
      clearTimeout(modelErrorClearRef.current);
      modelErrorClearRef.current = null;
    }
    const timeoutId = setTimeout(() => {
      if (!inFlightRef.current.has(requestId)) return;
      inFlightRef.current.delete(requestId);
      setPendingModel(null);
      setModelError(`could not change model to ${next}: timed out after 30s`);
      if (modelErrorClearRef.current) clearTimeout(modelErrorClearRef.current);
      modelErrorClearRef.current = setTimeout(() => setModelError(null), 5000);
    }, 30_000);
    inFlightRef.current.set(requestId, {
      kind: "set_model",
      model: next,
      prevModel,
      timeoutId,
    });
    send({
      type: "control_request",
      request_id: requestId,
      request: { subtype: "set_model", model: next },
    });
  }

  function changeEffort(next: Effort) {
    if (!next) return;
    if (next === activeEffort || pendingEffort != null) return;
    const requestId = crypto.randomUUID();
    const prevEffort = activeEffort;
    setPendingEffort(next);
    setEffortError(null);
    if (effortErrorClearRef.current) {
      clearTimeout(effortErrorClearRef.current);
      effortErrorClearRef.current = null;
    }
    const timeoutId = setTimeout(() => {
      if (!inFlightRef.current.has(requestId)) return;
      inFlightRef.current.delete(requestId);
      setPendingEffort(null);
      setEffortError(`could not change effort to ${next}: timed out after 60s`);
      if (effortErrorClearRef.current) clearTimeout(effortErrorClearRef.current);
      effortErrorClearRef.current = setTimeout(() => setEffortError(null), 5000);
    }, 60_000);
    inFlightRef.current.set(requestId, {
      kind: "respawn-effort",
      effort: next,
      prevEffort,
      timeoutId,
    });
    // Local frame; never reaches claude. Server kills the existing child
    // and respawns it with extraArgs appended to BASE_CLAUDE_ARGS.
    send({ _local: "respawn", extraArgs: ["--effort", next], requestId });
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

  // Snapshot in-flight streaming messages (sorted by arrival order) for render.
  // The streamTick dependency is the force-render signal — each delta bumps
  // it. Reading the ref here is intentional; the cost is small (≤1 active
  // message in normal flow) and avoids a parallel state copy.
  void streamTick;
  const streamingList: InFlightMessage[] = Array.from(streamingRef.current.values()).sort(
    (a, b) => a.arrivalIdx - b.arrivalIdx,
  );
  const activeStreamId = activeStreamIdRef.current;

  return (
    <>
      <header>
        <div className="chip">
          {connected ? (init ? `model: ${init.model ?? "?"} · cwd: ${init.cwd ?? "?"}` : "connected, waiting for init…") : "disconnected"}
        </div>
        <button onClick={interrupt} disabled={!connected}>Interrupt</button>
      </header>
      <main ref={mainRef}>
        {events.map((ev, i) => (
          <EventRow key={i} ev={ev} pendingPerms={pendingPerms} respondPerm={respondPerm} allEvents={events} />
        ))}
        {streamingList.map((msg) => (
          <StreamingRow key={msg.id} msg={msg} isActive={msg.id === activeStreamId} />
        ))}
      </main>
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
            onChange={(e) => changeModel(e.target.value as Model)}
            disabled={!connected || pendingModel != null}
            title="Model (set_model control_request, in-process)"
          >
            <option value="">(model)</option>
            {MODEL_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          <select
            className="mode-select"
            value={pendingEffort ?? activeEffort}
            onChange={(e) => changeEffort(e.target.value as Effort)}
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
        </div>
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

function StreamingRow({ msg, isActive }: { msg: InFlightMessage; isActive: boolean }) {
  // Index of the LAST text block — the cursor sits at its tail while we're
  // the active streaming message and the turn isn't done yet.
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
        {msg.content.map((block, i) => {
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
            return (
              <div className="debug" key={i}>
                [thinking] {(block.thinking || "").slice(0, 200)}
                {showCursor && i === msg.content.length - 1 ? "▍" : "…"}
              </div>
            );
          }
          return null;
        })}
        {/* Empty-content edge case: show cursor anyway so the bubble isn't blank. */}
        {showCursor && msg.content.length === 0 && <span className="stream-cursor" />}
      </div>
    </div>
  );
}

const root = createRoot(document.getElementById("root")!);
root.render(<App />);
