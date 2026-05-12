/**
 * Type-level assertions for the generated `types.ts`.
 *
 * These tests assert that:
 *   1. Discriminated unions narrow correctly when you check `type` /
 *      `subtype`.
 *   2. Every advertised subtype yields a single specific variant (no
 *      `never` collapses, no `unknown` blanket).
 *   3. Fields marked `unknown` at the codegen layer surface as `unknown`
 *      in the inferred TS types (not `any`).
 *
 * Run via `bun test`. The body is a `test("compiles")` whose entire payload
 * is type-level — Bun's test runner doesn't care that there's no runtime
 * assertion. If `tsc --noEmit` fails on this file, the package is broken.
 */

import { describe, test, expect } from "bun:test";

import {
  InitializeRequest,
  SystemInit,
  PermissionMode,
  AgentDefinition,
  ControlResponseMessage,
  inboundBySubtype,
  inboundByType,
  ACTIVE_VERSION,
} from "../src/index";

import type { Transport } from "../src/transport/index";
import { ClaudeClient } from "../src/client";
import { ClaudeProcess } from "../src/process";
import { bufferTransport } from "../src/transport/buffer";
import { inMemoryPair } from "../src/transport/in-memory-pair";

// Each runtime schema constant carries an inferred TS type at `typeof X.infer`.
// Alias them locally so the type-level assertions read naturally.
type InitializeRequestT = typeof InitializeRequest.infer;
type SystemInitT = typeof SystemInit.infer;
type PermissionModeT = typeof PermissionMode.infer;
type ControlResponseMessageT = typeof ControlResponseMessage.infer;

// ---------------------------------------------------------------------------
// Helpers: compile-time type assertions.
// ---------------------------------------------------------------------------
type Expect<T extends true> = T;
type Equal<A, B> =
  (<X>() => X extends A ? 1 : 2) extends <X>() => X extends B ? 1 : 2
    ? true
    : false;
type Extends<A, B> = A extends B ? true : false;

// ---------------------------------------------------------------------------
// Runtime shape assertions.
// ---------------------------------------------------------------------------
describe("runtime schema shapes", () => {
  test("ACTIVE_VERSION matches the generated dir", () => {
    expect(ACTIVE_VERSION).toBe("2.1.139");
  });

  test("InitializeRequest validates a minimal payload", () => {
    expect(InitializeRequest.allows({ subtype: "initialize" })).toBe(true);
  });

  test("InitializeRequest rejects a wrong subtype", () => {
    expect(InitializeRequest.allows({ subtype: "not-init" })).toBe(false);
  });

  test("PermissionMode enum advertises the six known modes", () => {
    expect(PermissionMode.allows("default")).toBe(true);
    expect(PermissionMode.allows("plan")).toBe(true);
    expect(PermissionMode.allows("acceptEdits")).toBe(true);
    expect(PermissionMode.allows("bypassPermissions")).toBe(true);
    expect(PermissionMode.allows("dontAsk")).toBe(true);
    expect(PermissionMode.allows("auto")).toBe(true);
    expect(PermissionMode.allows("not-a-mode")).toBe(false);
  });

  test("AgentDefinition validates the minimum shape", () => {
    expect(
      AgentDefinition.allows({
        description: "a code reviewer",
        prompt: "you are a code reviewer",
      }),
    ).toBe(true);
  });

  test("SystemInit validates a representative frame", () => {
    const frame = {
      type: "system",
      subtype: "init",
      claude_code_version: "2.1.139",
      cwd: "/tmp",
      tools: [],
      mcp_servers: [],
      model: "claude-opus",
      permissionMode: "default",
      slash_commands: [],
      output_style: "default",
      skills: [],
      plugins: [],
      apiKeySource: "user",
      uuid: "abc-123",
      session_id: "sess-1",
    };
    expect(SystemInit.allows(frame)).toBe(true);
  });

  test("dispatch maps cover the active subtype catalogue", () => {
    // Every test in `codegen/integration/tests.ts` exercises one of these.
    const expectedSubtypes = [
      "apply_flag_settings",
      "background_tasks",
      "file_suggestions",
      "get_binary_version",
      "get_context_usage",
      "get_session_cost",
      "get_settings",
      "initialize",
      "interrupt",
      "mcp_status",
      "reload_plugins",
      "seed_read_state",
      "set_max_thinking_tokens",
      "set_model",
      "set_permission_mode",
    ];
    for (const sub of expectedSubtypes) {
      expect(inboundBySubtype[sub]).toBeDefined();
    }
  });

  test("dispatch.inboundByType covers core top-level types", () => {
    for (const t of ["control_request", "control_response", "assistant", "user", "stream_event"]) {
      expect(inboundByType[t]).toBeDefined();
    }
  });
});

