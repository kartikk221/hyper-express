# HyperExpress: High Performance Node.js Webserver
#### Powered by [`uWebsockets.js`](https://github.com/uNetworking/uWebSockets.js/)

HyperExpress aims to bring an Express-like webserver API to uWebsockets.js while maintaining high performance.
Some of the most prominent features implemented are:
- Middleware support
- Global handlers
- Built-in session engine
- Simplified websocket API
- Secure cookie signing/verification

## Installation

HyperExpress can be installed using node package manager (`npm`)

```
npm i hyper-express
```

## Getting Started

Below is a simple example of a simple 'Hello World' application running on port 80:

```js
const HyperExpress = require('hyper-express');
const Webserver = new HyperExpress.Server();

Webserver.get('/', (request, response) => {
    return response.send('Hello World');
});

Webserver.listen(80)
.then((socket) => console.log('Webserver started on port 80'))
.catch((code) => console.log('Failed to start webserver on port 80: ' + code));
```

## Server
Below is a breakdown of the `Server` object class generated while creating a new webserver instance.

#### Example: Create server instance
```js
const HyperExpress = require('hyper-express');
const Webserver = new HyperExpress.Server();

// Do some stuff like binding routes or handlers

// Activate webserver by calling .listen(port, callback);
Webserver.listen(80)
.then((socket) => console.log('Webserver started on port 80'))
.catch((code) => console.log('Failed to start webserver on port 80: ' + code));
```

#### Server Constructor Options
| Parameter              | Type | Explanation                                |
| -------------------|-| ------------------------------------------------------ |
| `key_file_name` | `String`  | Path to SSL private key file.<br />**Example**: `misc/key.pm`<br />**Required** for an SSL server.|
| `cert_file_name` | `String`  | Path to SSL certificate file.<br />**Example**: `misc/cert.pm`<br />**Required** for an SSL server.|
| `passphrase` | `String`  | Strong passphrase for SSL cryptographic purposes.<br />**Example**: `Gy3wyNky19bQigRgdg6l`<br />**Required** for an SSL server.|
| `dh_params_file_name` | `String`  | Path to SSL Diffie-Hellman parameters file.<br />**Example**: `misc/dhparam4096.pm`<br />**Optional** for an SSL server.|
| `ssl_prefer_low_memory_usage` | `Boolean`  | Specifies uWS to prefer lower memory usage while serving SSL requests.<br />**Optional** for an SSL server.|

#### Server Instance Methods
| Method              | Parameters | Explanation                                |
| -------------------|-| ------------------------------------------------------ |
| `listen(port)` | `port`: `Number` | Starts the uWS server on specified port.<br />Returns a `Promise` and resolves `uw_listen_socket`.|
| `close()` | None | Closes the uWS server gracefully.|
| `uWS()` | None  | Returns the underlying uWS instance.|
| `use(middleware)` | `middleware`: `Function`  | Binds global middleware to webserver.<br />**Example**: `(request, response, next) => {}`<br />Usage: perform middleware operations and call `next()`<br />**Note**: Middlewares can hurt performance depending on logic complexity|
| `any(pattern, handler)`<br />`get(pattern, handler)`<br />`post(pattern, handler)`<br />`options(pattern, handler)`<br />`del(pattern, handler)`<br />`head(pattern, handler)`<br />`patch(pattern, handler)`<br />`put(pattern, handler)`<br />`trace(pattern, handler)`<br />`connect(pattern, handler)` | `pattern`: `String`<br /> `handler`: `Function`| These methods create http routes.<br /> The `handler` parameter accepts either a `normal` or `async` anonymous Function.<br />The handler must have also have two parameters `(request, response) => {}`.<br /> The `pattern` parameter must be a string and is a `strict` match.<br />`pattern` supports path parameters with the `/v1/users/:key` format.|
| `ws(pattern, ws_route)` | `ws_route`: `WebsocketRoute` | This method creates a websocket route.<br />A `WebsocketRoute` instance must be passed to handle connections.|
| `routes()` | None | Returns created routes.|
| `ws_compressors()` | None | Returns compressor presets for WebsocketRoute `compressor` option.|
| `setErrorHandler(handler)` | `handler`: `Function` | Binds a global error handler.<br />**Example**: `(request, response, error) => {}`|
| `setNotFoundHandler(handler)` | `handler`: `Function` | Binds a global not found handler.<br />*Example**: `(request, response) => {}`|
| `setSessionEngine(engine)` | `engine`: `SessionEngine` | Binds a session engine to webserver.<br />This populates `request.session` with a `Session` object.<br />**Note**: You must call `engine.perform_cleanup()` intervally to cleanup sessions.|

