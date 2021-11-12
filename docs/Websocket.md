# Websocket
Below is a breakdown of how to properly work with the `Websocket` component in HyperExpress. The `Websocket` component is an extended `EventEmitter` allowing you to listen for specific events throughout the connection's lifetime.

#### Getting Started
To start accepting websocket connections, you must first create a websocket route on either a `Router` or `Server` instance.
```javascript
const HyperExpress = require('hyper-express');
const Server = new HyperExpress.Server();
const Router = new HyperExpress.Router();

Router.ws('/connect', {
    idle_timeout: 60,
    max_payload_length: 32 * 1024
}, (ws) => {
    console.log(ws.ip + ' is now connected using websockets!');
    ws.on('close', () => console.log(ws.ip + ' has now disconnected!'));
});

// Websocket connections can now connect to '/ws/connect'
Server.use('/ws', Router);
```
**See** [`> [Router]`](./Router.md) for full documentation on the `ws(pattern, options, handler)` route creation method.

#### Intercepting & Handling Upgrade Requests
By default, all incoming connections are automatically upgraded to a websocket connection. You may authenticate these upgrade requests by creating an `upgrade` route on either a `Router` or `Server` instance.
```javascript
// Assume this code is written in the same file as the above example
Router.upgrade('/connect', {
    middlewares: [SOME_MIDDLEWARE] // Middlewares can be used on upgrade methods as well!
}, (request, response) => {
    // Do some kind of verification here
    // This handler acts the same as all other HTTP handlers
    // All global/route-specific middlewares will run on this route as it is treated like a normal HTTP route
    // You must call response.upgrade() somewhere in your logic, otherwise the upgrade request will timeout
    
    response.upgrade({
        token: request.query_parameters['token'],
        // You may specify context values in this object for later accesss using the ws.context property
    })
});
```
**See** [`> [Router]`](./Router.md) for full documentation on the `upgrade(pattern, options, handler)` route creation method.

#### Websocket Properties
| Property  | Type     | Description                |
| :-------- | :------- | :------------------------- |
| `raw` | `uWS.Request`  | Underlying uWS.Websocket object. |
| `ip` | `String`  | Connection IP address. |
| `context` | `Object`  | Context values that were specified from `upgrade()` method. |
| `closed` | `Boolean`  | Whether connection is closed. |
| `buffered` | `Number`  | Number of bytes buffered in backpressure. |
| `topics` | `Array`  | List of topics this websocket is subscribed to. |
| `writable` | `stream.Writable` | Writable stream to be used for piping into this connection. |

#### Websocket Events
The `Websocket` component is an extension of the `EventEmitter` component thus you may consume specific events for each connection.
* `on(String: event, Function: handler)`: Binds a handler which is triggered when specified event is emitted.
    * Event `'message'`: Emitted when a message is received from websocket connection.
        * **Example Handler**: `(Mixed: message, Boolean: is_binary) => {}`
        * **Note** the type for `message` is determined by the `message_type` option specified during route creation.
    * Event `'drain'`: Emitted when websocket connection has drained and is ready to send more messages.
        * Use this event to handle backpressure and retry messages that could not be sent earlier.
    * Event `'close'`: Emitted when websocket connection has closed.
        * **Example Handler**: `(Number: code, Mixed: message) => {}`
        * **Note** the type for `message` is determined by the `message_type` option specified during route creation.

#### Websocket Methods
* `atomic(Function: callback)`: Alias of `uWebsockets.Response.cork()`. This method waits for network socket to become ready before executing all network base calls inside the specified `callback`.
    * This may yield higher performance when executing multiple network heavy operations.  
* `send(String|Buffer|ArrayBuffer: message, Boolean: is_binary, Boolean: compress)`: Sends a message over the websocket connection.
    * **Returns** `Boolean`[`true`] if message was sent successfully.
    * **Returns** `Boolean`[`false`] if message could not be sent due to built up backpressure.
* `stream(Readable: readable, Boolean?: is_binary)`: Consumes and streams the data from the readable stream as a message to the receiver.
  * **Returns** `Promise` which is then resolved to `any`.
  * **Note** you must not initiate another `stream()` or `writable` operation during an ongoing stream.
* `ping(String|Buffer|ArrayBuffer: message)`: Sends a ping control message.
    * **Returns** `Boolean`[`true`] if message was sent successfully.
    * **Returns** `Boolean`[`false`] if message could not be sent due to built up backpressure.
* `close(Number: code, String: message)`: Gracefully closes the connection and writes specified code and short message.
    * **Note** this method is recommended for most use-cases.
* `destroy()`: Forcefully closes the connection and immediately emits `close` event.
    * **Note** no protocol close message is sent.
    * Only recommended when disconnecting bad actors.
* `is_subscribed(String: topic)`: Returns whether this websocket is subscribed to specified topic.
    * **Returns** `Boolean`
* `subscribe(String: topic)`: Subscribes to specified topic in **MQTT syntax**.
* `unsubscribe(String: topic)`: Unsubscribes from specified topic in **MQTT syntax**.
* `publish(String: topic, String|Buffer|ArrayBuffer: message, Boolean: is_binary, Boolean: compress)`: Publishes the specified message to the specified topic in **MQTT syntax**.
