'use strict';
const { parse_path_parameters } = require('../../shared/operators.js');

class Route {
    id = null;
    app = null;
    path = '';
    method = '';
    pattern = '';
    handler = null;
    options = null;
    streaming = null;
    max_body_length = null;
    path_parameters_key = null;
    error_scopes = [];

    /**
     * Constructs a new Route object.
     * @param {Object} options
     * @param {import('../Server.js')} options.app - The server instance.
     * @param {String} options.method - The HTTP method.
     * @param {String} options.pattern - The route pattern.
     * @param {Function} options.handler - The route handler.
     */
    constructor({ app, method, pattern, options, handler, error_scopes = [] }) {
        this.id = app._get_incremented_id();
        this.app = app;
        this.pattern = pattern;
        this.handler = handler;
        this.options = {
            ...options,
            middlewares: Array.isArray(options.middlewares) ? [...options.middlewares] : [],
        };
        this.method = method.toUpperCase();
        this.streaming = options.streaming ?? app._options.streaming ?? {};
        this.max_body_length = options.max_body_length ?? app._options.max_body_length;
        this.path_parameters_key = parse_path_parameters(pattern);
        this.error_scopes = [...error_scopes];

        // Translate to HTTP DELETE
        if (this.method === 'DEL') this.method = 'DELETE';

        // Cache literal paths so requests can bypass wildcard and parameter parsing
        const wildcard = pattern.includes('*') || this.path_parameters_key.length > 0;
        if (!wildcard) this.path = pattern;
    }

    /**
     * @typedef {Object} Middleware
     * @property {Number} id - Unique identifier for this middleware based on its registration order.
     * @property {String} pattern - The middleware pattern.
     * @property {function} handler - The middleware handler function.
     * @property {Boolean=} match - Whether to match the middleware pattern against the request path.
     */

    /**
     * Binds middleware to this route and sorts middlewares to ensure execution order.
     *
     * @param {Middleware} middleware
     */
    use(middleware) {
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
        // Ignore lifecycle work after the response has completed
        if (response.completed) return;

        const middleware = this.options.middlewares[cursor];
        if (middleware) {
            if (middleware.match) {
                if (middleware.pattern === '/') {
                    // Root middleware always matches.
                } else if (request.path.startsWith(middleware.pattern)) {
                    // Require a path boundary so "/docs" does not match "/docs-JSON"
                    const trailing = request.path[middleware.pattern.length];
                    if (trailing !== '/' && trailing !== undefined) {
                        return this.handle(request, response, cursor + 1);
                    }
                } else {
                    return this.handle(request, response, cursor + 1);
                }
            }

            let completed = false;
            let duplicate_reported = false;

            // A middleware can complete through next(), fulfillment, rejection, or a throw exactly once.
            const complete = (error, force_error = false) => {
                if (completed) {
                    if (this.app._options.strict_middleware && !duplicate_reported) {
                        duplicate_reported = true;
                        this.handle_error(
                            request,
                            response,
                            new Error(
                                'ERR_DUPLICATE_MIDDLEWARE_COMPLETION: Middleware called next() or settled more than once.'
                            )
                        );
                    }
                    return false;
                }

                completed = true;
                if (force_error || error instanceof Error) {
                    response.throw(error);
                } else {
                    this.handle(request, response, cursor + 1);
                }
                return true;
            };

            const iterator = (error) => complete(error, false);
            let output;
            try {
                output = middleware.handler(request, response, iterator);
            } catch (error) {
                complete(error, true);
                return;
            }

            let is_thenable;
            try {
                is_thenable = output != null && typeof output.then === 'function';
            } catch (error) {
                complete(error, true);
                return;
            }

            if (is_thenable) {
                Promise.resolve(output).then(
                    (value) => complete(value, value instanceof Error),
                    (error) => complete(error, true)
                );
            }

            return;
        }

        // Route handlers do not auto-chain, but returned thenables are observed for lifecycle errors.
        let output;
        try {
            output = this.handler(request, response);
        } catch (error) {
            response.throw(error);
            return;
        }

        let is_thenable;
        try {
            is_thenable = output != null && typeof output.then === 'function';
        } catch (error) {
            response.throw(error);
            return;
        }

        if (is_thenable) {
            Promise.resolve(output).then(
                (value) => {
                    if (value instanceof Error) response.throw(value);
                },
                (error) => response.throw(error)
            );
        }
    }

