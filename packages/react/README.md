# @somewhatintelligent/cc-ws-react

React hooks for [@somewhatintelligent/cc-ws-client](https://www.npmjs.com/package/@somewhatintelligent/cc-ws-client). Wraps the nanostores atoms in `useStore` so components re-render on session state changes.

```tsx
import { createCcSession } from "@somewhatintelligent/cc-ws-client";
import { useCcSession } from "@somewhatintelligent/cc-ws-react";

const session = createCcSession({ url: "wss://example.com/ws" });

export function Chat() {
  const { messages, status, sendMessage } = useCcSession(session);
  // ...
}
```
