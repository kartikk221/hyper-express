# Native uWebSockets.js lifecycle contract

HyperExpress v7 is audited against `uWebSockets.js` v20.69.0 (JavaScript wrapper commit `faf115`) and its pinned uWebSockets core (`fe7c`). This document records the ownership rules that wrapper code and regression tests must preserve.

## HTTP request and response

| Native value | Validity | HyperExpress rule |
| :--- | :--- | :--- |
| `HttpRequest` | Only during the synchronous route/upgrade callback | Method, URL, query, headers, and path parameters are copied in the `Request` constructor. `Request.raw` remains an explicitly unsafe escape hatch. |
| `HttpResponse` | Until abort, `close()`, `end()`, `endWithoutBody()`, successful `tryEnd()`, or `upgrade()` | Public operations check `Response.completed`. Request flow control and response drain/write-offset operations never call native methods after completion. |
| Peer/proxy address and port | Stored on HTTP socket data and unavailable after the response wrapper/socket data is discarded | All four values are captured at request entry. They remain stable after response completion. |
| `onDataV2` chunk | Native callback memory; the addon detaches its `ArrayBuffer` immediately after the callback | Buffered and public-stream modes copy before retention. Parser mode consumes synchronously. Listener exceptions are caught inside the callback and routed through HyperExpress error handling. |
| `onWritable` callback | May run only while the native response remains active | HyperExpress keeps one guarded callback, validates its boolean result, and clears the active handler on completion. |

No JavaScript exception is allowed to unwind through a uWebSockets.js-owned callback. Request-entry failures close the raw response; later failures use the scoped route error chain.

## WebSocket upgrade and events

The uWebSockets core stores the peer address in `HttpResponse` socket data. During upgrade it destroys that HTTP data and constructs `WebSocketData` without copying the address cache. Consequently, resolving `getRemoteAddressAsText()` from the opened WebSocket can return an empty `ArrayBuffer`. HyperExpress transfers the request-entry IP and port through upgrade user data, and the `Websocket` wrapper snapshots them before user code runs.

WebSocket message, dropped-message, close-reason, ping, pong, and subscription-topic inputs are treated as callback-lifetime native memory. `String` and `Buffer` modes consume or copy synchronously. `ArrayBufferSafe` makes an owned copy. The legacy `ArrayBuffer` mode intentionally remains zero-copy and must not be retained after the synchronous listener returns.

The addon invalidates its JavaScript WebSocket object before native `end()`/`close()` calls, while the core may invoke the close handler synchronously. HyperExpress therefore marks and clears its wrapper defensively before close observers run, and all later methods avoid the native object.

## Native option and protocol bounds

- `idleTimeout`: `0`, or `8..960` seconds. The core calls `std::terminate()` outside this range.
- `maxLifetime`: `0..239` minutes. The addon clamps to 239 to avoid the native timer modulo boundary.
- `maxPayloadLength` and `maxBackpressure`: `0..2,147,483,647`. The addon reads signed 32-bit integers before assigning unsigned fields, so negative or overflowing inputs are rejected in JavaScript.
- Compression: only documented compressor/decompressor bitmask combinations are accepted. Arbitrary enum integers can otherwise reach zlib initialization.
- Ping payload: at most 125 bytes. Close reasons: at most 123 bytes with a valid protocol close code. HyperExpress rejects values the core would truncate or cast.

## Server and native handle ownership

Listen tokens are opaque native handles. Each `Server` records the handles returned by its own listen callback and whether each has already been closed. Foreign and retained closed handles never reach `us_listen_socket_close`. A throwing listen callback also closes its new token exactly once.

The native app creates its pub/sub topic tree lazily when the first WebSocket route is registered. HyperExpress returns `false`/`0` from server publish/subscriber queries until that point, avoiding an upstream null topic-tree dereference on HTTP-only apps.

SNI missing-host notifications also originate in a native callback. `HostManager` contains each listener's throws/rejections and forwards them to its `error` event (or logs when unhandled).

uWebSockets.js application descriptors are a special upstream escape hatch: the addon encodes a raw app pointer into a JavaScript value and allocates a permanent V8 `Persistent` on every `getDescriptor()` call. HyperExpress caches the stable pointer after one call to prevent repeated native-side allocations and rejects obviously invalid JavaScript values before they reach the addon. Only descriptors returned by `get_descriptor()` from a compatible, live application may be passed to the child-app methods. HyperExpress cannot validate the provenance or liveness of a descriptor transferred from another worker without breaking the upstream worker-composition API.

`Response.raw`, `Request.raw`, `Websocket.raw`, `Server.uws_instance`, upgrade socket contexts, and application descriptors deliberately expose native objects. Code using those escape hatches assumes the exact lifetimes above and is outside HyperExpress's completion guards.
