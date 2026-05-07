// Svelte 5 adapter for @cc-ws/client. Thin by design — nanostores atoms
// already implement Svelte's store contract, so any atom auto-subscribes
// in templates with the `$` prefix. The adapter only adds typed context
// injection so consumers don't have to thread the session manually, plus
// re-exports so apps depend on a single package.
//
// Pattern in a component:
//
//   <script lang="ts">
//     import { getCcSession } from '@cc-ws/svelte';
//     const session = getCcSession();
//     const { status, messages, tasks } = session.atoms;
//   </script>
//
//   <p>status: {$status}</p>
//   {#each $messages as m (m.kind === 'frame' ? m.id : m.tempId)}…{/each}
//
// In `.svelte.ts` modules use svelte/store's `fromStore(atom).current`.

import { getContext, setContext } from "svelte";
import type { CcSession } from "@cc-ws/client";

const KEY = Symbol.for("@cc-ws/svelte:session");

export function setCcSession(session: CcSession): void {
  setContext(KEY, session);
}

export function getCcSession(): CcSession {
  const s = getContext<CcSession | undefined>(KEY);
  if (!s) {
    throw new Error(
      "getCcSession() must run inside a component whose ancestor called setCcSession(session) in its <script>.",
    );
  }
  return s;
}

// Pass-through every public surface the lib exports. Consumers should
// only need `@cc-ws/svelte` in their imports.
export * from "@cc-ws/client";
