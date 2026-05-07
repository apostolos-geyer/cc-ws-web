import { describe, test, expect, beforeEach } from "bun:test";
import { createTestSession, type TestSession } from "./helpers";

let h: TestSession;

beforeEach(() => {
  h = createTestSession();
  h.session.connect();
});

function inputEcho(cmd: string) {
  return {
    type: "user",
    isReplay: true,
    message: { role: "user", content: `<bash-input>${cmd}</bash-input>` },
  };
}

function outputReplay(cmd: string, stdout: string, stderr: string, exit: string) {
  // Bridge wraps these in user/isReplay frames with bash-stdout/stderr/exit XML.
  return {
    type: "user",
    isReplay: true,
    message: {
      role: "user",
      content: `<bash-input>${cmd}</bash-input><bash-stdout>${stdout}</bash-stdout><bash-stderr>${stderr}</bash-stderr><bash-exit-code>${exit}</bash-exit-code>`,
    },
  };
}

describe("sendShellContext", () => {
  test("fires bash_command frame, pushes shellEntry with source:context+pending", () => {
    h.session.sendShellContext("ls");
    const sent = h.ws.sentFrames.find((f) => (f as any).type === "bash_command");
    expect(sent).toEqual({ type: "bash_command", command: "ls" });

    const entries = h.session.atoms.shellEntries.get();
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ command: "ls", source: "context", chunks: [], pending: true });
  });

  test("output replay populates chunks and buffers TUI-shape XML (no exit-code)", () => {
    h.session.sendShellContext("ls");
    h.ws.pushFrame(inputEcho("ls") as any);
    h.ws.pushFrame(outputReplay("ls", "a\nb\n", "", "0") as any);

    const entries = h.session.atoms.shellEntries.get();
    expect(entries).toHaveLength(1);
    expect(entries[0].chunks).toEqual(["a\nb\n"]);

    // Drain by sending a user message; XML must NOT include <bash-exit-code>.
    h.session.sendMessage("what does this say?");
    const userSends = h.ws.sentFrames.filter((f) => (f as any).type === "user");
    expect(userSends).toHaveLength(1);
    const content = (userSends[0] as any).message.content as string;
    expect(content).toContain("<bash-input>ls</bash-input>");
    expect(content).toContain("<bash-stdout>a\nb\n</bash-stdout>");
    expect(content).toContain("<bash-stderr></bash-stderr>");
    expect(content).not.toContain("<bash-exit-code>");
    expect(content).toContain("what does this say?");
  });

  test("sendMessage drains pendingBashExchanges and removes the matching shellEntry", () => {
    h.session.sendShellContext("pwd");
    h.ws.pushFrame(inputEcho("pwd") as any);
    h.ws.pushFrame(outputReplay("pwd", "/home/u\n", "", "0") as any);

    expect(h.session.atoms.shellEntries.get()).toHaveLength(1);

    h.session.sendMessage("look at this");
    expect(h.session.atoms.shellEntries.get()).toHaveLength(0);

    // Subsequent sendMessage with no pending exchanges should NOT prepend
    h.session.sendMessage("plain");
    const userSends = h.ws.sentFrames.filter((f) => (f as any).type === "user") as any[];
    expect(userSends).toHaveLength(2);
    expect(userSends[1].message.content).toBe("plain");
  });

  test("FIFO regression: two rapid sendShellContext keep replies in order", () => {
    h.session.sendShellContext("cmd1");
    h.session.sendShellContext("cmd2");

    // Two bash_command sends
    const bashSends = h.ws.sentFrames.filter((f) => (f as any).type === "bash_command");
    expect(bashSends).toHaveLength(2);

    // Two shell entries, in order
    const entries = h.session.atoms.shellEntries.get();
    expect(entries).toHaveLength(2);
    const id1 = entries[0].id;
    const id2 = entries[1].id;
    expect(entries[0].command).toBe("cmd1");
    expect(entries[1].command).toBe("cmd2");

    // Replies arrive in same order: input echo + output for cmd1, then cmd2
    h.ws.pushFrame(inputEcho("cmd1") as any);
    h.ws.pushFrame(outputReplay("cmd1", "out1", "", "0") as any);
    h.ws.pushFrame(inputEcho("cmd2") as any);
    h.ws.pushFrame(outputReplay("cmd2", "out2", "", "0") as any);

    // Each command's output landed on the correct shellEntry
    const after = h.session.atoms.shellEntries.get();
    const e1 = after.find((s) => s.id === id1)!;
    const e2 = after.find((s) => s.id === id2)!;
    expect(e1.chunks).toEqual(["out1"]);
    expect(e2.chunks).toEqual(["out2"]);

    // Drain — both XMLs in pendingBashExchanges, in order, joined by \n
    h.session.sendMessage("ok");
    const lastSend = h.ws.sentFrames.filter((f) => (f as any).type === "user").at(-1) as any;
    const content = lastSend.message.content as string;
    const idx1 = content.indexOf("<bash-input>cmd1</bash-input>");
    const idx2 = content.indexOf("<bash-input>cmd2</bash-input>");
    expect(idx1).toBeGreaterThanOrEqual(0);
    expect(idx2).toBeGreaterThan(idx1);
    expect(content).toContain("<bash-stdout>out1</bash-stdout>");
    expect(content).toContain("<bash-stdout>out2</bash-stdout>");
    expect(content).toContain("ok");
  });

  test("multi-line followUp auto-fires sendMessage after the bash exchange", () => {
    h.session.sendShellContext("date", "what time is it?");
    h.ws.pushFrame(inputEcho("date") as any);
    h.ws.pushFrame(outputReplay("date", "Mon May  6 2026", "", "0") as any);

    // The followUp should already have flushed
    const userSends = h.ws.sentFrames.filter((f) => (f as any).type === "user") as any[];
    expect(userSends).toHaveLength(1);
    expect(userSends[0].message.content).toContain("<bash-input>date</bash-input>");
    expect(userSends[0].message.content).toContain("<bash-stdout>Mon May  6 2026</bash-stdout>");
    expect(userSends[0].message.content).toContain("what time is it?");
  });
});

