# Response
Below is a breakdown of the `response` object made available through the route/middleware handler(s). Most [ExpressJS](https://github.com/expressjs/express) properties and methods are also implemented for compatibility.

#### Response Properties
| Property  | Type     | Description                |
| :-------- | :------- | :------------------------- |
| `raw` | `uWS.Response`  | Underlying uWebsockets.js response object. |
| `initiated` | `Boolean`  | Signifies whether the response has been initiated and the status code/headers have been sent. |
| `aborted` | `Boolean`  | Signifies whether the request has been aborted/completed. |
| `completed` | `Boolean`  | Alias of `aborted` property. |


#### Response Methods
* `atomic(Function: callback)`: Alias of uWebsockets's `cork(callback)` method.
    * **Usage:** Wrapping multiple response method calls inside this method can improve performance.
* `hook(String: type, Function: handler)`: Registers a hook handler for the specified event type.
  * **Supported Hook Types:**
    * [`abort`]: These hooks will get called when the response is aborted.
    * [`send`]: These hooks will get called right before response is sent. Use this to set any last minute headers and call any last minute `Response` methods.
    * [`complete`]: These hooks will get called after response has been sent successfully without backpressure.
  * **Note!** hooks will be called in the order they were registered on the response object.
  * **Note!** hook handlers should be **synchronous** functions only.
* `status(Number: code)`: Sets HTTP status response code for current request.
* `type(String: mime_type)`: Writes correct protocol `content-type` header for specified mime type.
    * **Example:** `response.type('json')` writes `application/json`
    * **Supported:** [Mime Types](./src/constants/mime_types.json)
* `header(String: name, String: value)`: Writes a response header.
* `cookie(String: name, String: value, Number: expiry, Object: options, Boolean: sign_cookie)`: Writes a cookie header to set cookie on response.
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
    * **Note** cookie values are not URL encoded.
* `delete_cookie(String: name)`: Writes a cookie header to delete/expire specified cookie.
* `upgrade(Object: context)`: Upgrades incoming request to a websocket connection.
    * **Note** `context` is optional and can be used to store data on the websocket connection object.
    * **Note** this method can only be used inside an `upgrade` route handler.
* `redirect(String: url)`: Writes 302 header to redirect incoming request to specified url.
* `write(String|Buffer|ArrayBuffer: chunk)`: Writes specified chunk as response. Use this method with streams to send response body in chunks.
    * **Note** the `send()` must still be called to end the request after writing all chunks.
* `send(String|Buffer|ArrayBuffer: body)`: Writes specified body and sends response.
* `json(Object: body)`: Alias of `send()`. Sets mime type to `json` and sends response.
* `jsonp(Object: body, String: name)`: Alias of `send()`. Sets mime type to `js` and sends response.
  * **Note!** This method uses `callback` query parameter as callback name by default if `name` parameter is not specified.
* `html(String: body)`: Alias of `send()`. Sets mime type to `html` and sends response.
* `file(String: path, Function: callback)`: Alias of `send()`. Sets appropriate mime type if one has not been set yet and sends file content at specified path as response body.
  * **Callback Example**: `(cache_pool) => {/* Your code here */}`
    * `cache_pool` [`Object`]: The callback exposes the underlying cache pool sorted by file paths.
    * You can expire cache for specific files by doing `delete cache_pool[path]` in the callback.
  * **Note!** An appropriate `content-type` will automatically be written if no `content-type` header is written by user prior to this method.
  * **Note!** This method should be avoided for large files as served files are cached in memory and watched for changes to allow for high performance with near instant content reloading.
* `attachment(String: path)`: Writes appropriate `Content-Disposition` and `Content-Type` headers for file specified at `path`.
  * **Note!** this method **only** writes the appropriate headers.
* `download(String: path, String: filename)`: Alias of `send()`. Sets appropriate attachment headers and mime type if one has not been set yet and sends file content at specified path as response body for browser to download.
* `throw_error(Error: error)`: Calls global catch-all error handler with specified error.
* See [ExpressJS](https://github.com/expressjs/express) documentation for more properties/methods that are also implemented for compatibility.
