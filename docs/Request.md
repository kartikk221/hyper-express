# Request
Below is a breakdown of the `Request` component which is an extended `Readable` stream matching official Node.js specification.
* See [`> [ExpressJS]`](https://expressjs.com/en/4x/api.html#req) for more information on additional compatibility methods and properties.
* See [`> [Stream.Readable]`](https://nodejs.org/api/stream.html#new-streamreadableoptions) for more information on additional native methods and properties.

#### Request Properties
| Property  | Type     | Description                |
| :-------- | :------- | :------------------------- |
| `raw` | `uWS.HttpRequest`  | The underlying raw uWS Http Request instance. (Unsafe) |
| `app` | `HyperExpress.Server`  | HyperExpress Server instance this `Request` originated from. |
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
* `multipart(...2 Overloads)`: Parses incoming multipart form based requests allowing for file uploads.
    * **Returns** a `Promise` which is **resolved** once **all** of the fields have been processed.
        * **Note** you may provide an async `handler` to ensure all fields get executed after each `handler` invocaton has finished.
        * **Note** the returnd `Promise` can **reject** with one of the `String` constants below or an uncaught `Error` object.
            * `PARTS_LIMIT_REACHED`: This error is rejected when the configured Busboy `limits.parts` limit has been reached.
            * `FILES_LIMIT_REACHED`: This error is rejected when the configured Busboy `limits.files` limit has been reached.
            * `FIELDS_LIMIT_REACHED`: This error is rejected when the configured Busboy `limits.fields` limit has been reached.
    * **Overload Types**:
      * `multipart(Function: handler)`: Parses the incoming multipart request with the default Busboy `options` through the specified `handler`.
      * `multipart(BusboyConfig: options, Function: handler)`: Parses the incoming multipart request with the spcified `options` through the specified `handler`.
      * **Handler Example**: `(field: MultipartField) => { /* Your Code Here */}`
        * **Note** this `handler` can be either a synchronous or asynchronous function.
        * **Note** HyperExpress will automatically pause and wait for your **async** handler to resolve on **each** field.
      * **See** [`> [MultipartField]`](./MultipartField.md) to view all properties and methods available for each multipart field.
      * **See** [`> [Busboy]`](https://github.com/mscdex/busboy) to view all customizable `BusboyConfig` options and learn more about the Busboy multipart parser.
    * **Note** the body parser uses the global `Server.max_body_length` by default. You can **override** this property on a route by specifying a higher `max_body_length` in the route options when creating that route.
    * **Note** HyperExpress currently **does not support** chunked transfer requests.
* See [ExpressJS](https://github.com/expressjs/express) documentation for more properties/methods that are also implemented for compatibility.

#### Request Events
The `Request` component extends an `EventEmitter`/`Readable` stream meaning your application can listen for the following lifecycle events.
- [`received`]: This event will get emitted when `Request` has completely received all of the incoming body data.
- See the official [`> [stream.Readable]`](https://nodejs.org/api/stream.html#readable-streams) Node.js documentation for more information.