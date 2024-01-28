# Examples & Snippets
Below are various examples and snippets that make use of most components in HyperExpress.

#### Simple 'Hello World' application
```javascript
const HyperExpress = require('hyper-express');
const webserver = new HyperExpress.Server();

// Create GET route to serve 'Hello World'
webserver.get('/', (request, response) => {
    response.send('Hello World');
})

// Activate webserver by calling .listen(port, callback);
webserver.listen(80)
.then((socket) => console.log('Webserver started on port 80'))
.catch((error) => console.log('Failed to start webserver on port 80'));
```

#### Retrieving request properties and body 
```javascript
webserver.post('/api/v1/delete_user/:id', async (request, response) => {
   let headers = request.headers;
   let id = request.path_parameters.id;
   let body = await request.json(); // we must await as .json() returns a Promise
   // body will contain the parsed JSON object or an empty {} object on invalid JSON
   
   // Do some stuff here
});
```

#### Forbidden request scenario utilizing multiple response methods
```javascript
webserver.post('/api/v1/delete_user/:id', async (request, response) => {
   // Some bad stuff happened and this request is now forbidden
    
   // All methods EXCEPT "response ending methods" such as send(), json(), upgrade() support chaining
   response
       .status(403) // Set the response HTTP status code
       .header('x-app-id', 'some-app-id') // Sets some random header
       .header('x-upstream-location', 'some_location') // Sets some random header
       .cookie('frontend_timeout', 'v1/delete_user', 1000 * 60 * 30, {
           secure: true,
           httpOnly: true
       }) // Sets some frontend cookie for enforcing front-end timeout
       .cookie('some_sess_id', null) // Deletes some session id cookie
       .type('html') // Sets content-type header according to 'html'
       .send(rendered_html) // Sends response with some rendered_html as the body
});
```

#### Streaming A Large Video File With A Readable Stream
```javascript
const fs = require('fs');

webserver.post('/assets/some_video.mkv', async (request, response) => {
   // Create a readable stream for the file
   const readable = fs.createReadStream('/path/to/some_video.mkv');

   // Handle any errors from the readable
   readable.on('error', (error) => some_logger(error));

   // Easily stream the video data to receiver
   response.stream(readable);
});
```

#### Streaming A Large Dataset With A Pipe To Response Writable
```javascript
const fs = require('fs');

webserver.post('/stream/some-data', async (request, response) => {
    // Get some readable stream which will retrieve our large dataset
    const readable = getReadableStreamForOurData();

    // Simply pipe the stream to the Response writable to serve it to the client
    readable.pipe(response);
});
```

#### Using Global & Route/Method Specific Middlewares
```javascript
// Assume webserver is a HyperExpress.Server instance

// Bind a global middleware that executes on all incoming requests
// These also execute before route/method specific middlewares as they are global
webserver.use((request, response, next) => {
    // Do some asynchronous stuff
    some_asynchronous_call((data) => {
        // you can assign values onto the request and response objects to be accessed later
        request.some_data = data;
        
        // We're all done, so let's move on
        next();
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

#### Creating a websocket route that dispatches news events
```javascript
const webserver = new HyperExpress.Server();

// Create an upgrade route so we can authenticate incoming connections
webserver.upgrade('/ws/connect', async (request, response) => {
    // Do some kind of asynchronous verification here
    
    // Upgrade the incoming request with some context
    response.upgrade({
        user_id: 'some_user_id',
        event: 'news_updates'
    });
});

// Create websocket route to handle opened websocket connections
webserver.ws('/ws/connect', (ws) => {
    // Log when a connection has opened for debugging
    console.log('user ' + ws.context.user_id + ' has connected to consume news events');
    
    // Handle incoming messages to perform changes in consumption
    ws.on('message', (message) => {
        // Make some changes to which events user consumes based on incoming message
    });
    
    // Do some cleanup once websocket connection closes
    ws.on('close', (code, message) => {
       console.log('use ' + ws.context.user_id + ' is no longer listening for news events.');
       // You may do some cleanup here regarding analytics
    });
});
```
