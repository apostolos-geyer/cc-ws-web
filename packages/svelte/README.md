# @somewhatintelligent/cc-ws-svelte

Svelte 5 adapter for
[`@somewhatintelligent/cc-ws-client`](../client). Thin by design —
nanostores atoms already implement Svelte's store contract, so any atom
auto-subscribes in templates with the `$` prefix. The adapter only adds
typed context injection so consumers don't have to thread the session
manually, plus re-exports the full client + protocol surface so apps
depend on a single package.

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
  session.connect();
</script>

<Chat />
```

```svelte
<!-- Chat.svelte -->
<script lang="ts">
  import { getCcSession } from "@somewhatintelligent/cc-ws-svelte";

  const session = getCcSession();
  const { status, messages, init } = session.atoms;
</script>

<p>status: {$status} · session: {$init.sessionId ?? "—"}</p>
{#each $messages as m (m.kind === "frame" ? m.id : m.tempId)}
  <!-- render m -->
{/each}
```

In `.svelte.ts` modules, use `svelte/store`'s `fromStore(atom).current`
to read atoms outside templates.

For the full atom list + imperative methods, see
[`@somewhatintelligent/cc-ws-client`](../client). For the universal
protocol primitives,
[`@somewhatintelligent/cc-protocol`](../protocol).

## Bridge

You need a cc-ws bridge running somewhere reachable from the browser —
see [`@somewhatintelligent/cc-ws-server`](../server).
