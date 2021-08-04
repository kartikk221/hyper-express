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
HyperExpress aims to be a simple and perfomant HTTP & Websocket Server.
Some of the prominent features implemented are:
- Simplified HTTP API
- Simplified Websocket API
- Asynchronous By Nature
- Middleware Support
- Global Handlers
- Built-in Session Engine
- Cryptographically Secure Cookie Signing/Authentication

  
## Installation
HyperExpress can be installed using node package manager (`npm`)
```
npm i hyper-express
```

## Table Of Contents
- [HyperExpress: High Performance Node.js Webserver](#hyperexpress-high-performance-nodejs-webserver)
      - [Powered by `uWebSockets.js`](#powered-by-uwebsocketsjs)
  - [Motivation](#motivation)
  - [Installation](#installation)
  - [Table Of Contents](#table-of-contents)
  - [Examples](#examples)
      - [Example: Create server instance](#example-create-server-instance)
      - [Example: Retrieving properties and JSON body](#example-retrieving-properties-and-json-body)
      - [Example: Forbidden request scenario utilizing multiple response methods](#example-forbidden-request-scenario-utilizing-multiple-response-methods)
      - [Example: Initializing & Binding A Session Engine](#example-initializing--binding-a-session-engine)
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

#### Example: Initializing & Binding A Session Engine
```javascript
const HyperExpress = require('hyper-express');
const webserver = new HyperExpress.Server();

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

// Bind SessionEngine to Webserver instance
webserver.set_session_engine(session_engine);

// Add some routes here

// Activate webserver by calling .listen(port, callback);
Webserver.listen(80)
.then((socket) => console.log('Webserver started on port 80'))
.catch((error) => console.log('Failed to start webserver on port 80: '));
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
news_ws_route.handle('upgrade', async (request, response) => {
    // Some asynchronous database calls/verification can be done here
    
    // Reject upgrade request if verification fails
    if(verified !== true) return response.status(403).send('Forbidden Request');
    
    // Upgrade request to a websocket connection if verified
    response.upgrade({
        user_id: some_user_id // Include some metadata about websocket for future use
    });
});

// Handle connection 'open' event
news_ws_route.handle('open', (ws) => {
   console.log(ws.user_id + ' is now connected using websockets!'); 
});

// Handle connection 'message' event
news_ws_route.handle('message', (ws, message, isBinary) => {
    console.log(ws.user_id + ' sent message: ' + message); 
});

// Handle connection 'close' event
news_ws_route.handle('close', (ws, code, message) => {
   console.log(ws.user_id + ' has disconnected!'); 
});

// Activate webserver by calling .listen(port, callback);
Webserver.listen(80)
.then((socket) => console.log('Webserver started on port 80'))
.catch((error) => console.log('Failed to start webserver on port 80: '));
```

#### Example: Utilizing Websocket connection
```js
// Assume HyperExpress and a WebsocketRoute has already been setup/initiated

news_ws_route.handle('message', (ws, message) => {
    ws.send('Acknowleged: ' + message); // Replies with incoming message
});
```

## Server
Below is a breakdown of the `Server` object class generated while creating a new webserver instance.

#### Server Constructor Options
* `key_file_name` [`String`]: Path to SSL private key file to be used for SSL/TLS.
    * **Example**: `'misc/key.pm'`
    * **Required** for an SSL server.
* `cert_file_name` [`String`]: Path to SSL certificate file.
    * **Example**: `'misc/cert.pm'`
    * **Required** for an SSL server.
* `passphrase` [`String`]: Strong passphrase for SSL cryptographic purposes.
    * **Example**: `'SOME_RANDOM_PASSPHRASE'`
    * **Required** for an SSL server.
* `dh_params_file_name` [`String`]: Path to SSL Diffie-Hellman parameters file.
    * **Example**: `'misc/dhparam4096.pm'`
    * **Optional** for an SSL server.
* `ssl_prefer_low_memory_usage` [`Boolean`]: Specifies uWebsockets to prefer lower memory usage while serving SSL requests.

#### Server Instance Properties
| Property  | Type     | Description                |
| :-------- | :------- | :------------------------- |
| `error_handler` | `Function` | Global catch-all error handler function. |
| `session_engine` | `SessionEngine` | Session Engine bound to current instance. |
| `uws_instance` | `uWS` | Underlying uWebsockets TemplatedApp instance. |
| `routes` | `Object` | All routes created on current instance. |

#### Server Instance Methods
* `listen(Number: port, String: host)`: Starts the uWebsockets server on specified port.
    * **Returns** a `Promise` and resolves `uw_listen_socket`.
    * **Note** port is required and host is `0.0.0.0` by default.
* `close(uws_socket: socket)`: Closes the uWebsockets server gracefully.
    * **Note**: socket is not required.
* `set_error_handler(Function: handler)`: Binds a global catch-all error handler that will attempt to catch mostsynchronous/asynchronous errors.
    * **Handler Parameters:** `(Request: request, Response: response, Error: error) => {}`.
* `set_error_handler(Function: handler)`: Binds a global catch-all not found handler that will handle all requests which are not handled by any routes.
    * **Handler Parameters:** `(Request: request, Response: response) => {}`.
* `set_session_engine(SessionEngine: engine)`: Binds specified session engine to current webserver and populates **request.session** with sessions based on engine settings.
* `use(Function: handler)`: Binds a global middleware for all incoming requests.
    * **Handler Parameters:** `(Request: request, Response: response, Function: next) => {}`.
    * **Note** you must call `next()` at the end of your middleware execution.
* `any(String: pattern, Function: handler)`: Creates an HTTP route on specified pattern. Alias methods are listed below for HTTP method specific routes.
    * **Handler Parameters:** `(Request: request, Response: response) => {}`.
    * **Alias Methods:** `get()`, `post()`, `delete()`, `head()`, `options()`, `patch()`, `trace()`, `connect()`.
    * **Supports** both synchronous and asynchronous handler.
    * **Supports** path parameters with `:` prefix. Example: `/api/v1/users/:action/:id`.
    * **Note** pattern string must be a `strict` match and trailing-slashes will be treated as different paths.
* `ws(String: pattern, Object: options)`: Creates a websocket route on specified pattern.
    * **Returns** a `WebsocketRoute` instance which can be used to handle upgrade and connection events.
    * `options`:
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
* `unsign(String: signed_value, String: secret)`: Attempts to unsign provided value with provided secret.
    * **Returns** `String` or `undefined` if signed value is invalid.
* `text()`: Parses body as a string from incoming request.
    * **Returns** `Promise` which is then resolved to a `String`.
* `json(Object: default_value)`: Parses body as a JSON Object from incoming request.
    * **Returns** `Promise` which is then resolved to an `Object`.
    * **Note** this method returns the specified `default_value` if JSON parsing fails instead of throwing an exception. To have this method throw an exception, pass `undefined` for `default_value`.

## Response
Below is a breakdown of the `response` object made available through the route handler(s) and websocket upgrade event handler(s).

#### Response Properties
| Property  | Type     | Description                |
| :-------- | :------- | :------------------------- |
| `raw` | `uWS.Request`  | Underlying uWebsockets.js response object. |
| `aborted` | `Boolean`  | Signifies whether the request has been aborted by sender. |

#### Response Methods
* `atomic(Function: callback)`: Alias of uWebsockets's `cork(callback)` method.
    * **Usage:** Wrapping multiple response method calls inside this method can improve performance.
* `status(Number: code)`: Writes HTTP status code for current request.
    * **Note** this method must be called before any other response/network methods.
    * **Note** this method can only be called once.
* `type(String: mime_type)`: Writes correct protocol `content-type` header for specified mime type.
    * **Example:** `response.type('json')` writes `application/json`
    * **Supported:** [Mime Types](./src/constants/mime_types.json)
* `header(String: name, String: value)`: Writes a response header.
* `cookie(String: name, String: value, Number: expiry, Object: options, Boolean: sign_cookie)`: Writes a cookie header to set cookie on response.
    * `expiry` specifies the cookie lifetime duration in **milliseconds**.
    * `sign_cookie` is `true` by default.
    * `options`:
        * `domain`:[`String`]: Cookie Domain
        * `path`:[`String`]: Cookie Path
        * `maxAge`:[`Number`]: Max Cookie Age (In Seconds)
        * `secure`:[`Boolean`]: Adds Secure Flag
        * `httpOnly`:[`Boolean`]: Adds httpOnly Flag
        * `sameSite`:[`Boolean`, `'none'`, `'lax'`, `'strict'`]: Cookie Same-Site Preference
        * `secret`:[`String`]: Cryptographically signs cookie value
    * **Note** cookie values are not URL encoded.
* `delete_cookie(String: name)`: Writes a cookie header to delete/expire specified cookie.
* `upgrade(Object: user_data)`: Upgrades incoming request to a websocket connection.
    * `user_data` is optional and can be used to store data inside websocket connection object.
    * **Note** this method can only be used inside the `upgrade` handler of a WebsocketRoute.
* `write(String: body)`: Writes specified string content to the body.
    * **Note** the `send()` must still be called to send the response.
* `send(String: body)`: Writes specified string body and sends response.
* `json(Object: body)`: Alias of `send()`. Sets mime type to `json` and sends response.
* `html(String: body)`: Alias of `send()`. Sets mime type to `html` and sends response.
* `redirect(String: url)`: Writes 302 header to redirect incoming request to specified url.
* `throw_error(Error: error)`: Calls global catch-all error handler with specified error.

## SessionEngine
Below is a breakdown of the `SessionEngine` object class generated while creating a new `SessionEngine` instance.

#### SessionEngine Constructor Options
* `signature_secret` [`String`]: Specifies secret value used to sign/authenticate session cookies.
    * This parameter is **Required** and must be **Unique** and kept secret.
* `default_duration`[`Number`]: Specifies default cookie and session duration in **milliseconds**.
* `require_manual_touch`[`Boolean`]: Specifies whether active sessions should be automatically touched upon incoming requests.
* `cookie_options`[`Object`]: Specifies session cookie options.
    * See **Request**->**Methods**->**cookie()** for all cookie options.

#### SessionEngine Methods
* `cleanup()`: Triggers `cleanup` event to delete expired sessions from storage.
* `handle(String: type, Function: handler)`: Binds event handler for specified event type.
    * **Note** you must use your own storage implementation in combination with events below.
    * Event `'id'`: Must return a promise that generates and resolves a cryptographically random id.
        * `handler`: `() => {}`.
        * **Returns:** `Promise` -> `String`.
        * **Required** before using session engine.
    * Event `'read'`: Reads and returns session data as an `Object` from storage.
        * `handler`: `(String: session_id) => {}`.
        * **Returns:** `Promise` -> `Object`.
        * **Required** before using session engine.
    * Event `'touch'`: Updates session expiry timestamp in storage.
        * `handler`: `(String: session_id, Number: expiry_ts) => {}`.
        * `expiry_ts` must be a timestamp in **milliseconds**.
        * **Returns:** `Promise` -> `Any`[`Optional`].
        * **Required** before using session engine.
    * Event `'write'`: Writes session data with expiry timestamp to storage.
        * `handler`: `(String: session_id, Object: data, Number: expiry_ts, Boolean: from_database) => {}`.
        * `expiry_ts` is a timestamp in **milliseconds**
        * `from_database` specifies whether the session is brand new or retrieved from database.
        * **Returns:** `Promise` -> `Any`[`Optional`].
        * **Required** before using session engine.
    * Event `'destroy'`: Destroys session from storage.
        * `handler`: `(String: session_id) => {}`.
        * **Returns:** `Promise` -> `Any`[`Optional`].
        * **Required** before using session engine.
    * Event `'cleanup'`: Cleans up storage source and deletes expired sessions.
        * `handler`: `() => {}`.
        * **Returns:** `Promise` -> `Any`[`Optional`].
        * **Optional** but recommended to centralize session logic.

## Session
Below is a breakdown of the `session` object made available through the `request.session` property in route handler(s) and websocket upgrade event handler(s).

#### Session Properties
| Property  | Type     | Description                |
| :-------- | :------- | :------------------------- |
| `id`      | `Number` | Raw session id for current request. |
| `signed_id` | `Number`  | Signed session id for current request. |
| `ready` | `Boolean`  | Specifies whether session has been started. |
| `duration` | `Number`  | Duration in **milliseconds** of current session. |
| `expiry_timestamp` | `Number`  | Expiry timestamp in **milliseconds** of current session. |

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
* `handle(String: type, Function: handler)`: Binds event handler for specified event type.
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
Below is a breakdown of the `Websocket` connection object made available through `WebsocketRoute` event handlers representing connections.

#### Websocket Properties
The `Websocket` object has no inherent properties and only contains the `user_data` provided during upgrade as its properties.

#### Websocket Methods
* `close()`: Forcefully closes the connection and immediately calls the close handler.
    * **Note** no protocol close message is sent.
    * Only recommended under extreme circumstances.
* `end(Number: code, String: message)`: Gracefully closes the connection and writes specified code and message.
    * **Note** this method is recommended for most use-cases.
* `send(String: message, Boolean: isBinary, Boolean: compress)`: Sends specified message over websocket connection.
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
