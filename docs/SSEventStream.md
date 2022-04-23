# SSEventStream
Below is a breakdown of the `SSEventStream` object made available through the `Response.sse` property for requests being eligible for Server-Sent Events based communication.

#### Working With Server-Sent Events
Server-Sent Events are essentially a HTTP request that stays alive and gradually receives data from the server until disconnection. With this in mind, this functionality is provided through the `Response.sse` property on the Response object. You may not set the HTTP status or write any headers after a `SSEventStream` has been opened on a `Response` object.

See below for an example of a simple news events endpoint using Server-Sent Events:
```javascript
const crypto = require('crypto');

const sse_streams = {};
function broadcast_message(message) {
    // Send the message to each connection in our connections object
    Object.keys(sse_streams).forEach((id) => {
        sse_streams[id].send(message);
    })
}

webserver.get('/news/events', (request, response) => {
    // You may perform some authentication here as this is just a normal HTTP GET request
    
    // Check to ensure that SSE if available for this request
    if (response.sse) {
        // Looks like we're all good, let's open the stream
        response.sse.open();
        // OR you may also send a message which will open the stream automatically
        response.sse.send('Some initial message');
        
        // Assign a unique identifier to this stream and store it in our broadcast pool
        response.sse.id = crypto.randomUUID();
        sse_streams[response.sse.id] = response.sse;
        
        // Bind a 'close' event handler to cleanup this connection once it disconnects
        response.once('close', () => {
            // Delete the stream from our broadcast pool
            delete sse_streams[response.sse.id]
        });
    } else {
        // End the response with some kind of error message as this request did not support SSE
        response.send('Server-Sent Events Not Supported!');
    }
});
```

#### SSEventStream Properties
| Property  | Type     | Description                |
| :-------- | :------- | :------------------------- |
| `active`    | `Boolean` | Whether this SSE stream is still active. |

#### SSEventStream Methods
* `open()`: Opens the Server-Sent Events stream.
    * **Returns** a `Boolean` which signifies whether this stream was successfully opened or not.
    * **Note** this method will automatically be called on your first `send()` if not already called yet.
* `close()`: Closes the Server-Sent Events stream.
    * **Returns** a `Boolean` which signifies whether this stream was successfully closed or not.
* `comment(data: string)`: Sends a comment type message to the client that will **NOT** be handled by the client EventSource.
    * **Returns** a `Boolean` which signifies whether this comment was successfully sent or not.
    * **Note** this can be useful as a keep-alive mechanism if messages might not be sent regularly.
* `send(...3 Overloads)`: Sends a message to the client with the specified custom id, event and data.
    * **Overload Types:**
        * `send(data: string)`: Sends a message with the specified `data`.
        * `send(event: string, data: string)`: Sends a message on the custom `event` with the specified `data`.
        * `send(id: string, event: string, data: string)`: Sends a message with a custom `id` on the custom `event` with the specified `data`.
    * **Returns** as `Boolean` which signifies whether this message was sent or not.
    * **Note** this method will automatically call the `open()` method if not already called yet.
    * **Note** messages sent with just the `data` parameter will be handled by `source.onmessage`/`message` event on the client-side `EventSource`.
    * **Note** messages sent with both the `event`/`data` parameters will be handled by the appropriate `event` listener on the client-side `EventSource`.