# HyperExpress: High Performance Node.js Webserver
#### Powered by [`uWebsockets.js`](https://github.com/uNetworking/uWebSockets.js/)

HyperExpress aims to bring various an ExpressJS like API to uWebsockets.js while maintaining high performance and simple to use API.

Some of the most prominent features implemented are:
- Middleware support
- Global error handler
- Built-in session engine
- Simplified websocket API
- Secure cookie signing/verification

## Installation

HyperExpress can be installed using node package manager

```
npm i hyper-express
```

## Getting Started

Below is a simple example of a simple 'Hello World' application running on port 80:

```js
const HyperExpress = require('hyper-express');
const Webserver = new HyperExpress();

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
const Webserver = new HyperExpress();

// Do some stuff like binding routes or handlers

// Activate webserver by calling .listen(port, callback);
Webserver.listen(80, () => console.log('Webserver is active on port 80'));
```

#### Server Methods
| Method              | Parameters | Explanation                                |
| -------------------|-| ------------------------------------------------------ |
| `any(pattern, handler)` | `pattern`: `String`, `handler`:`function`| This method is used to create an any HTTP method route. Supported methods: `get(), post(), del(), head(), connect(), options(), patch(), put(), trace()`|

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
| `query_parameters()` | `Object`  | This method can be used to retrieve query parameters.|
| `get_query_parameter(key)` | `String` `undefined` | This method can be used to retrieve specific query parameter by key.|
| `cookies()` | `Object`  | This method can be used to retrieve cookies from incoming requests.|
| `get_cookie(key, decode)` | `String` `undefined` | This method can be used to retrieve a specific cookie from incoming requests. The optional decode parameter can be used to decode url encoded cookies. `Default: false`|
| `unsign_cookie(name, secret)` | `String` `undefined`  | This method is used to retrieve a specific cookie and verify/unsign it. If the unsigning process fails, this method will return `undefined`|
| `text()` | `Promise`  | This method retrieves the body from an incoming request asynchronously and returns the body as a `String` |
| `json(default_value)` | `Promise`  | This method retrieves the body from an incoming request asynchronously and returns the body as an `Object`. The optional parameter default_value is `{}` by default but setting this to `null` will throw an exception on invalid JSON. |
