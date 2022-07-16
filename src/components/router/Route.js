const Request = require('../http/Request.js'); // lgtm [js/unused-local-variable]
const Response = require('../http/Response.js'); // lgtm [js/unused-local-variable]
const Server = require('../Server.js'); // lgtm [js/unused-local-variable]
const { parse_path_parameters } = require('../../shared/operators.js');

class Route {
    app = null;
    method = null;
    pattern = null;
    handler = null;
    options = null;
    streaming = null;
    max_body_length = null;
    path_parameters_key = null;

    /**
     * Constructs a new Route object.
     * @param {Object} options
     * @param {Server} options.app - The server instance.
     * @param {String} options.method - The HTTP method.
     * @param {String} options.pattern - The route pattern.
     * @param {Function} options.handler - The route handler.
     */
    constructor({ app, method, pattern, options, handler }) {
        this.app = app;
        this.pattern = pattern;
        this.handler = handler;
        this.options = options;
        this.method = method.toUpperCase();
        this.streaming = options.streaming || app._options.streaming || {};
        this.max_body_length = options.max_body_length || app._options.max_body_length;
        this.path_parameters_key = parse_path_parameters(pattern);
    }

    /**
     * @typedef {Object} Middleware
     * @property {Function} middleware - The middleware function.
     * @property {Number} priority - The middleware priority amount. Lower numbers execute first.
     */

    /**
     * Binds middleware to this route and sorts middlewares to ensure execution order.
     *
     * @param {Middleware} middleware
     */
    use(middleware) {
        // Store and sort middlewares to ensure proper execution order
        this.options.middlewares.push(middleware);
        this.options.middlewares.sort((a, b) => a.priority - b.priority);
    }

    /**
     * Handles an incoming request through this route.
     *
     * @param {Request} request The HyperExpress request object.
     * @param {Response} response The HyperExpress response object.
     * @param {Number=} cursor The middleware cursor.
     */
    handle(request, response, cursor = 0) {
        // Do not handle the request if the response has been aborted
        // Do not handle the request if the cursor is greater than the middleware count aka. past the route handler
        if (response.completed || cursor > this.options.middlewares.length) return;

        // Retrieve the next middleware or the route handler for this call based on cursor
        const middleware = this.options.middlewares[cursor];

        // Safely execute the middleware or route handler
        let iterator;
        try {
            // Determine if we have a middleware for the current cursor
            if (middleware) {
                // Track the middleware cursor to prevent double execution
                response._track_middleware_cursor(cursor);

                // Initialize the middleware iterator function
                iterator = (error) => {
                    // If an error occured, pipe it to the error handler
                    if (error instanceof Error) return response.throw(error);

                    // Handle this request again with an incremented cursor to execute the next middleware or route handler
                    this.handle(request, response, cursor + 1);
                };
            }

            // Retrieve a trigger function for the middleware or route handler
            const trigger = middleware ? middleware.middleware : this.handler;

            // Retrieve an output from the trigger function with a next callback to chain handlers
            const output = trigger(request, response, middleware ? iterator : undefined);

            // Determine if the trigger function was async / returned a Promise
            if (output instanceof Promise) {
                // Bind a then callback if this was a middleware trigger
                if (middleware) output.then(iterator);

                // Catch and pipe any errors to the global error handler
                output.catch((error) => response.throw(error));
            }
        } catch (error) {
            // Catch and pipe any errors to the error handler
            response.throw(error);
        }
    }
}

module.exports = Route;
