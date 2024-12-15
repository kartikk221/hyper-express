'use strict';
const { parse_path_parameters } = require('../../shared/operators.js');

class Route {
    id = null;
    app = null;
    path = '';
    method = '';
    pattern = '';
    handler = null;
    handlers = null;
    options = null;
    streaming = null;
    max_body_length = null;
    path_parameters_key = null;

    /**
     * Constructs a new Route object.
     * @param {Object} options
     * @param {import('../Server.js')} options.app - The server instance.
     * @param {String} options.method - The HTTP method.
     * @param {String} options.pattern - The route pattern.
     * @param {Function} options.handler - The route handler.
     */
    constructor({ app, method, pattern, options, handler, handlers }) {
        this.id = app._get_incremented_id();
        this.app = app;
        this.pattern = pattern;
        this.handler = handler;
        this.handlers = handlers;
        this.options = options;
        this.method = method.toUpperCase();
        this.streaming = options.streaming || app._options.streaming || {};
        this.max_body_length = options.max_body_length || app._options.max_body_length;
        this.path_parameters_key = parse_path_parameters(pattern);

        // Translate to HTTP DELETE
        if (this.method === 'DEL') this.method = 'DELETE';

        // Cache the expected request path for this route if it is not a wildcard route
        // This will be used to optimize performance for determining incoming request paths
        const wildcard = pattern.includes('*') || this.path_parameters_key.length > 0;
        if (!wildcard) this.path = pattern;
    }

    /**
     * @typedef {Object} Middleware
     * @property {Number} id - Unique identifier for this middleware based on it's registeration order.
     * @property {String} pattern - The middleware pattern.
     * @property {function} handler - The middleware handler function.
     * @property {Object} handlers - The on_not_found and on_error handler functions.
     * @property {Boolean=} match - Whether to match the middleware pattern against the request path.
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
    handle(request, response, cursor = 0) {
        // Do not handle the request if the response has been sent aka. the request is no longer active
        if (response.completed) return;

        // Retrieve the middleware for the current cursor, track the cursor if there is a valid middleware
        let iterator;
        const middleware = this.options.middlewares[cursor];
        if (middleware) {
            // Determine if this middleware requires path matching
            if (middleware.match) {
                // Check if the middleware pattern matches that starting of the request path
                if (request.path.startsWith(middleware.pattern)) {
                    // Ensure that the character after the middleware pattern is either a trailing slash or out of bounds of string
                    const trailing = request.path[middleware.pattern.length];
                    if (trailing !== '/' && trailing !== undefined) {
                        // This handles cases where "/docs" middleware will incorrectly match "/docs-JSON" for example
                        return this.handle(request, response, cursor + 1);
                    }
                } else {
                    // Since the middleware pattern does not match the start of the request path, skip this middleware
                    return this.handle(request, response, cursor + 1);
                }
            }

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

        // Determine if this is an async handler which can explicitly throw uncaught errors
        const is_async_handler = (middleware ? middleware.handler : this.handler).constructor.name === 'AsyncFunction';
        if (is_async_handler) {
            // Execute the middleware or route handler within a promise to catch and pipe synchronous errors
            new Promise(async (resolve) => {
                try {
                    if (middleware) {
                        // Execute the middleware or route handler with the iterator
                        await middleware.handler(request, response, iterator);

                        // Call the iterator anyways in case the middleware never calls the next() iterator
                        iterator();
                    } else {
                        await this.handler(request, response);
                    }
                } catch (error) {
                    // Catch and pipe any errors to the error handler
                    response.throw(error);
                }

                // Resolve promise to ensure it is properly cleaned up from memory
                resolve();
            });
        } else {
            // Execute the middleware or route handler within a protected try/catch to catch and pipe synchronous errors
            try {
                let output;
                if (middleware) {
                    output = middleware.handler(request, response, iterator);
                } else {
                    output = this.handler(request, response);
                }

                // Determine if a Promise instance was returned by the handler
                if (typeof output?.then === 'function') {
                    // If this is a middleware, we must try to call iterator after returned promise resolves
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

    /**
     * Compiles the route's internal components and caches for incoming requests.
     */
    compile() {
        // Initialize a fresh array of middlewares
        const middlewares = [];
        const pattern = this.pattern;

        // Determine wildcard properties about this route
        const is_wildcard = pattern.endsWith('*');
        const wildcard_path = pattern.substring(0, pattern.length - 1);

        // Iterate through the global/local middlewares and connect them to this route if eligible
        const app_middlewares = this.app.middlewares;
        Object.keys(app_middlewares).forEach((pattern) =>
            app_middlewares[pattern].forEach((middleware) => {
                // A route can be a direct child when a route's pattern has more path depth than the middleware with a matching start
                // A route can be an indirect child when it is a wildcard and the middleware's pattern is a direct parent of the route child
                const direct_child = pattern.startsWith(middleware.pattern);
                const indirect_child = middleware.pattern.startsWith(wildcard_path);
                if (direct_child || (is_wildcard && indirect_child)) {
                    // Create shallow copy of the middleware
                    const record = Object.assign({}, middleware);

                    // Set the match property based on whether this is a direct child
                    record.match = direct_child;

                    // Push the middleware
                    middlewares.push(record);
                }
            })
        );

        // Find the largest ID from the current middlewares
        const offset = middlewares.reduce((max, middleware) => (middleware.id > max ? middleware.id : max), 0);

        // Push the route-specific middlewares to the array at the end
        if (Array.isArray(this.options.middlewares))
            this.options.middlewares.forEach((middleware) =>
                middlewares.push({
                    id: this.id + offset,
                    pattern,
                    handler: middleware,
                    match: false, // Route-specific middlewares do not need to be matched
                })
            );

        // Sort the middlewares by their id in ascending order
        // This will ensure that middlewares are executed in the order they were registered throughout the application
        middlewares.sort((a, b) => a.id - b.id);

        // Write the middlewares property with the sorted array
        this.options.middlewares = middlewares;
    }
}

module.exports = Route;
