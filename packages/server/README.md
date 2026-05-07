# @somewhatintelligent/cc-ws-server

Bun WebSocket server that fronts a `claude` child process per connection. Reads NDJSON from `claude --print --input-format stream-json --output-format stream-json --verbose` on stdout, forwards to the WS client; routes WS frames back to `claude` stdin. Supports kill-respawn (new / continue / resume) via a `_local: respawn` control frame.

## Run

Install globally:

```sh
bun add -g @somewhatintelligent/cc-ws-server
PORT=9999 cc-ws-server
```

Or run from source after `bun add` in a project:

```sh
bun node_modules/@somewhatintelligent/cc-ws-server/src/server.ts
```

Designed to live inside a Cloudflare Sandbox container; the worker proxies WS upgrades to `127.0.0.1:$PORT/ws`.
