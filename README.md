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

Webserver.listen(80);
```

## Server
Below is a breakdown of proper utilization for the `Server` object in order to create a webserver.

#### Example: Create server instance
```js
const HyperExpress = require('hyper-express');
const Webserver = new HyperExpress.Server();

// Do some stuff like binding routes or handlers

// Activate webserver by calling .listen(port, callback);
Webserver.listen(80, () => console.log('Webserver is active on port 80'));
```

#### Server Methods
| Method              | Parameters | Explanation                                |
| -------------------|-| ------------------------------------------------------ |
| `uWS()` | None  | Returns the underlying uWS instance.|
| `use(middleware)` | `middleware`: `function`  | Binds global middleware to webserver.<br />Example: `middleware: (request, response, next) => {}`<br />Usage: perform middleware operations and call `next()`<br />**Note**: Middlewares can hurt performance depending on logic complexity|
| `any(pattern, handler)`<br />`get(pattern, handler)`<br />`post(pattern, handler)`<br />`options(pattern, handler)`<br />`del(pattern, handler)`<br />`head(pattern, handler)`<br />`patch(pattern, handler)`<br />`put(pattern, handler)`<br />`trace(pattern, handler)`<br />`connect(pattern, handler)` | `pattern`: `String`<br /> `handler`: `function`| These methods create http routes.<br /> The `handler` parameter accepts either a `normal` or `async` anonymous function.<br />This function must have two parameters `(request, response) => {}`.<br /> The `pattern` parameter must be a string and is a `strict` match.<br />`pattern` supports path parameters with the `/v1/users/:key` format.|
| `ws(pattern, ws_route)` | `ws_route`: `WebsocketRoute` | This method creates a websocket route.<br />A `WebsocketRoute` instance must be passed to handle connections.|
| `routes()` | None | Returns created routes.|
| `ws_compressors()` | None | Returns compressor presets for `compressor` parameter.|
| `listen(port, callback)` | `port`: `Number`<br />`callback`: `function`  | Starts the uWS server on specified port.|
| `close()` | None | Closes the uWS server gracefully.|
| `setErrorHandler(handler)` | `handler`: `function` | Binds a global error handler.<br />Example: `handler: (request, response, error) => {}`|
| `setNotFoundHandler(handler)` | `handler`: `function` | Binds a global not found handler.<br />Example: `handler: (request, response) => {}`|
| `setSessionEngine(engine)` | `engine`: `SessionEngine` | Binds a session engine to webserver.<br />This populates `request.session` with a `Session` object.<br />**Note**: You must call `engine.perform_cleanup()` intervally to cleanup sessions.|

## Request
Below is a breakdown of all available methods for the `request` object available through the route handler and websocket upgrade event handler.

#### Example: Retrieving properties and JSON body 
```js
Webserver.post('/api/v1/delete_user/:id', async (request, response) => {
   let headers = request.headers;
   let id = request.path_parameters.id;
   let body = await request.json();
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
| `path_parameters` | `Object`  | This property contains path parameters from incoming requests. Example: `/api/v1/delete/:userid` -> `{ userid: 'some value' }` |
| `session` | `Session`  | This property contains the session object for incoming requests when a session engine is active.|
| `uws_request` | `uWS.Request`  | This property contains the underlying uWebsockets.js request object.|
| `uws_response` | `uWS.Response`  | This property contains the underlying uWebsockets.js response object.|

#### Request Methods
| Method             | Returns | Explanation                                    |
| -------------------|-| ------------------------------------------------------ |
| `query_parameters()` | `Object`  | can be used to retrieve query parameters.|
| `get_query_parameter(key)` | `String` `undefined` | can be used to retrieve specific query parameter by key.|
| `cookies()` | `Object`  | can be used to retrieve cookies from incoming requests.|
| `get_cookie(key, decode)` | `String` `undefined` | can be used to retrieve a specific cookie from incoming requests. The optional decode parameter can be used to decode url encoded cookies. `Default: false`|
| `unsign_cookie(name, secret)` | `String` `undefined`  | is used to retrieve a specific cookie and verify/unsign it. If the unsigning process fails, will return `undefined`|
| `text()` | `Promise`  | retrieves the body from an incoming request asynchronously and Returns the body as a `String` |
| `json(default_value)` | `Promise`  | retrieves the body from an incoming request asynchronously and Returns the body as an `Object`. The optional parameter default_value is `{}` by default but setting this to `null` will throw an exception on invalid JSON. |

## Response
Below is a breakdown of all available methods for the `response` object available through the route handler and websocket upgrade event handler.

#### Example: Forbidden request scenario utilizing response methods
```js
Webserver.post('/api/v1/delete_user/:id', async (request, response) => {
   // Some bad stuff happened and this request is forbidden
   
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
| `atomic(callback)` | `callback`: `function`  | Alias of uWebsockets's `.cork(callback)` method.<br />Wrapping multiple response method calls inside this method can improve performance.<br />Example: `response.atomic(() => { /* Some response method calls */ });` |
| `status(code)` | `code`: `Number` | Writes status code for current request.<br />This method can only be called once per request.<br />**Note**: This method must be called before any other response methods. |
| `header(key, value)` | `key`: `String`<br />`value`: `String`  | Writes a response header. |
| `type(type)` | `type`: `String` | Writes appropriate `content-type` header for specified type.<br />List: [Supported Types](./mime_types.json) |
| `cookie(name, value, expiry, options)` | `name`: `String`<br />`value`: `String`<br />`expiry`: `Number`<br />`options`: `Object`  | Sets cookie for current request.<br />`expiry` must be the duration of the cookie in milliseconds.<br />Supported Options:<br />`domain`[`String`]: Sets cookie domain<br />`path`[`String`]: Sets cookie path<br />`maxAge`[`Number`]: Sets maxAge (In seconds)<br />`encode`[`boolean`]: URL encodes cookie value<br />`secure`[`boolean`]: Adds secure flag<br />`httpOnly`[`boolean`]: Adds httpOnly flag<br />`sameSite`[`boolean`,`none`,`lax`,`strict`]: Adds sameSite flag |
