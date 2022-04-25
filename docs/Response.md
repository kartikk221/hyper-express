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
* See [`> [SSEventStream]`](./SSEventStream.md) for more information on the `Response.sse` property for working with Server-Sent Events.

#### Response Methods
* `atomic(Function: callback)`: Alias of uWebsockets's `cork(callback)` method.
    * **Usage:** Wrapping multiple response method calls inside this method can improve performance.
* `status(Number: code)`: Sets HTTP status response code for current request.
* `type(String: mime_type)`: Writes correct protocol `content-type` header for specified mime type.
    * **Example:** `response.type('json')` writes `application/json`
    * **Supported:** [Mime Types](./src/constants/mime_types.json)
* `header(String: name, String|Array<String>: value)`: Writes one or multiple response headers.
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
    * **Note** cookie values are **not** URL encoded.
    * **Note** You may pass `null` as the `value` parameter to **delete** a cookie.
* `upgrade(Object?: context)`: Upgrades incoming request to a WebSocket or Server-Sent Events connection.
    * **Note** `context` is optional and can be used to store data for the future.
    * **Note** this method can only be used inside an `upgrade` route handler.
* `redirect(String: url)`: Writes 302 header to redirect incoming request to specified url.
* `write(String|Buffer|ArrayBuffer: chunk, String?: encoding, Function?: callback)`: Writes specified chunk using chunked transfer. Use this method to stream large amounts of data.
    * **Returns** a `Boolean` in which `false` signifies chunk was not fully sent due to built up backpressure. 
    * **Note** the `send()` must still be called in the end after writing all chunks to end the chunked transfer.
    * **Note** this method mimics `Writable.write()` method thus you may use direct piping by piping from a `Readable` stream.
* `drain(Function: handler)`: Binds a one-time handler which is called once the built up backpressure from a failed `write()` call has been drained.
  * **Note** you **MUST** retry the failed `write()` call with the same chunk from before proceeding to writing future chunks.
  * **Note** this handler must be **synchronous** only.
* `stream(ReadableStream: readable, Number?: total_size)`: Pipes the provided readable stream as body and sends response.
  * This method can be useful for serving large amounts of data through Node.js streaming functionalities.
  * **Note** the `total_size` is an **optional** number in `bytes` which can be specified if you need a `content-length` header on the receiver side.
  * **Note** you must do your own error handling on the readable stream to prevent triggering the global error handler.
* `send(String|Buffer|ArrayBuffer?: body)`: Writes specified body and sends response.
  * **Returns** a `Boolean` in which `false` signifies body was not fully sent due to built up backpressure.
* `json(Object: body)`: Alias of `send()`. Sets mime type to `json` and sends response.
* `jsonp(Object: body, String?: name)`: Alias of `send()`. Sets mime type to `js` and sends response.
  * **Note!** This method uses `callback` query parameter as callback name by default if `name` parameter is not specified.
* `html(String: body)`: Alias of `send()`. Sets mime type to `html` and sends response.
* `attachment(String: path)`: Writes appropriate `Content-Disposition` and `Content-Type` headers for file specified at `path`.
  * **Note!** this method **only** writes the appropriate headers.
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
- See the official [`> [http.ServerResponse]`](https://nodejs.org/api/http.html#class-httpserverresponse) Node.js documentation for more information.