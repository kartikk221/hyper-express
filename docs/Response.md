# Response
Below is a breakdown of the `Response` component which is an **extended** `Writable` **stream** matching official Node.js network specification.
* See [`> [ExpressJS]`](https://expressjs.com/en/4x/api.html#res) for more information on additional compatibility methods and properties.
* See [`> [Stream.Writable]`](https://nodejs.org/api/stream.html#new-streamwritableoptions) for more information on additional native methods and properties.

#### Response Properties
| Property  | Type     | Description                |
| :-------- | :------- | :------------------------- |
| `app` | `HyperExpress.Server`  | HyperExpress Server instance this `Response` originated from. |
| `raw` | `uWS.Response`  | Underlying uWebsockets.js response object. |
| `sse` | `undefined`, `SSEventStream`  | Returns a "Server-Sent Events" connection object for SSE functionality. |
| `initiated` | `Boolean`  | Signifies whether the response has been initiated and the status code/headers have been sent. |
| `aborted` | `Boolean`  | Signifies whether the request has been aborted/completed. |
| `completed` | `Boolean`  | Alias of `aborted` property. |
| `write_offset` | `Number`  | Returns the current response body content write offset in bytes. |
* See [`> [SSEventStream]`](./SSEventStream.md) for more information on the `Response.sse` property for working with Server-Sent Events.

#### Response Methods
* `atomic(Function: callback)`: Alias of uWebsockets's `cork(callback)` method.
    * **Usage:** Wrapping multiple response method calls inside this method can improve performance.
* `status(Number: code, String?: message)`: Sets the HTTP response status code and message for current request.
    * **Note** codes must be integers from `100` through `999`; custom messages cannot contain CR or LF bytes.
* `type(String: mime_type)`: Writes correct protocol `content-type` header for specified mime type.
    * **Example:** `response.type('json')` writes `application/json`
    * **Supported:** MIME types recognized by the [`mime-types`](https://www.npmjs.com/package/mime-types) package.
* `header(String: name, String|Array<String>: value, Boolean?: overwrite)`: Writes one or multiple response headers.
  * **Note!** values append by default. Pass `true` for `overwrite` to replace previous values. Header lookup is case-insensitive.
  * **Note** field names and values are validated before entering uWebSockets.js. CR/LF injection and invalid `content-length` values are rejected.
* `cookie(String: name, String?: value, Number?: expiry, Object?: options, Boolean: sign_cookie)`: Writes a cookie header to set cookie on response.
    * `expiry` specifies the cookie lifetime duration in **milliseconds**.
    * `sign_cookie` is `true` by default.
    * `options`:
        * `domain`[`String`]: Cookie Domain
        * `path`[`String`]: Cookie Path
        * `maxAge`[`Number`]: Max Cookie Age (In Seconds)
        * `secure`[`Boolean`]: Adds Secure Flag
        * `httpOnly`[`Boolean`]: Adds httpOnly Flag
        * `sameSite`[`Boolean`, `'none'`, `'lax'`, `'strict'`]: Cookie Same-Site Preference
        * `secret`:[`String`]: Cryptographically signs cookie value
    * **Note** cookie values use the `cookie` package's default encoding.
    * **Note** You may pass `null` as the `value` parameter to delete a cookie while retaining its path/domain scope options.
* `upgrade(Object?: context)`: Upgrades incoming request to a WebSocket or Server-Sent Events connection.
    * **Note** `context` is optional and can be used to store data for the future.
    * **Note** this method can only be used inside an `upgrade` route handler.
* `redirect(String: url)`: Writes 302 header to redirect incoming request to specified url.
* `write(String|Buffer|ArrayBuffer: chunk, String?: encoding, Function?: callback)`: Writes specified chunk using chunked transfer. Use this method to stream large amounts of data.
    * **Returns** a `Boolean` in which `false` signifies chunk was not fully sent due to built up backpressure.
    * **Note** the `send()` must still be called in the end after writing all chunks to end the chunked transfer.
    * **Note** this method mimics `Writable.write()` method thus you may use direct piping by piping from a `Readable` stream.
    * **Note** `readable.pipe(response)` honors Node and uWebSockets.js backpressure. Source errors reach the scoped route error handler, and an aborted response destroys the still-active source so file handles and paused producers are not leaked.
* `drain(Function: handler)`: Binds a one-time handler which is called once the built up backpressure from a failed `write()` call has been drained.
  * **Handle Example**: `(Number: offset) => boolean`
  * **Proper Usage**:
    * You **MUST** retry the failed chunk `write()` call with the same **sliced** chunk from before proceeding to writing future chunks.
    * You should **slice** the chunk using `chunk.slice(offset - Response.write_offset)` to retry the chunk with the `write()` call.
    * This handler may be called **multiple** times with different `offset` values until the chunk is fully written.
  * **Note** this handler must be **synchronous** only.
  * **Note** calls after completion are no-ops and never access the discarded native `HttpResponse`.
* `begin_write()`: Flushes the status and headers with the pinned uWebSockets.js `beginWrite()` API and returns the current `Response`.
  * **Caution:** this is exact upstream delegation. uWebSockets.js v20.69.0 currently inserts an extra CRLF when its ordinary body-write path follows `beginWrite()`, which some HTTP clients reject. Do not combine `begin_write()` with `write()`, `stream()`, or `send()` until upstream resolves that native behavior.
* `stream(ReadableStream: readable, Number?: total_size)`: Pipes the provided readable stream as body and sends response.
  * This method can be useful for serving large amounts of data through Node.js streaming functionalities.
  * **Note** the `total_size` is an **optional** number in `bytes` which can be specified if you need a `content-length` header on the receiver side.
  * **Returns** a Promise which resolves to the current `Response` after successful completion and rejects on source or response failure.
* `send(String|Buffer|ArrayBuffer|ArrayBufferView?: body)`: Writes specified body and sends response without assigning a content type.
  * **Returns** current `Response` object to facilitate chain calls.
  * **Note** HyperExpress does not generate ETags or Express policy headers. uWebSockets.js remains responsible for content length, date, and connection handling.
* `json(Object: body)`: Alias of `send()`. Sets `application/json; charset=utf-8` and sends the response.
* `jsonp(Object: body, String?: name)`: Sets `application/javascript; charset=utf-8` and sends sanitized JSONP when a valid callback is supplied.
  * **Note!** This method uses the `callback` query parameter when `name` is not specified, and falls back to ordinary JSON when no callback exists.
* `html(String: body)`: Alias of `send()`. Sets `text/html; charset=utf-8` and sends the response.
* `attachment(String: path)`: Writes appropriate `Content-Disposition` and `Content-Type` headers for file specified at `path`.
  * **Note!** this method only writes the appropriate headers and sanitizes the attachment filename.
* `download(String: path, String: filename)`: Alias of `send()`. Sets appropriate attachment headers and mime type if one has not been set yet and sends file content at specified path as response body for browser to download.
* `throw(Error: error)`: Calls the global catch-all error handler (If one is assigned) with the provided error.
* See [ExpressJS](https://github.com/expressjs/express) documentation for more properties/methods that are also implemented for compatibility.

#### Response Events
The `Response` component extends an `EventEmitter`/`Writable` stream meaning your application can listen for the following lifecycle events.
- [`abort`]: This event will get emitted when the request was aborted unexpectedly by the client or the underlying connection was closed.
- [`prepare`]: This event will get emitted when the response is internally ready to be sent. Use this to perform any last minute modifications to the response.
- [`finish`]: This event will get emitted when the response has been sent by HyperExpress. This does not mean the client has received anything yet.
- [`close`]: This event will get emitted when the underlying connection has closed.
- **Note!** you should utilize the [`close`] event to detect the absolute end of a request as it signifies connection closure.
- See the official [`> [stream.Writable]`](https://nodejs.org/api/stream.html#writable-streams) Node.js documentation for more information.