## WebsocketRoute
Below is a breakdown of the `WebsocketRoute` object class generated while creating a new `WebsocketRoute` instance.

#### Example: Initializing and using a new Websocket Route
```js
const HyperExpress = require('hyper-express');
const Webserver = new HyperExpress.Server();

// Create new WebsocketRoute instance
const NewsRouteWS = new HyperExpress.WebsocketRoute(some_options);

// IMPORTANT! Bind WebsocketRoute to HyperExpress Server instance at a specific pattern
Webserver.ws('/api/v1/ws/connect', NewsRouteWS);

// Handle connection 'upgrade' event
NewsRouteWS.handle('upgrade', async (request, response) => {
    // Some asynchronous database calls/verification done here
    
    // Reject upgrade request if verification fails
    if(verified !== true) return response.status(403).send('Forbidden Request');
    
    // Upgrade request to a websocket connection if verified
    response.upgrade({
        user_id: some_user_id // Include some metadata about websocket for future use
    });
});

// Handle connection 'open' event
NewsRouteWS.handle('open', (ws) => {
   console.log(ws.user_id + ' is now connected using websockets!'); 
});

// Handle connection 'message' event
NewsRouteWS.handle('message', (ws, message, isBinary) => {
    console.log(ws.user_id + ' sent message: ' + message); 
});

// Handle connection 'close' event
NewsRouteWS.handle('close', (ws, code, message) => {
   console.log(ws.user_id + ' has disconnected!'); 
});

// Activate webserver by calling .listen(port, callback);
Webserver.listen(80)
.then((socket) => console.log('Webserver started on port 80'))
.catch((code) => console.log('Failed to start webserver on port 80: ' + code));
```

#### WebsocketRoute Constructor Options
| Parameter              | Type | Explanation                                |
| -------------------|-| ------------------------------------------------------ |
| `compression` | `Number`  | Specifies permessage-deflate compression to use.<br />Must pass one of the constants from `Server.ws_compressors()`.<br />**Default**: `Webserver.ws_compressors().DISABLED`|
| `idleTimeout` | `Number`  | Specifies interval to automatically timeout/close idle websocket connection in `seconds`.<br />**Default**: `30`| 
| `maxBackpressure` | `Number`  | Specifies maximum websocket backpressure allowed in `length`.<br />**Default**: `1024 * 1024 = 1048576`| 
| `maxPayloadLength` | `Number`  | Specifies maximum length allowed on incoming messages.<br />Any client who goes over this limit will immediately be disconnected.<br />**Default**: `32 * 1024 = 32768`| 

#### WebsocketRoute Instance Methods
| Method              | Parameters | Explanation                                |
| -------------------|-| ------------------------------------------------------ |
| `handle(event, handler)` | `event`: `String`<br />`handler`: `Function`  | Sets an event handler for websocket route. <br />See below for supported events.|

#### WebsocketRoute Supported Events
| Event              | Handler Parameters | Explanation                                |
| -------------------|-| ------------------------------------------------------ |
| `upgrade` | `request`: `Request`<br />`response`: `Response` | Handles incoming upgrade requests for websocket connections.<br />You may perform any authentication in this handler upgrading to a websocket connection.<br />**Note**: Incoming requests are upgraded automatically without this event being handled. |
| `open` | `ws`: `Websocket` | Handles new connections being opened on websocket route.<br />This event **must** be handled on a `WebsocketRoute` instance to prevent automatic disconnections. |
| `message` | `ws`: `Websocket`<br />`message`: `String`<br />`isBinary`: `Boolean` | Handles incoming messages from websocket connections. |
| `drain` | `ws`: `Websocket` | Handles drainage of backpressure for websocket connections. |
| `close` | `ws`: `Websocket`<br />`code`: `Number`<br />`message`: `String` | Handles closing of websocket connections with the associated closing code and message. |