    /**
     * Dispatches an error through this route's router scopes before the server handler.
     * @private
     */
    handle_error(request, response, error, scopes = this.error_scopes, cursor = 0) {
        if (!(error instanceof Error)) error = new Error(`ERR_CAUGHT_NON_ERROR_TYPE: ${error}`);

        let handler;
        while (cursor < scopes.length && !handler) {
            handler = scopes[cursor]._get_error_handler();
            cursor++;
        }

        const fallback = (next_error) =>
            this.handle_error(request, response, next_error, scopes, cursor);

        if (!handler) {
            handler = this.app.handlers.on_error;
            try {
                const output = handler(request, response, error);
                if (output != null && typeof output.then === 'function') {
                    Promise.resolve(output).then(
                        (value) => {
                            if (value instanceof Error) {
                                console.error(value);
                                if (!response.completed) response.close();
                            }
                        },
                        (handler_error) => {
                            console.error(handler_error);
                            if (!response.completed) response.close();
                        }
                    );
                }
            } catch (handler_error) {
                console.error(handler_error);
                if (!response.completed) response.close();
            }
            return;
        }

        try {
            const output = handler(request, response, error);
            if (output != null && typeof output.then === 'function') {
                Promise.resolve(output).then(
                    (value) => {
                        if (value instanceof Error) fallback(value);
                    },
                    fallback
                );
            }
        } catch (handler_error) {
            fallback(handler_error);
        }
    }

    /**
     * Compiles the route's internal components and caches for incoming requests.
     */
    compile() {
        // Build the ordered middleware chain used by this route
        const route_middlewares = [];
        const route_pattern = this.pattern;

        // Cache wildcard details used to determine middleware path matching
        const is_wildcard = route_pattern.endsWith('*');
        const wildcard_path = route_pattern.substring(0, route_pattern.length - 1);

        // Flatten registered application middleware into this route's execution chain
        const app_middlewares = this.app.middlewares;
        const middleware_patterns = Object.keys(app_middlewares);
        for (let index = 0; index < middleware_patterns.length; index++) {
            const middleware_pattern = middleware_patterns[index];
            const middlewares = app_middlewares[middleware_pattern];
            for (const middleware_record of middlewares) {
                // Direct children belong to a middleware branch at or below the middleware's registered path
                const direct_child = middleware_pattern.startsWith(middleware_record.pattern);

                // Indirect children belong beneath the fixed path prefix of a wildcard route
                const indirect_child = middleware_record.pattern.startsWith(wildcard_path);
                if (direct_child || (is_wildcard && indirect_child)) {
                    // Copy the record so route-specific match state does not mutate shared middleware
                    const compiled_middleware = Object.assign({}, middleware_record);
                    compiled_middleware.match = direct_child;
                    route_middlewares.push(compiled_middleware);
                }
            }
        }

        // Offset route-specific middleware IDs after the latest application middleware
        let offset = 0;
        for (const middleware_record of route_middlewares) {
            if (middleware_record.id > offset) offset = middleware_record.id;
        }

        // Append route-specific middleware after applicable application middleware
        if (Array.isArray(this.options.middlewares)) {
            const middlewares = this.options.middlewares;
            for (const middleware_handler of middlewares) {
                route_middlewares.push({
                    id: this.id + offset,
                    pattern: route_pattern,
                    handler: middleware_handler,
                    match: false, // Route-specific middlewares do not need to be matched
                });
            }
        }

        // Preserve registration order across application and route middleware
        route_middlewares.sort((a, b) => a.id - b.id);
        this.options.middlewares = route_middlewares;
    }
}

module.exports = Route;
