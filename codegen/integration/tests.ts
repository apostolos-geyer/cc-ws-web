/**
 * Zero-cost integration test catalog.
 *
 * Each test is a structured scenario the harness drives end-to-end against
 * the live Claude binary. Catalog rules:
 *   - No token-cost paths (no LLM turn that runs to completion).
 *   - Every step has a 10s timeout default.
 *   - Every test ends with `end_session` (the harness sends one implicitly
 *     on teardown anyway, but we make it explicit for fixture readability).
 *
 * The `expectedFrames` array is the assertion surface: each entry pins a
 * discriminator the test claims it exercises. The runner checks every
 * expected frame was observed; extra observed frames are fine (the binary
 * may emit more than we explicitly assert) but missing ones fail the test.
 */

export interface ControlRequestStep {
  kind: "control_request";
  subtype: string;
  payload?: Record<string, unknown>;
}

export interface UserMessageStep {
  kind: "user_message";
  text: string;
}

export interface WaitForStep {
  kind: "wait_for";
  predicate:
    | "control_response_success"
    | "system_init"
    | "assistant_started"
    | { matches: string };
  timeoutMs?: number;
}

export type TestStep = ControlRequestStep | UserMessageStep | WaitForStep;

export interface ExpectedFrame {
  /**
   * A discriminator key in one of these forms:
   *   - `subtype/X`     : an inbound control_response whose request was X
   *   - `type/X`        : a top-level frame with `type: "X"`
   *   - `type/X+subtype/Y` : a compound discriminator
   */
  matches: string;
}

export interface BinaryTest {
  name: string;
  /** Args appended to the canonical stream-json invocation. */
  spawnArgs?: string[];
  /** Initialize payload overrides. Empty by default. */
  initOptions?: Record<string, unknown>;
  steps: TestStep[];
  expectedFrames: ExpectedFrame[];
}

const initialize: ControlRequestStep = {
  kind: "control_request",
  subtype: "initialize",
};
const endSession: ControlRequestStep = {
  kind: "control_request",
  subtype: "end_session",
};
const waitInit: WaitForStep = {
  // The binary acks `initialize` with `control_response/success`. A
  // `system/init` frame is only emitted once a real turn starts (which we
  // intentionally never do in these zero-cost tests).
  kind: "wait_for",
  predicate: "control_response_success",
  timeoutMs: 10_000,
};
const waitSuccess: WaitForStep = {
  kind: "wait_for",
  predicate: "control_response_success",
  timeoutMs: 10_000,
};

// `subtype/success` is the response payload subtype carried in
// control_response frames. `type/control_response` is the wire envelope.
// We assert both so missing either fails the test loudly.
const expectControlResponse: ExpectedFrame = { matches: "type/control_response" };
const expectSuccess: ExpectedFrame = { matches: "subtype/success" };

export const TESTS: BinaryTest[] = [
  {
    name: "init-then-end",
    steps: [initialize, waitInit, endSession],
    expectedFrames: [expectControlResponse, expectSuccess],
  },
  {
    name: "interrupt-pristine",
    steps: [
      initialize,
      waitInit,
      { kind: "control_request", subtype: "interrupt" },
      waitSuccess,
      endSession,
    ],
    expectedFrames: [expectControlResponse, expectSuccess],
  },
  {
    name: "get-settings",
    steps: [
      initialize,
      waitInit,
      { kind: "control_request", subtype: "get_settings" },
      waitSuccess,
      endSession,
    ],
    expectedFrames: [expectControlResponse, expectSuccess],
  },
  {
    name: "get-context-usage",
    steps: [
      initialize,
      waitInit,
      { kind: "control_request", subtype: "get_context_usage" },
      waitSuccess,
      endSession,
    ],
    expectedFrames: [expectControlResponse, expectSuccess],
  },
  {
    name: "get-session-cost",
    steps: [
      initialize,
      waitInit,
      { kind: "control_request", subtype: "get_session_cost" },
      waitSuccess,
      endSession,
    ],
    expectedFrames: [expectControlResponse, expectSuccess],
  },
  {
    name: "get-binary-version",
    steps: [
      initialize,
      waitInit,
      { kind: "control_request", subtype: "get_binary_version" },
      waitSuccess,
      endSession,
    ],
    expectedFrames: [expectControlResponse, expectSuccess],
  },
  {
    name: "set-permission-mode",
    steps: [
      initialize,
      waitInit,
      {
        kind: "control_request",
        subtype: "set_permission_mode",
        payload: { mode: "plan" },
      },
      waitSuccess,
      endSession,
    ],
    expectedFrames: [expectControlResponse, expectSuccess],
  },
  {
    name: "set-model",
    steps: [
      initialize,
      waitInit,
      // Use a known alias rather than a full model id so the test stays stable
      // across model rollouts.
      {
        kind: "control_request",
        subtype: "set_model",
        payload: { model: "sonnet" },
      },
      waitSuccess,
      endSession,
    ],
    expectedFrames: [expectControlResponse, expectSuccess],
  },
  {
    name: "set-max-thinking-tokens",
    steps: [
      initialize,
      waitInit,
      {
        kind: "control_request",
        subtype: "set_max_thinking_tokens",
        payload: { max_tokens: 0 },
      },
      waitSuccess,
      endSession,
    ],
    expectedFrames: [expectControlResponse, expectSuccess],
  },
  {
    name: "file-suggestions",
    steps: [
      initialize,
      waitInit,
      {
        kind: "control_request",
        subtype: "file_suggestions",
        payload: { query: "package.json" },
      },
      waitSuccess,
      endSession,
    ],
    expectedFrames: [expectControlResponse, expectSuccess],
  },
  {
    name: "mcp-status-empty",
    steps: [
      initialize,
      waitInit,
      { kind: "control_request", subtype: "mcp_status" },
      waitSuccess,
      endSession,
    ],
    expectedFrames: [expectControlResponse, expectSuccess],
  },
  {
    name: "reload-plugins",
    steps: [
      initialize,
      waitInit,
      { kind: "control_request", subtype: "reload_plugins" },
      waitSuccess,
      endSession,
    ],
    expectedFrames: [expectControlResponse, expectSuccess],
  },
  {
    name: "apply-flag-settings",
    steps: [
      initialize,
      waitInit,
      { kind: "control_request", subtype: "apply_flag_settings" },
      waitSuccess,
      endSession,
    ],
    expectedFrames: [expectControlResponse, expectSuccess],
  },
  {
    name: "seed-read-state",
    steps: [
      initialize,
      waitInit,
      { kind: "control_request", subtype: "seed_read_state" },
      waitSuccess,
      endSession,
    ],
    expectedFrames: [expectControlResponse, expectSuccess],
  },
];
