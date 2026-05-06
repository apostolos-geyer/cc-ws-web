import React, { useEffect, useRef, useState } from "react";
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

// In-flight control_request tracker. Currently only set_permission_mode is
// correlated through here; can_use_tool replies stay in pendingPerms because
// the human is the slow async actor.
type InFlight = {
  kind: "set_permission_mode";
  mode: PermissionMode;
  prevMode: PermissionMode;
  timeoutId: ReturnType<typeof setTimeout>;
};

function App() {
  const [events, setEvents] = useState<Event[]>([]);
  const [input, setInput] = useState("");
  const [connected, setConnected] = useState(false);
  const [pendingPerms, setPendingPerms] = useState<Record<string, Event>>({});
  const [activeMode, setActiveMode] = useState<PermissionMode>("default");
  const [pendingMode, setPendingMode] = useState<PermissionMode | null>(null);
  const [modeError, setModeError] = useState<string | null>(null);
  const inFlightRef = useRef<Map<string, InFlight>>(new Map());
  const initSeenRef = useRef(false);
  const errorClearRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const mainRef = useRef<HTMLElement | null>(null);

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
          }
        }
      }
      // Capture initial permission mode from system:init (first one only).
      if (
        !initSeenRef.current &&
        parsed.type === "system" &&
        parsed.subtype === "init"
      ) {
        initSeenRef.current = true;
        // The CLI emits permissionMode (camelCase). Empirically it can hold
        // values like "auto" that aren't in our five-value wire union; only
        // adopt it if it's a known mode, otherwise fall back to "default".
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

  function send(frame: any) {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    const line = JSON.stringify(frame);
    console.log("[send]", frame);
    ws.send(line);
  }

  function sendPrompt() {
    const text = input.trim();
    if (!text) return;
    setEvents((prev) => [...prev, { type: "_local_user", text }]);
    send({ type: "user", message: { role: "user", content: text } });
    setInput("");
  }

  function interrupt() {
    // CLI control_request shape: {type, request_id, request:{subtype:"interrupt"}}
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
      // Only act if this request is still in flight.
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
    // The CLI's can_use_tool request looks like:
    //   {type:"control_request", request_id, request:{subtype:"can_use_tool", tool_name, input, tool_use_id, ...}}
    // Our reply envelope is:
    //   {type:"control_response", response:{subtype:"success", request_id, response:{behavior, updatedInput?, message?}}}
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
      <footer>
        <textarea
          rows={2}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              sendPrompt();
            }
          }}
          placeholder="Type a prompt — Cmd/Ctrl+Enter to send"
        />
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
    // Find a matching tool_result by tool_use_id in any subsequent user message content.
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