## Websocket
Below is a breakdown of the `Websocket` connection object made available through `WebsocketRoute` event handlers.

#### Example: Utilizing Websocket connection
```js
// Assume HyperExpress and a WebsocketRoute has already been setup/initiated

NewsRouteWS.handle('message', (ws, message) => {
    ws.send('Acknowleged: ' + message); // Replies with incoming message
});
```

#### Websocket Instance Methods
| Method              | Parameters | Explanation                                |
| -------------------|-| ------------------------------------------------------ |
| `close()` | None  | Forcefully closes the connection and immediately calls the close handler.<br />**Note**: No close message is sent. |
| `cork(callback)` | `callback`: `Function`  | Similar to `response.atomic(callback)` in helping improving performance. |
| `end(code, message)` | `code`: `Number`<br />`message`: `String`  | Gracefully closes the connectioin and calls the close handler.<br />A close message is sent with the specified code and message. |
| `getBufferedAmount()` | None  | Returns number of bytes buffered in backpressure. |
| `getRemoteAddress()` | None  | Returns the remote IP address in Binary. |
| `getRemoteAddressAsText()` | None  | Returns the remote IP address as text. |
| `getTopics()` | None  | Returns a list of topics this connection is subscribed to. |
| `ping(message)` | `message`: `String`  | Sends a ping control message according to protocol with specified message. |
| `subscribe(topic)` | `topic`: `String` | Subscribes connection to specified topic. |
| `unsubscribe(topic)` | `topic`: `String` | Unsubscribes connection from the specified topic. |
| `isSubscribed(topic)` | `topic`: `String`  | Returns a `Boolean` result of whether this connection is subscribed to specified topic. |
| `publish(topic, message, isBinary, compress)` | `topic`: `String`<br />`message`: `String`<br />`isBinary`: `Boolean`<br />`compress`: `Boolean`  | Publishes a message to specified topic. |
| `send(message, isBinary, compress)` | `message`: `String`<br />`isBinary`: `Boolean`<br />`compress`: `Boolean`  | Sends a message. Returns a `Boolean` result specifying whether message was sent or failed due to backpressure.|


## Request
Below is a breakdown of the `request` object made available through the route handler(s) and websocket upgrade event handler(s).

#### Example: Retrieving properties and JSON body 
```js
Webserver.post('/api/v1/delete_user/:id', async (request, response) => {
   let headers = request.headers;
   let id = request.path_parameters.id;
   let body = await request.json(); // we must await as .json() returns a Promise
   // body will contain the parsed JSON object or an empty {} object on invalid JSON
   
   // Do some stuff here
});
```

#### Request Properties
| Property             | Type | Explanation                                     |
| -------------------|-| ------------------------------------------------------ |
| `method` | `String`  | This property contains the request HTTP method in uppercase.|
| `url` | `String`  | This property contains the full path + query string. |
| `path` | `String`  | This property contains the request path.|
| `query` | `String`  | This property contains the request query string without after the `?`.|
| `headers` | `Object`  | This property contains the headers for incoming requests.|
| `path_parameters` | `Object`  | This property contains path parameters from incoming requests.<br />Example: `/api/v1/delete/:userid` -> `{ userid: 'some value' }` |
| `session` | `Session`  | This property contains the session object for incoming requests when a session engine is active.|
| `uws_request` | `uWS.Request`  | This property contains the underlying uWebsockets.js request object.|
| `uws_response` | `uWS.Response`  | This property contains the underlying uWebsockets.js response object.|

