# Middlewares
HyperExpress follows the standard format of middlewares and implements similar API to ExpressJS. This allows for limited compatibility with some existing ExpressJS middlewares while maintaining high performance. 
* See [`> [Server]`](./Server.md) and [`> [Router]`](./Router.md) for details about the `use()` method and parameter types.

# How To Use
Middlewares support both callback and promise based iteration similar to ExpressJS. Throwing or iterating `next` with an `Error` object will trigger the global error handler.

#### Callback-Based Iteration
```javascript
// Binds a midddleware that will run on all routes that begin with '/api' in this router.
router.use('/api', (request, response, next) => {
    some_async_operation(request, response)
    .then(() => next()) // Calling next() will trigger iteration to the next middleware
    .catch((error) => next(error)) // passing an Error as a parameter will automatically trigger global error handler
});
```

#### Async/Promise-Based Iteration
```javascript
// Binds a global middleware that will run on all routes.
server.use(async (request, response) => {
    // You can also just return new Promise((resolve, reject) => {}); instead of async callback
    try {
        await some_async_operation();
        // The request proceeds to the next middleware/handler after the promise resolves
    } catch (error) {
        return error; // This will trigger global error handler as we are returning an Error
    }
});
```