describe("sendBashSideChannel", () => {
  test("pushes sideChannel entry; output is recorded but does NOT contribute to pendingBashExchanges", () => {
    h.session.sendBashSideChannel("uptime");
    const entries = h.session.atoms.shellEntries.get();
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ command: "uptime", source: "sideChannel" });

    h.ws.pushFrame(inputEcho("uptime") as any);
    h.ws.pushFrame(outputReplay("uptime", "10:30 up 1 day", "", "0") as any);

    // Output recorded
    const after = h.session.atoms.shellEntries.get();
    expect(after[0].chunks).toEqual(["10:30 up 1 day"]);

    // sendMessage should NOT prepend any XML — the side-channel does not buffer
    h.session.sendMessage("hello");
    const userSends = h.ws.sentFrames.filter((f) => (f as any).type === "user") as any[];
    expect(userSends).toHaveLength(1);
    expect(userSends[0].message.content).toBe("hello");
    // Side-channel shellEntry remains visible until dismissed
    expect(h.session.atoms.shellEntries.get()).toHaveLength(1);
  });
});

describe("input echo bookkeeping", () => {
  test("first replay frame (bash-input only) marks sawInputEcho on head capture", () => {
    h.session.sendShellContext("cmd1");
    h.session.sendShellContext("cmd2");

    // First reply for cmd1 — input echo only. Should NOT shift the queue.
    h.ws.pushFrame(inputEcho("cmd1") as any);
    // Output for cmd1 — should now shift; the next output (for cmd2) lands on cmd2's entry.
    h.ws.pushFrame(outputReplay("cmd1", "first", "", "0") as any);
    h.ws.pushFrame(inputEcho("cmd2") as any);
    h.ws.pushFrame(outputReplay("cmd2", "second", "", "0") as any);

    const entries = h.session.atoms.shellEntries.get();
    expect(entries[0].chunks).toEqual(["first"]);
    expect(entries[1].chunks).toEqual(["second"]);
  });
});