#### Request Methods
| Method             | Returns | Explanation                                    |
| -------------------|-| ------------------------------------------------------ |
| `query_parameters()` | `Object`  | Retrieves all query parameters from current request.|
| `get_query_parameter(key)` | `String` `undefined` | Retrieves a specified query parameter from current request.<br />`key`[**String**]: Required|
| `cookies(decode)` | `Object`  | Retrieves all cookies from incoming request.<br />`decode`[**Boolean**][**Default**: `false`]: Optional|
| `get_cookie(key, decode)` | `String` `undefined` | Retrieves a specified cookie from incoming request.<br /> The optional decode parameter can be used to decode url encoded cookies.<br /> `key`[**String**]: **Required**<br /> `decode`[**Boolean**][**Default**: `false`]: Optional|
| `unsign_cookie(name, secret)` | `String`,<br />`undefined`  | Unsigns and retrieves the decoded value for a signed cookie.<br />**Note**: Returns `undefined` when cookie is not set or tampered with.<br />`name`[**String**]: **Required**<br />`secret`[**String**]: **Required**|
| `text()` | `Promise`  | Retrieves the body from an incoming request asynchronously as a `String`. |
| `json(default_value)` | `Promise`  | Retrieves the body from an incoming request asynchronously as an `Object`.<br />**Note**: Setting `default_value` to `null` will reject the promise.<br />The **optional** parameter `default_value` is used to resolve specified value on invalid JSON and prevent rejections.<br />`default_value`[**Any**][**Default**: `{}`]: Optional|

## Response
Below is a breakdown of the `response` object made available through the route handler(s) and websocket upgrade event handler(s).

#### Example: Forbidden request scenario utilizing multiple response methods
```js
Webserver.post('/api/v1/delete_user/:id', async (request, response) => {
   // Some bad stuff happened and this request is forbidden
   
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

#### Response Methods
| Method             | Parameters | Explanation                                    |
| -------------------|-| ------------------------------------------------------ |
| `atomic(callback)` | `callback`: `Function`  | Alias of uWebsockets's `.cork(callback)` method.<br />Wrapping multiple response method calls inside this method can improve performance.<br />Example: `response.atomic(() => { /* Some response method calls */ });` |
| `status(code)` | `code`: `Number` | Writes status code for current request.<br />This method can only be called once per request.<br />**Note**: This method must be called before any other response methods. |
| `header(key, value)` | `key`: `String`<br />`value`: `String`  | Writes a response header. |
| `type(type)` | `type`: `String` | Writes appropriate `content-type` header for specified type.<br />List: [Supported Types](./mime_types.json) |
| `cookie(name, value, expiry, options)` | `name`: `String`<br />`value`: `String`<br />`expiry`: `Number`<br />`options`: `Object`  | Sets a cookie for current request.<br />`expiry` must be the duration of the cookie in **milliseconds**.<br /><br />Supported Options:<br />`domain`[**String**]: Sets cookie domain<br />`path`[**String**]: Sets cookie path<br />`maxAge`[**Number**]: Sets maxAge (In seconds)<br />`encode`[**Boolean**]: URL encodes cookie value<br />`secure`[**Boolean**]: Adds secure flag<br />`httpOnly`[**Boolean**]: Adds httpOnly flag<br />`sameSite`[**Boolean**, **none**, **lax**, **strict**]: Adds sameSite flag |
| `delete_cookie(name)` | `name`: `String` | Deletes a cookie for current request. |
| `upgrade(data)` | `data`: `Object` | Upgrades request from websocket upgrade handlers.<br />Parameter `data` is optional and be used to bind data to websocket object.<br />**Note**: This method is only available inside websocket upgrade handlers. |
| `redirect(url)` | `url`: `String` | Redirects request to specified `url`. |
| `send(body)` | `body`: `String` | Sends response with an **optional** specified `body`. |
| `json(payload)` | `payload`: `Object` | Sends response with the specified json body. |
| `html(code)` | `code`: `String` | Sends response with the specified html body. |
| `throw_error(error)` | `error`: `Error` | Calls global error handler with specified `Error` object. |
