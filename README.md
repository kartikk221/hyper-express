# HyperExpress: High Performance Node.js Webserver
#### Powered by [`uWebSockets.js`](https://github.com/uNetworking/uWebSockets.js/)

<div align="left">

[![NPM version](https://img.shields.io/npm/v/hyper-express.svg?style=flat)](https://www.npmjs.com/package/hyper-express)
[![NPM downloads](https://img.shields.io/npm/dm/hyper-express.svg?style=flat)](https://www.npmjs.com/package/hyper-express)
[![Language grade: JavaScript](https://img.shields.io/lgtm/grade/javascript/g/kartikk221/hyper-express.svg?logo=lgtm&logoWidth=18)](https://lgtm.com/projects/g/kartikk221/hyper-express/context:javascript)
[![GitHub issues](https://img.shields.io/github/issues/kartikk221/hyper-express)](https://github.com/kartikk221/hyper-express/issues)
[![GitHub stars](https://img.shields.io/github/stars/kartikk221/hyper-express)](https://github.com/kartikk221/hyper-express/stargazers)
[![GitHub license](https://img.shields.io/github/license/kartikk221/hyper-express)](https://github.com/kartikk221/hyper-express/blob/master/LICENSE)

</div>

## Motivation
HyperExpress aims to be a simple yet perfomant HTTP & Websocket Server. Combined with the power of uWebsockets.js, a Node.js binding of uSockets written in C++, HyperExpress allows developers to unlock higher throughput for their web applications with their existing hardware. This can allow many web applications to become much more performant on optimized data serving endpoints without having to scale hardware.

Some of the prominent features implemented are:
- Simplified HTTP API
- Simplified Websocket API
- Asynchronous By Nature
- Middleware Support
- Global Handlers
- Built-in Session Engine
- Cryptographically Secure Cookie Signing/Authentication

## What's Different?
While there may be other uWebsockets.js based packages available, HyperExpress differentiates itself in the following ways:
- Instantaneous Request Handling
    - HyperExpress implements a request handling model similar to fetch where a request is passed almost instantly to the route handler and the request body can be asynchronously dowloaded/accessed. This behavior allows for aborting of a request and potentially saving on memory usage for endpoints that deal with relatively larger body sizes as the body simply won't be downloaded into memory without access.
- Simple To Use API
    - HyperExpress implements simple yet understandable methods/properties for its components to allow for clear and concise code that is at many times chainable and asynchronous.
- Lightweight Package Size
    - HyperExpress is extremely lightweight while implementing almost all of the core functionalities of a webserver providing users with flexibility.
- High Maintainability
    - Whether you decide to develop on your own fork or expand upon HyperExpress through middlewares, You will be greeted with a concise codebase with descriptive logic comments and JSDoc types that allow for high maintainability.
- MIT License
    - Some other webserver packages are released under more restrictive licenses and often provide paid "performance efficient" versions of their package. HyperExpress is provided with a flexible MIT licence in which you are free to expand upon the package as you desire while also being able to take advantage of the efficient and maintainable codebase at no cost.

## Installation
HyperExpress can be installed using node package manager (`npm`)
```
npm i hyper-express
```

## Table Of Contents
- [HyperExpress: High Performance Node.js Webserver](#hyperexpress-high-performance-nodejs-webserver)
      - [Powered by `uWebSockets.js`](#powered-by-uwebsocketsjs)
  - [Motivation](#motivation)
  - [What's Different?](#whats-different)
  - [Installation](#installation)
  - [Table Of Contents](#table-of-contents)
  - [Benchmarks](#benchmarks)
      - [CLI Command](#cli-command)
    - [Environment Specifications](#environment-specifications)
    - [Benchmark Results](#benchmark-results)
  - [Examples](#examples)
      - [Example: Create server instance](#example-create-server-instance)
      - [Example: Retrieving properties and JSON body](#example-retrieving-properties-and-json-body)
      - [Example: Forbidden request scenario utilizing multiple response methods](#example-forbidden-request-scenario-utilizing-multiple-response-methods)
      - [Example: Using Global & Route/Method Specific Middlewares](#example-using-global--routemethod-specific-middlewares)
      - [Example: Initializing & Binding A Session Engine With Redis Store Implementation](#example-initializing--binding-a-session-engine-with-redis-store-implementation)
      - [Example: Initiating and storing visits in a session](#example-initiating-and-storing-visits-in-a-session)
      - [Example: Initializing and using a new Websocket Route](#example-initializing-and-using-a-new-websocket-route)
      - [Example: Utilizing Websocket connection](#example-utilizing-websocket-connection)
  - [Server](#server)
      - [Server Constructor Options](#server-constructor-options)
      - [Server Instance Properties](#server-instance-properties)
      - [Server Instance Methods](#server-instance-methods)
  - [Request](#request)
      - [Request Properties](#request-properties)
      - [Request Methods](#request-methods)
  - [Response](#response)
      - [Response Properties](#response-properties)
      - [Response Methods](#response-methods)
  - [SessionEngine](#sessionengine)
      - [SessionEngine Constructor Options](#sessionengine-constructor-options)
      - [SessionEngine Methods](#sessionengine-methods)
  - [Session](#session)
      - [Session Properties](#session-properties)
      - [Session Methods](#session-methods)
  - [WebsocketRoute](#websocketroute)
      - [WebsocketRoute Methods](#websocketroute-methods)
  - [Websocket](#websocket)
      - [Websocket Properties](#websocket-properties)
      - [Websocket Methods](#websocket-methods)
  - [License](#license)

## Benchmarks
Below benchmark results were derived using the **[autocannon](https://www.npmjs.com/package/autocannon)** HTTP benchmarking utility. The benchmark source code is included in this repository in the benchmarks folder.

#### CLI Command
This command simulates a high stress situation where **2500 unique visitors** visit your website at the same time and their browsers on average make **4 pipelined requests** per TCP connection sustained for **30 seconds**.
```
autocannon -c 2500 -d 30 -p 4 http://HOST:PORT/benchmark
```

### Environment Specifications
* __Machine:__ Ubuntu 20.04 | 1 vCPU | 1GB Mem | 32GB Nvme | Vultr @ $6/Month
* __Node:__ `v16.0.0`
* __Method:__ Two rounds; one to warm-up, one to measure
* __Response Body:__ Small HTML page with a dynamic timestamp generated with `Date`. See more in [HTML Test](./benchmarks/tests/simple_html.js).
* __Linux Optimizations:__ None.

### Benchmark Results
**Note!** uWebsockets.js and HyperExpress were bottlenecked by the network speed of the Vultr instance. While, Fastify and Express were bottlenecked by high CPU usage resulting in a much lower throughput with relatively higher latency numbers. For average use cases, all webservers below can serve requests at lower than **50ms** latency.

|                          | Version | Requests/s | Latency | Throughput/s |
| :--                      | --:     | :-:        | --:     | --:          |
| uWebsockets.js           | 19.4.0  | 197,865    | 398 ms   | 107 Mb/s    |
| HyperExpress             | 3.1.0  | 196,223    | 403 ms   | 106 Mb/s     |
| Fastify                  | 3.21.6  | 15,688     | 673 ms   | 9 Mb/s      |
| Express                  | 4.17.1  | 5,621      | 1685 ms   | 3.8 Mb/s   |

## Examples
Below are various examples that make use of most classes and methods in HyperExpress.

#### Example: Create server instance
```javascript
const HyperExpress = require('hyper-express');
const webserver = new HyperExpress.Server();

// Do some stuff like binding routes or handlers

// Activate webserver by calling .listen(port, callback);
webserver.listen(80)
.then((socket) => console.log('Webserver started on port 80'))
.catch((error) => console.log('Failed to start webserver on port 80'));
```

#### Example: Retrieving properties and JSON body 
```javascript
webserver.post('/api/v1/delete_user/:id', async (request, response) => {
   let headers = request.headers;
   let id = request.path_parameters.id;
   let body = await request.json(); // we must await as .json() returns a Promise
   // body will contain the parsed JSON object or an empty {} object on invalid JSON
   
   // Do some stuff here
});
```

#### Example: Forbidden request scenario utilizing multiple response methods
```javascript
webserver.post('/api/v1/delete_user/:id', async (request, response) => {
   // Some bad stuff happened and this request is now forbidden
   
   // All methods EXCEPT "response ending methods" such as send(), json(), upgrade() support chaining
   response
   .status(403) // Status must be called before any header/cookie/send method calls
   .header('x-app-id', 'some-app-id') // Sets some random header
   .header('x-upstream-location', 'some_location') // Sets some random header
   .cookie('frontend_timeout', 'v1/delete_user', 1000 * 60 * 30, {
       secure: true,
       httpOnly: true
   }) // Sets some frontend cookie for enforcing front-end timeout
   .delete_cookie('some_sess_id') // Deletes some session id cookie
   .type('html') // Sets content-type header according to 'html'
   .send(rendered_html) // Sends response with rendered_html (String) as the body
});
```

#### Example: Using Global & Route/Method Specific Middlewares
```javascript
// Assume webserver is a HyperExpress.Server instance

// Bind a global middleware
// These are executed on all requests in the order they are bound with .use() calls
// These also execute before route/method specific middlewares as they are global
webserver.use((request, response, next) => {
    // Do some asynchronous stuff
    some_asynchronous_call((data) => {
        // you can assign values onto the request and response objects to be accessed later
        request.some_data = data;
        
        // We're all done, so let's move on
        return next();
    });
});

const specific_middleware1 = (request, response, next) => {
    console.log('route specific middleware 1 ran!');
    return next();
};

const specific_middleware2 = (request, response, next) => {
    console.log('route specific middleware 2 ran!');
    return next();
};

// Bind a route/method specific middleware
// Middlewares are executed in the order they are specified in the middlewares Array
webserver.get('/', {
    middlewares: [specific_middleware1, specific_middleware2]
}, (request, response) => {
    // Handle your request as you normally would here
    return response.send('Hello World');
});
```

#### Example: Initializing & Binding A Session Engine With Redis Store Implementation
```javascript
// Create new SessionEngine instance
// Note! You can only bind a single SessionEngine to a webserver instance
const session_engine = new HyperExpress.SessionEngine({
    default_duration: 1000 * 60 * 45, // Default duration is 45 Minutes
    signature_secret: 'SomeSuperSecretForSigningCookies',
    cookie: {
        name: 'example_sess',
        path: '/',
        httpOnly: true,
        secure: true,
        sameSite: 'strict'
    }
});

// Bind session engine handlers for storing sessions in Redis store

session_engine.on('read', async (session) => {
    const data = await redis.get('session:' + session.id);
    if(typeof data == 'string') return JSON.parse(data);
});

session_engine.on('touch', async (session) => {
    return await redis.pexpireat('session:' + session.id, session.expires_at);
});

session_engine.on('write', async (session) => {
    const key = 'session:' + session.id;

    // We use redis pipeline to perform two operations in one go
    return await redis.pipeline()
    .set(key, JSON.stringify(session.get_all()))
    .pexpireat(key, session.expires_at)
    .exec();
});

session_engine.on('destroy', async (session) => {
    return await redis.del('session:' + session.id);
});

// Bind SessionEngine to Webserver instance
webserver.set_session_engine(session_engine);

// Add some routes here
```

#### Example: Initiating and storing visits in a session
```js
webserver.get('/dashboard/news', async (request, response) => {
   // Initiate a session asynchronously
   await request.session.start();
   
   // Read session for visits property and iterate
   let visits = request.session.get('visits');
   if(visits == undefined){
        request.session.set('visits', 1); // Initiate visits property in session
   } else {
        request.session.set('visits', visits + 1); // Iterate visists by 1
   }
   
   return response.html(news_html);
});
```

#### Example: Initializing and using a new Websocket Route
```js
const HyperExpress = require('hyper-express');
const webserver = new HyperExpress.Server();

// Create new WebsocketRoute instance
const news_ws_route = webserver.ws('/api/v1/ws/connect', {
    compression: HyperExpress.compressors.DISABLED,
    idleTimeout: 32,
    maxBackPressure: 1024 * 1024,
    maxPayloadLength: 1024 * 32
});

// Handle connection 'upgrade' event
news_ws_route.on('upgrade', async (request, response) => {
    // Some asynchronous database calls/verification can be done here
    
    // Reject upgrade request if verification fails
    if(verified !== true) return response.status(403).send('Forbidden Request');
    
    // Upgrade request to a websocket connection if verified
    response.upgrade({
        user_id: some_user_id // Include some metadata about websocket for future use
    });
});

// Handle connection 'open' event
news_ws_route.on('open', (ws) => {
   console.log(ws.user_id + ' is now connected using websockets!'); 
});

// Handle connection 'message' event
news_ws_route.on('message', (ws, message, isBinary) => {
    console.log(ws.user_id + ' sent message: ' + message); 
});

// Handle connection 'close' event
news_ws_route.on('close', (ws, code, message) => {
   console.log(ws.user_id + ' has disconnected!'); 
});
```

#### Example: Utilizing Websocket connection
```js
// Assume HyperExpress and a WebsocketRoute has already been setup/initiated

news_ws_route.on('message', (ws, message) => {
    ws.send('Acknowleged: ' + message); // Replies with incoming message
});
```

## Server
Below is a breakdown of the `Server` object class generated while creating a new webserver instance.

#### Server Constructor Options
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
* `max_body_length` [`Number`]: Maximum number of `bytes` allowed for incoming request body size. For reference, **1kb** = **1000 Bytes** and **1mb** = **1000kb**.
  * **Default:** `250 * 1000` or **250kb**


#### Server Instance Properties
| Property  | Type     | Description                |
| :-------- | :------- | :------------------------- |
| `error_handler` | `Function` | Global catch-all error handler function. |
| `session_engine` | `SessionEngine` | Session Engine bound to current instance. |
| `uws_instance` | `uWS` | Underlying uWebsockets TemplatedApp instance. |
| `routes` | `Object` | All routes created on current instance. |
| `fast_buffers` | `Boolean` | Whether fast buffering is enabled. |

#### Server Instance Methods
* `listen(Number: port, String: host)`: Starts the uWebsockets server on specified port.
    * **Returns** a `Promise` and resolves `uw_listen_socket`.
    * **Note** port is required and host is `0.0.0.0` by default.
* `close(uws_socket: socket)`: Closes the uWebsockets server gracefully.
    * **Note**: socket is not required.
* `set_error_handler(Function: handler)`: Binds a global catch-all error handler that will attempt to catch mostsynchronous/asynchronous errors.
    * **Handler Parameters:** `(Request: request, Response: response, Error: error) => {}`.
* `set_not_found_handler(Function: handler)`: Binds a global catch-all not found handler that will handle all requests which are not handled by any routes.
    * **Handler Parameters:** `(Request: request, Response: response) => {}`.
* `set_session_engine(SessionEngine: engine)`: Binds specified session engine to current webserver and populates **request.session** with sessions based on engine settings.
* `use(Function: handler)`: Binds a global middleware for all incoming requests.
    * **Handler Parameters:** `(Request: request, Response: response, Function: next) => {}`.
    * **Note** you must call `next()` at the end of your middleware execution.
* `any(String: pattern, Object: options, Function: handler)`: Creates an HTTP route on specified pattern. Alias methods are listed below for HTTP method specific routes.
    * **Alias Methods:** `get()`, `post()`, `delete()`, `head()`, `options()`, `patch()`, `trace()`, `connect()`.
    * **Handler Parameters:** `(Request: request, Response: response) => {}`.
    * `options`[`Object`] (**Optional**)
      * `middlewares`[`Array`]: Can be used to provide route/method specific middlewares.
        * **Note!** Route specific middlewares **NOT** supported with `any` method routes.
        * **Note!** Middlewares are executed in the order provided in `Array` provided.
        * **Note!** Global middlewares will be executed before route specific middlewares are executed.
    * **Supports** both synchronous and asynchronous handler.
    * **Supports** path parameters with `:` prefix. Example: `/api/v1/users/:action/:id`.
    * **Note** pattern string must be a `strict` match and trailing-slashes will be treated as different paths.
* `ws(String: pattern, Object: options)`: Creates a websocket route on specified pattern.
    * **Returns** a `WebsocketRoute` instance which can be used to handle upgrade and connection events.
    * `options`:
        * `messageType`[`String`]: Specifies which in which data type to provide incoming websocket messages.
            * **Default**: `'String'` 
            * Must be on of [`'String'`, `'Buffer'`, `'ArrayBuffer'`].
            * **Note!** `ArrayBuffer` is only accessible for the first synchronous execution.
        * `compression`[`Number`]: Specifies permessage-deflate compression to use.
            * **Default**: `'DISABLED'` 
            * Must pass one of the constants from `require('hyper-express').compressors`.
        * `idleTimeout`[`Number`]: Specifies interval to automatically timeout/close idle websocket connection in **seconds**.
            * **Default**: `32` 
        * `maxBackpressure`[`Number`]: Specifies maximum websocket backpressure allowed in character length.
            * **Default**: `1048576` (1024 * 1024) 
        * `maxPayloadLength`[`Number`]: Specifies maximum length allowed on incoming messages.
            * **Note** any client who crosses this limit will immediately be disconnected. 
            * **Default**: `32768` (32 * 1024) 

## Request
Below is a breakdown of the `request` object made available through the route handler(s) and websocket upgrade event handler(s).

#### Request Properties
| Property  | Type     | Description                |
| :-------- | :------- | :------------------------- |
| `raw` | `uWS.Request`  | Underlying uWebsockets.js request object.|
| `method` | `String`  | Request HTTP method in uppercase. |
| `url` | `String`  | Full path + query string. |
| `path` | `String`  | Request path.|
| `query` | `String`  | Query string without the `?`.|
| `headers` | `Object`  | Request Headers from incoming request. |
| `cookies` | `Object`  | Request cookies from incoming request. |
| `session` | `Session`  | Session object made available when a session engine is active. |
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
* `json(Any: default_value)`: Parses body as a JSON Object from incoming request.
    * **Returns** `Promise` which is then resolved to an `Object` or `typeof default_value`.
    * **Note** this method returns the specified `default_value` if JSON parsing fails instead of throwing an exception. To have this method throw an exception, pass `undefined` for `default_value`.
    * **Note** `default_value` is `{}` by default meaning `json()` is a safe method even if incoming body is invalid json.

## Response
Below is a breakdown of the `response` object made available through the route handler(s) and websocket upgrade event handler(s).

#### Response Properties
| Property  | Type     | Description                |
| :-------- | :------- | :------------------------- |
| `raw` | `uWS.Response`  | Underlying uWebsockets.js response object. |
| `aborted` | `Boolean`  | Signifies whether the request has been aborted by sender. |

#### Response Methods
* `atomic(Function: callback)`: Alias of uWebsockets's `cork(callback)` method.
    * **Usage:** Wrapping multiple response method calls inside this method can improve performance.
* `hook(String: type, Function: handler)`: Registers a hook handler for the specified event type.
  * **Note!** hooks will be called in the order they were registered on the response object. 
  * **Supported Hook Types:**
    * [`abort`]: These hooks will get called when the response is aborted.
    * [`complete`]: These hooks will get called after response has been sent and the request is complete.
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
* `upgrade(Object: data)`: Upgrades incoming request to a websocket connection.
    * `data` is optional and can be used to store data attributes on the websocket connection object.
    * **Note** this method can only be used inside the `upgrade` handler of a WebsocketRoute.
* `redirect(String: url)`: Writes 302 header to redirect incoming request to specified url.
* `write(String|Buffer|ArrayBuffer: chunk)`: Writes specified chunk as response. Use this method with streams to send response body in chunks.
    * **Note** the `send()` must still be called to end the request.
* `send(String|Buffer|ArrayBuffer: body)`: Writes specified body and sends response.
* `json(Object: body)`: Alias of `send()`. Sets mime type to `json` and sends response.
* `html(String: body)`: Alias of `send()`. Sets mime type to `html` and sends response.
* `file(String: path)`: Alias of `send()`. Sets appropriate mime type if one has not been set yet and sends file content at specified path as response body.
  * **Note!** An appropriate `content-type` will automatically be written if no `content-type` header is written by user prior to this method.
  * **Note!** This method should be avoided for large files as served files are cached in memory and watched for changes to allow for high performance with near instant content reloading.
* `throw_error(Error: error)`: Calls global catch-all error handler with specified error.

## SessionEngine
Below is a breakdown of the `SessionEngine` object class generated while creating a new `SessionEngine` instance.

#### SessionEngine Constructor Options
* `signature_secret` [`String`]: Specifies secret value used to sign/authenticate session cookies.
    * This parameter is **Required** and must be **Unique** and kept secret.
* `default_duration`[`Number`]: Specifies default cookie and session duration in **milliseconds**.
* `require_manual_touch`[`Boolean`]: Specifies whether active sessions should be automatically touched upon incoming requests.
* `cookie_options`[`Object`]: Specifies session cookie options.
    * `name`[`String`]: Cookie Name
    * `domain`[`String`]: Cookie Domain
    * `path`[`String`]: Cookie Path
    * `secure`[`Boolean`]: Adds Secure Flag
    * `httpOnly`[`Boolean`]: Adds httpOnly Flag
    * `sameSite`[`Boolean`, `'none'`, `'lax'`, `'strict'`]: Cookie Same-Site Preference

#### SessionEngine Methods
* `on(String: type, Function: handler)`: Binds an event handler for specified event `type`.
    * **Note** you must use your own storage implementation in combination with available events below.
    * **Supported Event Types:**
        * [`read`]: Must read and return session data as an `Object` from your storage.
            * **Parameters**: `(Session: session) => {}`.
            * **Expects** A `Promise` which then resolves to an `Object` or `undefined` type.
            * **Required**
        * [`touch`]: Must update session expiry timestamp in your storage.
            * **Parameters**: `(Session: session) => {}`.
            * **Expects** A `Promise` which is then resolved to `Any` type.
            * **Required**
        * [`write`]: Must write session data and update expiry timestamp to your storage.
            * **Parameters**: `(Session: session) => {}`.
              * You can use `session.stored` to determine if you need to `INSERT` or `UPDATE` for SQL based implementations.
            * **Expects** A `Promise` which then resolves to `Any` type.
            * **Required**
        * [`destroy`]: Must destroy session from your storage.
            * **Parameters**: `(Session: session) => {}`.
            * **Expects** A `Promise` which then resolves to `Any` type.
            * **Required**
        * [`id`]: Must return a promise that generates and resolves a cryptographically random id.
            * **Parameters**: `() => {}`.
            * **Expects** A `Promise` which then resolves to `String` type.
            * **Optional**
        * [`cleanup`]: Must clean up expired sessions from your storage.
            * **Parameters**: `() => {}`.
            * **Expects** A `Promise` which then resolves to `Any` type.
            * **Optional**
* `cleanup()`: Triggers `cleanup` event to delete expired sessions from storage.

## Session
Below is a breakdown of the `session` object made available through the `request.session` property in route handler(s) and websocket upgrade event handler(s).

#### Session Properties
| Property  | Type     | Description                |
| :-------- | :------- | :------------------------- |
| `id`      | `Number` | Raw session id for current request. |
| `signed_id` | `Number`  | Signed session id for current request. |
| `ready` | `Boolean`  | Specifies whether session has been started. |
| `stored` | `Boolean`  | Specifies whether session is already stored in database. |
| `duration` | `Number`  | Duration in **milliseconds** of current session. |
| `expires_at` | `Number`  | Expiry timestamp in **milliseconds** of current session. |

#### Session Methods
* `generate_id()`: Asynchronously generates and returns a new session id from `'id'` session engine event.
    * **Returns** `Promise`->`String`
* `set_id(String: session_id)`: Overwrites/Sets session id for current request session.
    * **Note** this method is not recommended in conjunction with user input as it performs no verification.
    * **Returns** `Session`
* `set_signed_id(String: signed_id, String: secret)`: Overwrites/Sets session id for current request session.
    * **Note** this method is **recommended** over the above method as it will first unsign/verify the provided signed id and then update the state of current session.
    * `secret` is **optional** as this method uses the underlying `SessionEngine` specified secret by default.
    * **Returns** `Session`
* `set_duration(Number: duration)`: Sets a custom session lifetime duration for current session.
    * **Note** this method stores the custom duration value as a part of the session data in a prefix called `__cust_dur`.
* `start()`: Starts session on incoming request and loads session data from storage source.
    * **Returns** `Promise`.
* `roll()`: Rolls current session's id by migrating current session data to a new session id.
    * **Returns** `Promise`
* `touch()`: Updates current session's expiry timestamp in storage.
    * **Returns** `Promise`
    * **Note** This method is automatically called after a request ends unless `require_manual_touch` is set to `true` in `SessionEngine` settings.
* `destroy()`: Destroys current session from storage and set's cookie header to delete session cookie.
    * **Returns** `Promise`
* `set(String: name, Any: value)`: Sets session data value.
* `set_all(Object: data)`: Overwrites all session data with provided `Object`.
* `get(String: name)`: Returns session data value for specified name.
    * **Returns** `Any` or `undefined`
* `get_all()`: Returns all session data.
    * **Returns** `Object`
* `delete(String: name)`: Deletes session data value.
* `delete_all()`: Deletes all session data.

## WebsocketRoute
Below is a breakdown of the `WebsocketRoute` object class generated and returned when calling `ws()` route method.

#### WebsocketRoute Methods
* `on(String: type, Function: handler)`: Binds event handler for specified event type.
    * Event `'upgrade'`: Handles incoming upgrade requests.
        * `handler`: `(Request: request, Response: response, uws_socket: socket) => {}`.
        * **Upgrade** incoming requests using `Request.upgrade(user_data)` method.
        * **Optional** but all connections are upgraded automatically if this event is not handled.
    * Event `'open'`: Handles newly opened websocket connections.
        * `handler`: `(Websocket: websocket) => {}`.
    * Event `'message'`: Handles incoming messages from websocket connections.
        * `handler`: `(Websocket: websocket, String: message, Boolean: isBinary) => {}`.
    * Event `'drain'`: Handles drainage of websocket connections with backpressure.
        * `handler`: `(Websocket: websocket) => {}`.
    * Event `'close'`: Handles closing of websocket connections.
        * `handler`: `(Websocket: websocket, Number: code, String: message) => {}`.

## Websocket
Below is a breakdown of the `Websocket` (`uWS.Websocket`) connection object made available through `WebsocketRoute` event handlers representing connections.

#### Websocket Properties
The `Websocket` object has no inherent properties and only contains the `data` provided during the `upgrade(data)` call as its properties.

#### Websocket Methods
* `close()`: Forcefully closes the connection and immediately calls the close handler.
    * **Note** no protocol close message is sent.
    * Only recommended under extreme circumstances.
* `end(Number: code, String: message)`: Gracefully closes the connection and writes specified code and message.
    * **Note** this method is recommended for most use-cases.
* `send(String|Buffer|ArrayBuffer: message, Boolean: isBinary, Boolean: compress)`: Sends specified message over websocket connection.
    * **Returns** `Boolean`
    * **Note** this method returns `false` when sending fails due to built up backpressure.
* `cork(Function: callback)`: Similar to `Response.atomic()`. Improves network performance for operations.
* `getBufferedAmount()`: Returns number of bytes buffered in backpressure.
* `getRemoteAddress()`: Returns the remote IP address in Binary.
* `getRemoteAddressAsText()`: Returns the remote Ip address as text.
* `getTopics()`: Returns a list of topics this connection is subscribed to.
* `ping(String: message)`: Sends a ping control message according to protocol with specified message.
* `subscribe(String: topic)`: Subscribes connection to specified topic.
* `unsubscribe(String: topic)`: Unsubscribes connection from the specified topic.
* `isSubscribed(String: topic)`: Returns a `Boolean` result of whether this connection is subscribed to specified topic.
* `publish(String: topic, String: message, Boolean: isBinary, Boolean: compress)`: Publishes a message to specified topic.

## License
[MIT](./LICENSE)