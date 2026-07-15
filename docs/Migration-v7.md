# Migrating from HyperExpress v6 to v7

HyperExpress v7 modernizes the native foundation and fixes request, response, middleware, multipart, file, and WebSocket lifecycle races. It remains CommonJS-only, keeps snake_case names, and preserves the existing route overloads and opinionated HyperExpress API.

## Runtime support

- Node.js 22, 24, and 26 are supported. Older releases and odd-numbered Node.js releases are outside the v7 support range.
- uWebSockets.js is pinned to v20.69.0.
- Use a glibc-based Linux image such as Debian or Ubuntu. Plain musl Alpine and Alpine with `gcompat` are unsupported because the native addon can terminate with `SIGSEGV`.

## Middleware completion

Synchronous middleware must continue calling `next()`. Middleware that returns any thenable advances when fulfilled; throwing, rejecting, calling `next(error)`, or fulfilling with an `Error` invokes error handling.

Each middleware completes at most once. The first `next()` returns `true`; later calls return `false` and cannot advance the chain. Promise settlements after `next()` are also ignored. Enable the server option `strict_middleware: true` to report duplicate completion to the applicable scoped error handler while still preventing double advancement.

## Scoped router handlers

Routers now provide `set_error_handler()` and `set_not_found_handler()`. Route errors walk from the innermost mounted router through its parents to the server. Unmatched requests select the longest matching mount boundary; equal boundaries use first-mount order before parent/server fallback. Handlers assigned before or after mounting work, including routers mounted more than once.

## Headers and response helpers

`Response.header()` continues to append by default. Pass `true` as its `overwrite` argument to replace existing values. Header lookup is case-insensitive and compatibility helpers are chainable.

`html()`, `json()`, and `jsonp()` now emit UTF-8 charsets. `send()` remains content-type-neutral. HyperExpress does not synthesize ETags or Express policy headers; uWebSockets.js owns content length, date, and connection handling. JSONP callback names and attachment filenames are sanitized, and `jsonp()` falls back to JSON when no callback is available.

`Response.begin_write()` exposes the native `beginWrite()` operation. In pinned uWebSockets.js v20.69.0, following it with the ordinary body-write path inserts an extra CRLF that some HTTP clients reject. Treat it as a direct upstream primitive and do not combine it with `write()`, `stream()`, or `send()` until upstream resolves that behavior.

## Request bodies, multipart, and files

Fixed-length, empty, and transfer-encoded request bodies now use one eagerly bound native receiver. Parser promises and falsey results are cached, limits settle every parser exactly once, and completed requests no longer attempt a native resume.

Multipart handlers are serialized and may return any thenable. HyperExpress waits for all field/file handlers, drains unconsumed files, and propagates source, Busboy, and handler errors once. `MultipartField.write()` now handles source and destination failures through pipeline semantics.

The live-file cache belongs to each server. Absolute cache keys are normalized, watchers are disposed on eviction/error/server close, and `LiveFile.close()` is idempotent.

## WebSockets and upstream APIs

WebSocket `send()` and `ping()` retain the native numeric status values: `1` means sent, `0` means backpressure, and `2` means dropped. Code comparing these values with booleans must be updated. Fragment streaming waits for the final fragment, handles empty streams, and rejects source/socket/drop failures.

New WebSocket route options are `close_on_backpressure_limit`, `max_lifetime`, and `send_pings_automatically`. New events are `dropped`, `subscription`, and `error`. Synchronous exceptions and rejected thenables from listeners reach `error`; if unhandled, the socket closes with code `1011`.

New connection metadata includes `Request.port`, `Request.proxy_port`, and `Websocket.remote_port`. Worker composition is available through `Server.get_descriptor()`, `add_child_app_descriptor()`, and `remove_child_app_descriptor()`.

## Server lifecycle

`shutdown()` stops accepting first and drains pending HTTP requests; long-lived WebSockets are not counted. `force_close()` explicitly closes all native sockets. Listen/shutdown/close calls are idempotent, process listeners are removed, and a server can safely listen again after graceful shutdown.

## TypeScript corrections

Existing routing overloads remain intact. Declarations now reflect ArrayBuffer views, route `streaming`, multipart promises, scoped router handlers, ports, descriptors, response lifecycle methods, and numeric WebSocket send statuses. These corrections may reveal code that previously depended on inaccurate declarations.
