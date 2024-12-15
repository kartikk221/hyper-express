# Server
Below is a breakdown of the `Server` component which is an extended `Router` instance for modularity support.
* See [`> [Router]`](./Router.md) for more information on additional methods and properties available.

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
* `auto_close` [`Boolean`]: Specifies whether the `Server` instance should automatically be closed when process exits.
  * **Default:** `true`
* `fast_buffers` [`Boolean`]: Specifies HyperExpress to use `Buffer.allocUnsafe` for storing incoming request body data for faster performance.
  * **Default:** `false`
  * **Note!** Any data in the unsafely allocated buffer will always be written over thus this option is provided for those working with strict regulatory requirements.
* `fast_abort` [`Boolean`]: Specifies HyperExpress to forcefully/abruptly close incoming request connections with bad conditions such as payload too large. This can significantly improve performance but at the cost of no HTTP status code being received by the sender.
  * **Default:** `false`
* `trust_proxy` [`Boolean`]: Specifies whether incoming request data from intermediate proxy(s) should be trusted.
  * **Default:** `false`
* `max_body_buffer` [`Number`]: Maximum number of `bytes` to buffer in memory before the data is consumed. Behaves similar to `highWaterMark` in Node.js streams.
  * **Default:** `16 * 1024` or **16kb**
* `max_body_length` [`Number`]: Maximum number of `bytes` allowed for incoming request body size. For reference, **1kb** = **1024 Bytes** and **1mb** = **1024kb**.
  * **Default:** `250 * 1024` or **250kb**
* `streaming`[`Object`]: Specifies global constructor options for internal readable and writable streams.
  * `readable`[`stream.ReadableOptions`]: Constructor options for `Request` body readable streams.
    * See the official [`> [ReadableOptions]`](https://nodejs.org/api/stream.html#new-streamreadableoptions) Node.js documentation for more information.
  * `writable`[`stream.WritableOptions`]:  Constructor options for `Response` body writable streams.
    * See the official [`> [WritableOptions]`](https://nodejs.org/api/stream.html#new-streamwritableoptions) Node.js documentation for more information.
  * **Note** you can also override globally specified `streaming` options on a per-route basis in the route options.

### Server Instance Properties
| Property  | Type     | Description                |
| :-------- | :------- | :------------------------- |
| `port` | `Number` | Local listening port of this instance. |
| `socket` | `uWS.us_listen_socket` | Listening uWS socket of this instance. |
| `hosts` | `HostManager` | Host Manager local to this instance. |
| `locals` | `Object` | Can be used to stores references local to this instance. |
| `uws_instance` | `uWS.TemplatedApp` | Underlying uWebsockets TemplatedApp instance. |
| `routes` | `Object` | All routes created on current instance. |
| `middlewares` | `Object` | All non route specific midddlewares on current instance. |
| `handlers` | `Object` | Global handlers for current instance. |

### Server Instance Methods
* `listen(Number: port, [String?: host, Function?: callback])`: Starts the uWebsockets server on specified port and host.
  * `listen(String: unix_path, Function?: callback)`: Starts the uWebsockets server on specified UNIX domain socket path.
    * **Returns** a `Promise` and resolves `uw_listen_socket`.
    * **Note** port or unix_path is required and host is `0.0.0.0` by default if unspecified with a port listener.
    * **Note** callback is optional and can be used as an alternative to the Promise.
* `shutdown(uws_socket?: socket)`: Performs a graceful shutdown of the server and closes the listen socket once all pending requests have been completed.
    * **Note**: listen_socket is not required.
    * **Returns** a `Promise` and resolves `Boolean` representing whether the socket was closed successfully.
    * **Note** The server will immediately close any new incoming requests or connections while the graceful shutdown is in progress.
* `close(uws_socket?: socket)`: Closes the uWebsockets server instantly dropping all pending requests.
    * **Note**: listen_socket is not required.
    * **Returns** a `Boolean` representing whether the socket was closed successfully.
* `set_error_handler(Function: handler)`: Binds a global catch-all error handler that will attempt to catch mostsynchronous/asynchronous errors. This is the default error handler if router specific routes do not have a defined error handler.
    * **Handler Parameters:** `(Request: request, Response: response, Error: error) => {}`.
* `set_not_found_handler(Function: handler)`: Binds a global catch-all not found handler that will handle all requests which are not handled by any routes.
    * **Handler Parameters:** `(Request: request, Response: response) => {}`.
* `use(...2 Overloads)`: Binds middlewares and mounts `Router` instances on the optionally specified pattern hierarchy.
    * **Overload Types**:
      * `use(Function | Router: ...handler)`: Binds the specified functions as middlewares and mounts the `Router` instances on the `/` pattern.
      * `use(String: pattern, Function | Router: ...handler)`: Binds the specified functions as middlewares and mounts the `Router` instances on the specified `pattern` hierarchy.
    * **Note** `pattern` is treated as a wildcard match by default and does not support `*`/`:param` prefixes.
    * **See** [`> [Router]`](./Router.md) & [`> [Middlewares]`](./Middlewares.md) for **full documentation** on this method.
* `any(...4 Overloads)`: Creates an HTTP route on the specified pattern. Alias methods are listed below for all available HTTP methods.
    * **Alias Methods:** `all()`, `get()`, `post()`, `put()`, `delete()`, `head()`, `options()`, `patch()`, `trace()`, `connect()`, `upgrade()`, `ws()`.
    * **Overload Types**:
      * `any(String: pattern, Function: handler)`: Creates an any method HTTP route with the specified `handler`.
      * `any(String: pattern, Object: options, Function: handler)`: Creates an any method HTTP route with the specified `options` and `handler`.
      * `any(String: pattern, Function: middleware, Function: handler)`: Creates an any method HTTP route with the specified route-specific `middleware` and `handler`.
      * `any(String: pattern, Function[]: middlewares, Function: handler)`: Creates an any method HTTP route with the specified set of route-specific `middlewares` and `handler`.
    * **See** [`> [Router]`](./Router.md) for full documentation on this method.
    * **See** [`> [Websocket]`](./Websocket.md) for usage documentation on the `upgrade()` and `ws()` alias method.
* `publish(String: topic, String|Buffer|ArrayBuffer: message, Boolean?: is_binary, Boolean?: compress)`: Publishes the specified message to the specified topic in **MQTT syntax** to all WebSocket connections on this Server instance.
    * **Returns** a `Boolean` to signify whether the publish was successful or not.
* `num_of_subscribers(String: topic)`: Returns the number of subscribers to a topic across all WebSocket connections on this server instance.
    * **Returns** a `number` of connections.
