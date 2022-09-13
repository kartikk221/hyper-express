'use strict';
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
    is_wildcard = false;

    /**
     * Constructs a new Route object.
     * @param {Object} options
     * @param {import('../Server.js')} options.app - The server instance.
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

        // Translate to HTTP DELETE
        if (this.method === 'DEL') this.method = 'DELETE';
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
    }

    /**
     * Handles an incoming request through this route.
     *
     * @param {import('../http/Request.js')} request The HyperExpress request object.
     * @param {import('../http/Response.js')} response The HyperExpress response object.
     * @param {Number=} cursor The middleware cursor.
     */
    handle(request, response, cursor) {
        // Do not handle the request if the response has been aborted
        // Do not handle the request if the cursor is greater than the middleware count aka. past the route handler
        if (response.completed === true || cursor > this.options.middlewares.length) return;

        // Retrieve the middleware for the current cursor, track the cursor if there is a valid middleware
        let iterator;
        const middleware = this.options.middlewares[cursor];
        if (middleware) {
            // Enforce request path pattern matching if this is a wildcard route
            if (this.is_wildcard && !request.path.startsWith(middleware.pattern))
                return this.handle(request, response, cursor + 1);

            // Track the middleware cursor to prevent double execution
            response._track_middleware_cursor(cursor);

            // Initialize the iterator for this middleware
            iterator = (error) => {
                // If an error occured, pipe it to the error handler
                if (error instanceof Error) return response.throw(error);

                // Handle this request again with an incremented cursor to execute the next middleware or route handler
                this.handle(request, response, cursor + 1);
            };
        }

        // Wrap the middleware/route handler trigger execution in a try/catch to catch and pipe synchronous errors
        try {
            // Retrieve an output value from the route handler or the middleware function
            let output;
            if (middleware) {
                // Execute the middleware handler with the iterator
                output = middleware.handler(request, response, iterator);
            } else {
                // Excute the route handler without the iterator
                output = this.handler(request, response);
            }

            // Determine if the a Promise was returned which must be safely handled and iterated from
            if (typeof output?.then === 'function') {
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

    /**
     * Compiles the route's internal components and caches for incoming requests.
     */
    compile() {
        // Determine if this route contains middlewares in the options
        if (Array.isArray(this.options.middlewares)) {
            // Initialize a fresh array of middlewares
            const pattern = this.pattern;
            const middlewares = [];

            // Determine wildcard properties about this route
            const is_wildcard = pattern.endsWith('*');
            const wildcard_path = pattern.substring(0, pattern.length - 1);
            this.is_wildcard = is_wildcard;

            // Iterate through the global/local middlewares and connect them to this route if eligible
            const app_middlewares = this.app.middlewares;
            Object.keys(app_middlewares).forEach((pattern) =>
                app_middlewares[pattern].forEach((middleware) => {
                    // A route can be a direct child when a route's pattern has more path depth than the middleware with a matching start
                    // A route can be an indirect child when it is a wildcard and the middleware's pattern is a direct parent of the route child
                    const direct_child = pattern.startsWith(middleware.pattern);
                    const indirect_child = middleware.pattern.startsWith(wildcard_path);
                    if (direct_child || (is_wildcard && indirect_child)) middlewares.push(middleware);
                })
            );

            // Push the route-specific middlewares to the array at the end
            this.options.middlewares.forEach((middleware) =>
                middlewares.push({
                    pattern,
                    handler: middleware,
                    priority: 2, // 2 = route-specific middleware
                })
            );

            // Sort the middlewares increasing priority
            middlewares.sort((a, b) => a.priority - b.priority);

            // Replace the middlewares array with the sorted array
            this.options.middlewares = middlewares;
        } else {
            // Fill options with an empty array of middlewares to support chaining in route handler
            this.options.middlewares = [];
        }
    }
}

module.exports = Route;
