# Router
Below is a breakdown of the `Router` object which is essentially a mini-app that allows your application to be modular. A single `Router` can be used with multiple `Server` instances as routers simply hold route information which is then used with the `use()` method.

### Modularity With Routers
Routers allow you to group specific routes under their own branch which you can then assign onto a master branch. The example below shows how all routes for an api version can be bound to a single router and then that router can be bound to the webserver to automatically bind all sub-routes.
```javascript
const api_v1_router = new HyperExpress.Router();

// Create routes directly on the Router
api_v1_router.post('/register', async (request, response) => {
    // Destructure request body and register an account asynchronously
    const { email, password, captcha } = await request.json();
    const id = await register_account(email, password, captcha);
    
    // Respond with the user's account id
    return response.json({
        id
    })
});

// Assume webserver is a HyperExpress.Server instance
// This will cause all routes in the api_v1_router to listen on '/api/v1'
// This means the example route above would listen on '/api/v1/register'
webserver.use('/api/v1', api_v1_router);
```

### Router Instance Properties
| Property  | Type     | Description                |
| :-------- | :------- | :------------------------- |
| `routes` | `Array` | Routes contained in this router. |
| `middlewares` | `Array` | Middlewares contained in this router in proper execution order. |

### Router Instance Methods
* `use(...2 Overloads)`: Binds middlewares and mounts `Router` instances on the optionally specified pattern hierarchy.
    * **Overload Types**:
      * `use(Function | Router: ...handler)`: Binds the specified functions as middlewares and mounts the `Router` instances on the `/` pattern.
      * `use(String: pattern, Function | Router: ...handler)`: Binds the specified functions as middlewares and mounts the `Router` instances on the specified `pattern` hierarchy.
    * **Middlewares**
        * **Callback Example:** `(Request: request, Response: response, Function: next) => {}`.
        * **Promise Example:** `(Request: request, Response: response) => new Promise((resolve, reject) => { /* Call resolve() in here */ })`.
        * **Note** you must ensure that each middleware iterates by executing the `next` callback or resolving the returned `Promise`.
        * **Note** calling `next(new Error(...))` or resolving/rejecting with an `Error` will call the global error handler.
        * **Note** you must **NOT** call `next()` while also resovling the async promise of a middleware to prevent double iterations.
    * **Note** `pattern` is treated as a wildcard match by default and does not support `*`/`:param` prefixes.
        * **Example:** A `GET /users/:id` route from a `Router` used with `use('/api/v1', router)` call will be created as `GET /api/v1/users/:id`.
        * **Example:** A middleware assigned directly to a `Router` used with `use('/api', router)` will execute for all routes that begin with `/api`.
* `any(...4 Overloads)`: Creates an HTTP route on the specified pattern. Alias methods are listed below for all available HTTP methods.
    * **Alias Methods:** `get()`, `post()`, `put() `, `delete()`, `head()`, `options()`, `patch()`, `trace()`, `connect()`, `upgrade()`.
    * **Overload Types**:
      * `any(String: pattern, Function: handler)`: Creates an `any` method HTTP route with the specified `handler`.
      * `any(String: pattern, Object: options, Function: handler)`: Creates an `any` method HTTP route with the specified route `options` and `handler`.
      * `any(String: pattern, Function | Function[]: ...middleware, Function: handler)`: Creates an `any` method HTTP route with the specified route-specific `middleware(s)` and `handler`.
      * `any(String: pattern, Object: options, Function | Function[]: ...middleware, Function: handler)`: Creates an `any` method HTTP route with the specified route-specific `middleware(s)`, `options` and `handler`.
        * **Route Handler Example**: `(Request: request, Response: response) => {}`.
    * `options`[`Object`]: Route options can be utiliized to override and specify options specific to a route.
      * `max_body_length`[`Number`]: Overrides the global `Server.max_body_length` parameter used to enforce a maximum body size limit for this route.
      * `middlewares`[`Array`]: Can be used to provide route specific middlewares.
        * **Note!** Route specific middlewares **NOT** supported with `any` method routes.
        * **Note!** Middlewares are executed in the order provided in the `Array` provided.
        * **Note!** Global/Router middlewares will be executed before route specific middlewares are executed.
      * `streaming`[`Object`]: Specifies global constructor options for internal readable and writable streams.
        * `readable`[`stream.ReadableOptions`]: Constructor options for `Request` body readable streams.
          * See the official [`> [ReadableOptions]`](https://nodejs.org/api/stream.html#new-streamreadableoptions) Node.js documentation for more information.
        * `writable`[`stream.WritableOptions`]:  Constructor options for `Response` body writable streams.
          * See the official [`> [WritableOptions]`](https://nodejs.org/api/stream.html#new-streamwritableoptions) Node.js documentation for more information.
    * **Note** `pattern` is treated as a **strict** match and trailing-slashes will be treated as different paths.
    * **Supports** both synchronous and asynchronous route `handler` functions.
    * **Supports** path parameters with `:param` prefix. 
        * **Example:** `/api/v1/users/:action/:id` will populate `Request.path_parameters` with `id` value from path.
* `ws(String: pattern, Object: options, Function: handler)`: Creates a **websocket** listening route allowing for websocket connections.
    * **Example Handler**: `(Websocket: ws) => { /* A websocket connection has opened */ }`
    * **Parameter** `options`[`Object`]: This parameter is **optional** thus you can simply provide a `pattern` and `handler` for simpler code.
        * `idle_timeout`[`Number`]: Number of **seconds** after which a websocket connection will be disconnected after inactivity.
            * **Default**: `32`
            * **Note** this number must be a factor of 4 meaning `idle_timeout % 4 == 0` due to a uWebsockets requirement.
        * `message_type`[`String`]: Data type in which to process and emit messages from connections.
            * **Default**: `String`
            * **Must be one of** `String`, `Buffer`, `ArrayBuffer`
            * **Note** `ArrayBuffer` is directly passed from uWebsockets handler thus it is only memory allocated for a synchronous operation.
        * `compression`[`Number`]: Defines the type of per message deflate compression to use.
            * **Default**: `HyperExpress.compressors.DISABLED`
            * Please provide one of the constants from `require('hyper-express').compressors`.
                * `DISABLED`, `SHARED_COMPRESSOR`, `DEDICATED_COMPRESSOR_3KB`, `DEDICATED_COMPRESSOR_4KB`, `DEDICATED_COMPRESSOR_8KB`, `DEDICATED_COMPRESSOR_16KB`, `DEDICATED_COMPRESSOR_32KB`, `DEDICATED_COMPRESSOR_64KB`, `DEDICATED_COMPRESSOR_128KB`, `DEDICATED_COMPRESSOR_256KB`
        * `max_backpressure`[`Number`]: Maximum length of allowed backpressure per connection when publishing or sending messages.
            * **Default**: `1024 * 1024` > `1,048,576`
            * **Note** slow receivers with too high backpressure will be skipped and timeout until they catch up.
        * `max_payload_length`[`Number`]: Maximum length of allowed incoming messages per connection.
            * **Default**: `32 * 1024` > `32,768`
            * **Note** any connection that sends a message larger than this number will be immediately closed.
    * **See** [`> [Websocket]`](./Websocket.md) for usage documentation on this method and working with websockets.