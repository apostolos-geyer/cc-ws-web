// Worker env type — just the bindings declared in wrangler.jsonc.
// Kept in a tiny module so both worker.ts and sandbox.ts can import it
// without circular pain.
//
// `Sandbox` is typed as the SDK's BASE class (not our subclass in
// ./sandbox). DurableObjectNamespace is invariant in its generic, so
// widening to the subclass would force every getSandbox(...) call site to
// use the subclass type and cascade into the SDK signatures. The subclass
// adds interceptHttps + static outboundByHost / outboundHandlers — reach
// those via a stub cast at the use site (see setup-flow.ts). Matches
// slopbox-orchestrator/src/orchestrator-env.ts.

import type { Sandbox } from "@cloudflare/sandbox";

export type Env = {
  Sandbox: DurableObjectNamespace<Sandbox>;
  ASSETS: Fetcher;
};
