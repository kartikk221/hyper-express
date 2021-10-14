# Request
Below is a breakdown of the `request` object made available through the route/middleware handler(s). Most [ExpressJS](https://github.com/expressjs/express) properties and methods are also implemented for compatibility.

#### Request Properties
| Property  | Type     | Description                |
| :-------- | :------- | :------------------------- |
| `raw` | `uWS.Request`  | Underlying uWebsockets.js request object.|
| `method` | `String`  | Request HTTP method in uppercase. |
| `url` | `String`  | path + path_query string. |
| `path` | `String`  | Request path without the query.|
| `path_query` | `String`  | Request query string without the `?`.|
| `headers` | `Object`  | Request Headers from incoming request. |
| `cookies` | `Object`  | Request cookies from incoming request. |
| `session` | `Session`  | Session object made available when a session engine is active. |
| `path_parameters` | `Object`  | Path parameters from incoming request. |
| `query_parameters` | `Object`  | Query parameters from incoming request. |
| `ip` | `String`  | Remote connection IP. |
| `proxy_ip` | `String`  | Remote proxy connection IP. |
| `body` | `Mixed`  | Populated when `expect_body` is specified at route creation. |

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
* See [ExpressJS](https://github.com/expressjs/express) documentation for more properties/methods that are also implemented for compatibility.
