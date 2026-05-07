# @somewhatintelligent/cc-ws-client

Framework-agnostic reactive WebSocket client for the cc-ws Claude Code bridge protocol. Reactive state via [nanostores](https://github.com/nanostores/nanostores).

```ts
import { createCcSession } from "@somewhatintelligent/cc-ws-client";

const session = createCcSession({ url: "wss://example.com/ws" });
session.sendMessage("Hello");

// Subscribe via nanostores; or use the framework adapters:
// - @somewhatintelligent/cc-ws-react
// - @somewhatintelligent/cc-ws-svelte (workspace-only for now)
```
