# @somewhatintelligent/cc-ws-react

React hooks for [`@somewhatintelligent/cc-ws-client`](../client).
Wraps the nanostores atoms in `@nanostores/react`'s `useStore` so
components re-render on session state changes.

```tsx
import { createCcSession } from "@somewhatintelligent/cc-ws-client";
import { useCcSession } from "@somewhatintelligent/cc-ws-react";

const session = createCcSession({ url: "wss://example.com/ws" });
session.connect();

export function Chat() {
  const { messages, status, sendMessage } = useCcSession(session);
  return (
    <>
      <p>status: {status}</p>
      {messages.map((m) => /* ... */)}
      <button onClick={() => sendMessage("hi")}>send</button>
    </>
  );
}
```

`useCcSession(session)` returns a merged object of every atom value
plus the imperative methods from the session — call once per render in
any component below the session-providing layer.

For a typed list of atoms + methods, see
[`@somewhatintelligent/cc-ws-client`](../client). For the universal
protocol primitives,
[`@somewhatintelligent/cc-protocol`](../protocol).

## Bridge

You need a cc-ws bridge running somewhere reachable from the browser —
see [`@somewhatintelligent/cc-ws-server`](../server).
