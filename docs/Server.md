# Server
Below is a breakdown of the `Server` object class generated while creating a new webserver instance.

### Server Constructor Options
* `key_file_name` [`String`]: Path to SSL private key file to be used for SSL/TLS.
    * **Example**: `'misc/key.pm'`
    * **[Required]** for an **SSL** server.
* `cert_file_name` [`String`]: Path to SSL certificate file.
    * **Example**: `'misc/cert.pm'`
    * **[Required]** for an **SSL** server.
* `passphrase` [`String`]: Strong passphrase for SSL cryptographic purposes.
    * **Example**: `'SOME_RANDOM_PASSPHRASE'`
    * **Optional** for an **SSL** server.
* `dh_params_file_name` [`String`]: Path to SSL Diffie-Hellman parameters file.
    * **Example**: `'misc/dhparam4096.pm'`
    * **Optional** for an **SSL** server.
* `ssl_prefer_low_memory_usage` [`Boolean`]: Specifies uWebsockets to prefer lower memory usage while serving SSL requests.
* `fast_buffers` [`Boolean`]: Specifies HyperExpress to use `Buffer.allocUnsafe` for storing incoming request body data for faster performance.
  * **Default:** `false` 
  * **Note!** Any data in the unsafely allocated buffer will always be written over thus this option is provided for those working with strict regulatory requirements.
* `fast_abort` [`Boolean`]: Specifies HyperExpress to forcefully/abruptly close incoming request connections with bad conditions such as payload too large. This can significantly improve performance but at the cost of no HTTP status code being received by the sender.
  * **Default:** `false`
* `trust_proxy` [`Boolean`]: Specifies whether incoming request data from intermediate proxy(s) should be trusted.
  * **Default:** `false`
* `max_body_length` [`Number`]: Maximum number of `bytes` allowed for incoming request body size. For reference, **1kb** = **1000 Bytes** and **1mb** = **1000kb**.
  * **Default:** `250 * 1000` or **250kb**

### Server Instance Properties
| Property  | Type     | Description                |
| :-------- | :------- | :------------------------- |
| `locals` | `Object` | Stores references local to this instance. |
| `uws_instance` | `uWS` | Underlying uWebsockets TemplatedApp instance. |
| `options` | `Object` | Constructor options for current instance. |
| `routes` | `Object` | All routes created on current instance. |
| `middlewares` | `Object` | All non route specific midddlewares on current instance. |
| `handlers` | `Object` | Global handlers for current instance. |

### Server Instance Methods
* `listen(Number: port, String: host)`: Starts the uWebsockets server on specified port.
    * **Returns** a `Promise` and resolves `uw_listen_socket`.
    * **Note** port is required and host is `0.0.0.0` by default.
* `close(uws_socket: socket)`: Closes the uWebsockets se@Brver gracefully.
    * **Note**: socket is not required.
* `set_error_handler(Function: handler)`: Binds a global catch-all error handler that will attempt to catch mostsynchronous/asynchronous errors.
    * **Handler Parameters:** `(Request: request, Response: response, Error: error) => {}`.
* `set_not_found_handler(Function: handler)`: Binds a global catch-all not found handler that will handle all requests which are not handled by any routes.
    * **Handler Parameters:** `(Request: request, Response: response) => {}`.
* `use(String: pattern, Function|Router: handler)`: Accepts a `middleware` method or `Router` instance to bind middlewares and routes depending on provided pattern and handler.
    * **Note** `pattern` is **optional** and you may only provide a handler.
    * **Note** `pattern` is treated as a wildcard match by default and does not support `*`/`:param` prefixes.
    * **See** [`> [Router]`](./Router.md) & [`> [Middlewares]`](./Middlewares.md) for full documentation on this method.
* `any(String: pattern, Object: options, Function: handler)`: Creates an HTTP route on specified pattern. Alias methods are listed below for HTTP method specific routes.
    * **Alias Methods:** `get()`, `post()`, `put()`, `delete()`, `head()`, `options()`, `patch()`, `trace()`, `connect()`, `upgrade()`, `ws()`.
    * **See** [`> [Router]`](./Router.md) for full documentation on this method.
    * **See** [`> [Websocket]`](./Websocket.md) for usage documentation on the `upgrade()` and `ws()` alias method.