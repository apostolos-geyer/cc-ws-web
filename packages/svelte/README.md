# @somewhatintelligent/cc-ws-svelte

Svelte 5 adapter for [@somewhatintelligent/cc-ws-client](https://www.npmjs.com/package/@somewhatintelligent/cc-ws-client). Thin by design — nanostores atoms already implement Svelte's store contract, so any atom auto-subscribes in templates with the `$` prefix. The adapter only adds typed context injection so consumers don't have to thread the session manually, plus re-exports the full client surface so apps depend on a single package.

## Install

```sh
bun add @somewhatintelligent/cc-ws-svelte
```

## Use

```svelte
<!-- App.svelte -->
<script lang="ts">
  import { createCcSession, setCcSession } from "@somewhatintelligent/cc-ws-svelte";
  import Chat from "./Chat.svelte";

  const session = createCcSession({ url: "wss://example.com/ws" });
  setCcSession(session);
</script>

<Chat />
```

```svelte
<!-- Chat.svelte -->
<script lang="ts">
  import { getCcSession } from "@somewhatintelligent/cc-ws-svelte";

  const session = getCcSession();
  const { status, messages } = session.atoms;
</script>

<p>status: {$status}</p>
{#each $messages as m (m.kind === "frame" ? m.id : m.tempId)}
  <!-- … -->
{/each}
```

In `.svelte.ts` modules, use `svelte/store`'s `fromStore(atom).current` to read atoms outside templates.

## Bridge

You need a cc-ws bridge running somewhere reachable from the browser — see [`@somewhatintelligent/cc-ws-server`](https://www.npmjs.com/package/@somewhatintelligent/cc-ws-server).
