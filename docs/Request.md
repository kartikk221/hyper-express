# Request
Below is a breakdown of the `Request` component which is an extended `Readable` stream matching official Node.js specification. Most [ExpressJS](https://github.com/expressjs/express) properties and methods are also implemented for compatibility.

#### Request Properties
| Property  | Type     | Description                |
| :-------- | :------- | :------------------------- |
| `app` | `HyperExpress.Server`  | HyperExpress Server instance this `Request` originated from. |
| `raw` | `uWS.Request`  | Underlying uWebsockets.js request object.|
| `method` | `String`  | Request HTTP method in uppercase. |
| `url` | `String`  | path + path_query string. |
| `path` | `String`  | Request path without the query.|
| `path_query` | `String`  | Request query string without the `?`.|
| `headers` | `Object`  | Request Headers from incoming request. |
| `cookies` | `Object`  | Request cookies from incoming request. |
| `path_parameters` | `Object`  | Path parameters from incoming request. |
| `query_parameters` | `Object`  | Query parameters from incoming request. |
| `ip` | `String`  | Remote connection IP. |
| `proxy_ip` | `String`  | Remote proxy connection IP. |

#### Request Methods
* `sign(String: string, String: secret)`: Signs provided string with provided secret.
    * **Returns** a `String`.
* `unsign(String: signed_value, String: secret)`: Attempts to unsign provided value with provided secret.
    * **Returns** `String` or `undefined` if signed value is invalid.
* `buffer()`: Parses body as a Buffer from incoming request.
    * **Returns** `Promise` which is then resolved to a `Buffer`.
* `text()`: Parses body as a string from incoming request.
    * **Returns** `Promise` which is then resolved to a `String`.
* `urlencoded()`: Parses body as an object from incoming urlencoded body.
    * **Returns** `Promise` which is then resolved to an `Object`.
* `json(Any: default_value)`: Parses body as a JSON Object from incoming request.
    * **Returns** `Promise` which is then resolved to an `Object` or `typeof default_value`.
    * **Note** this method returns the specified `default_value` if JSON parsing fails instead of throwing an exception. To have this method throw an exception, pass `undefined` for `default_value`.
    * **Note** `default_value` is `{}` by default meaning `json()` is a safe method even if incoming body is invalid json.
* `multipart(options?: BusboyConfig, handler: Function)`: Parses incoming multipart form based request allowing for file uploads.
    * **Returns** `Promise` which is **resolved** once all fields have been processed.
        * **Note** you may provide an async `handler` to ensure all fields get executed after each `handler` invocaton has finished.
    * **Handler Example**: `(field: MultipartField) => { /* Your Code Here */}`
        * **Note** this `handler` can be either a synchronous or asynchronous callback.
        * **Note** HyperExpress will automatically pause and wait for your handler `Promise` to resolve before resuming with the next field.
    * **Note** the returnd `Promise` can **reject** with one of the `String` constants below or an uncaught `Error` object.
        * `PARTS_LIMIT_REACHED`: This error is rejected when the configured Busboy `limits.parts` limit has been reached.
        * `FILES_LIMIT_REACHED`: This error is rejected when the configured Busboy `limits.files` limit has been reached.
        * `FIELDS_LIMIT_REACHED`: This error is rejected when the configured Busboy `limits.fields` limit has been reached.
    * **Note** you may only provide the `handler` parameter to rely on the Busboy parser defaults.
    * **See** [`> [Busboy]`](https://github.com/mscdex/busboy) to view `BusboyConfig` and learn more about the Busboy multipart parser.
    * **Note** HyperExpress currently **does not support** chunked transfer requests.
    * **See** [`> [MultipartField]`](./MultipartField.md) to view all properties and methods available for each multipart field.
    * **Note** the body parser uses the global `Server.max_body_length` by default. You can **override** this property on a route by specifying a higher `max_body_length` in the route options when creating that route.
* See [ExpressJS](https://github.com/expressjs/express) documentation for more properties/methods that are also implemented for compatibility.