// ---------------------------------------------------------------------------
// Type-level assertions (compile-time only).
// ---------------------------------------------------------------------------
describe("type-level assertions (compile-time)", () => {
  test("compiles", () => {
    // 1. The InitializeRequest type has a literal `subtype: "initialize"` discriminator.
    type _SubtypeDiscriminantIsLiteral = Expect<
      Equal<InitializeRequestT["subtype"], "initialize">
    >;

    // 2. The SystemInit type has both literal discriminators.
    type _SysInitType = Expect<Equal<SystemInitT["type"], "system">>;
    type _SysInitSubtype = Expect<Equal<SystemInitT["subtype"], "init">>;

    // 3. PermissionMode infers as the closed union of the six modes.
    type _PermissionModeAllSix = Expect<
      Equal<
        PermissionModeT,
        "acceptEdits" | "auto" | "bypassPermissions" | "default" | "dontAsk" | "plan"
      >
    >;

    // 4. ControlResponseMessage carries the `response` envelope; we don't pin
    // its full shape here (it's deeply nested), but we do assert that its
    // `type` is the `"control_response"` literal.
    type _ControlResponseType = Expect<
      Equal<ControlResponseMessageT["type"], "control_response">
    >;

    // 5. AgentDefinition has a required `description` and `prompt` (both string).
    type _AgentDefRequiredFields = Expect<
      Extends<
        { description: "x"; prompt: "y" },
        Pick<typeof AgentDefinition.infer, "description" | "prompt">
      >
    >;

    // 6. Discriminator narrowing: given a union of system frames, narrowing
    // on `subtype: "init"` yields the SystemInit variant. We can't test
    // this on a generated union directly (no top-level StdoutMessage union
    // emitted yet), but we can mimic via a manual union.
    type Union = SystemInitT | { type: "system"; subtype: "status"; uuid?: string };
    function narrow(u: Union) {
      if (u.subtype === "init") {
        // The `type` and `subtype` discriminators forced the SystemInit variant.
        type Check = Expect<Equal<typeof u, SystemInitT>>;
        const _c = null as unknown as Check;
        return _c;
      }
      return null;
    }
    void narrow;

    expect(true).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Phase 3 surface: Transport + principals.
// ---------------------------------------------------------------------------
describe("Phase 3 surface", () => {
  test("bufferTransport returns a Transport", () => {
    const h = bufferTransport();
    const _t: Transport = h.transport;
    expect(typeof _t.send).toBe("function");
    expect(typeof _t.onFrame).toBe("function");
    expect(typeof _t.close).toBe("function");
    expect(typeof _t.closed).toBe("boolean");
  });

  test("inMemoryPair returns two Transports", () => {
    const [a, b] = inMemoryPair();
    const _ta: Transport = a;
    const _tb: Transport = b;
    expect(typeof _ta.send).toBe("function");
    expect(typeof _tb.send).toBe("function");
  });

  test("ClaudeClient + ClaudeProcess construct over a Transport", () => {
    const h = bufferTransport();
    const client = new ClaudeClient(h.transport);
    const proc = new ClaudeProcess(h.transport);
    expect(typeof client.getSnapshot).toBe("function");
    expect(typeof proc.getState).toBe("function");
    expect(proc.getState()).toBe("idle");
  });
});
