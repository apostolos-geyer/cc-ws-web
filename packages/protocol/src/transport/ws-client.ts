/**
 * `wsClientTransport(url, opts?)` — universal WebSocket client adapter.
 *
 * Uses the global `WebSocket` constructor — works in browsers, Bun, Deno,
 * and recent Node (v22+). Does not import `ws` or any Node module, so
 * stays browser-safe.
 *
 * Wire shape: every frame round-trips as a single text message containing
 * one JSON object. Inbound text → `JSON.parse` → `onFrame`. Outbound frame
 * → `JSON.stringify` → `ws.send`. Binary frames are ignored (the wire
 * protocol is text-only).
 *
 * Reconnect is opt-in via `opts.reconnect`. When enabled, the transport
 * automatically opens a fresh `WebSocket` on close (until `close()` is
 * called explicitly or `maxAttempts` is reached). `onFrame` handlers
 * survive reconnects; pending `send()`s queued during a disconnect resolve
 * once the new socket opens.
 */
import type { Frame, Transport } from "./index";

export interface ExpBackoff {
  kind: "exp";
  baseMs: number;
  maxMs?: number;
  maxAttempts?: number;
}

export interface WsClientOptions {
  reconnect?: ExpBackoff;
  /** Optional list of subprotocols to negotiate. */
  protocols?: string | string[];
  /**
   * Hook fired on every socket open. Useful for tests to assert connection
   * count; not part of the universal Transport API.
   */
  onOpen?: () => void;
  /** Hook fired on every socket close, *before* reconnect logic decides. */
  onSocketClose?: (ev: { code: number; reason: string }) => void;
}

export interface WsClientTransport extends Transport {
  /** Current connection attempt number (0-indexed). For tests. */
  readonly attempt: number;
}

type WsLike = {
  readyState: number;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  addEventListener(type: "open", h: () => void): void;
  addEventListener(type: "close", h: (ev: { code: number; reason: string }) => void): void;
  addEventListener(type: "error", h: (ev: unknown) => void): void;
  addEventListener(type: "message", h: (ev: { data: unknown }) => void): void;
};

export function wsClientTransport(
  url: string,
  opts: WsClientOptions = {},
): WsClientTransport {
  const handlers = new Set<(frame: Frame) => void>();
  let closedByUser = false;
  let attempt = 0;
  let sock: WsLike | null = null;
  let openWait: Promise<void> | null = null;

  function isOpen(): boolean {
    return sock !== null && (sock as { readyState: number }).readyState === 1;
  }

  function ensureSocket(): Promise<void> {
    if (closedByUser) return Promise.reject(new Error("wsClientTransport: closed"));
    if (isOpen()) return Promise.resolve();
    if (openWait) return openWait;
    openWait = new Promise((resolve, reject) => {
      try {
        // The global WebSocket constructor — universal API.
        const WS = (globalThis as unknown as { WebSocket: new (u: string, p?: string | string[]) => WsLike }).WebSocket;
        if (!WS) {
          reject(new Error("wsClientTransport: no global WebSocket constructor available"));
          return;
        }
        const ws = opts.protocols !== undefined ? new WS(url, opts.protocols) : new WS(url);
        sock = ws;
        ws.addEventListener("open", () => {
          opts.onOpen?.();
          openWait = null;
          resolve();
        });
        ws.addEventListener("message", (ev: { data: unknown }) => {
          const data = ev.data;
          if (typeof data !== "string") return;
          let parsed: unknown;
          try {
            parsed = JSON.parse(data);
          } catch {
            return;
          }
          for (const h of [...handlers]) h(parsed);
        });
        ws.addEventListener("close", (ev: { code: number; reason: string }) => {
          opts.onSocketClose?.(ev);
          sock = null;
          openWait = null;
          if (closedByUser) return;
          if (!opts.reconnect) return;
          const { baseMs, maxMs = 30_000, maxAttempts = Infinity } = opts.reconnect;
          if (attempt + 1 >= maxAttempts) return;
          const delay = Math.min(baseMs * 2 ** attempt, maxMs);
          attempt += 1;
          setTimeout(() => {
            ensureSocket().catch(() => {
              // swallow — further reconnect logic fires on the new socket's close.
            });
          }, delay);
        });
        ws.addEventListener("error", () => {
          // Errors on browser WebSocket are opaque. The close handler will
          // run after; reject the open if we haven't already.
          if (openWait) {
            openWait = null;
            reject(new Error("wsClientTransport: socket error before open"));
          }
        });
      } catch (err) {
        openWait = null;
        reject(err);
      }
    });
    return openWait;
  }

  // Open lazily on first send to avoid issuing a network connection during
  // construction. (Most call sites send `initialize` right after `new`, so
  // this is effectively immediate.)
  const transport: WsClientTransport = {
    async send(frame: Frame): Promise<void> {
      if (closedByUser) throw new Error("wsClientTransport: send after close");
      await ensureSocket();
      if (!isOpen() || !sock) throw new Error("wsClientTransport: socket not open");
      (sock as WsLike).send(JSON.stringify(frame));
    },
    onFrame(handler) {
      handlers.add(handler);
      // Kick off the connection on first subscriber if not already.
      void ensureSocket().catch(() => {
        // Swallow — send() will surface the error to its caller.
      });
      return () => {
        handlers.delete(handler);
      };
    },
    async close(): Promise<void> {
      closedByUser = true;
      handlers.clear();
      if (sock) {
        try {
          sock.close(1000, "client close");
        } catch {
          // ignore
        }
        sock = null;
      }
      openWait = null;
    },
    get closed() {
      return closedByUser;
    },
    get attempt() {
      return attempt;
    },
  };
  return transport;
}
