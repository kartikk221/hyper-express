'use strict';
const { merge_relative_paths } = require('../../shared/operators.js');

/**
 * @typedef {import('../compatibility/NodeRequest.js')} NodeRequest
 * @typedef {import('../compatibility/NodeResponse.js').NodeResponseTypes} NodeResponse
 * @typedef {import('../compatibility/ExpressRequest.js')} ExpressRequest
 * @typedef {import('../compatibility/ExpressResponse.js')} ExpressResponse
 * @typedef {import('../http/Request.js')} NativeRequest
 * @typedef {import('../http/Response.js')} NativeResponse
 * @typedef {NativeRequest & NodeRequest & ExpressRequest & import('stream').Stream} Request
 * @typedef {NativeResponse & NodeResponse & ExpressResponse & import('stream').Stream} Response
 * @typedef {function(Request, Response, Function):any|Promise<any>} MiddlewareHandler
 */

class Router {
    #is_app = false;
    #context_pattern;
    #subscribers = [];
    #records = {
        routes: [],
        middlewares: [],
    };

    constructor() {}

    /**
     * Used by the server to declare self as an app instance.
     *
     * @private
     * @param {Boolean} value
     */
    _is_app(value) {
        this.#is_app = value;
    }

    /**
     * Sets context pattern for this router which will auto define the pattern of each route called on this router.
     * This is called by the .route() returned Router instance which allows for omission of pattern to be passed to route() method.
     * Example: Router.route('/something/else').get().post().delete() etc will all be bound to pattern '/something/else'
     * @private
     * @param {string} path
     */
    _set_context_pattern(path) {
        this.#context_pattern = path;
    }

    /**
     * Registers a route in the routes array for this router.
     *
     * @private
     * @param {String} method Supported: any, get, post, delete, head, options, patch, put, trace
     * @param {String} pattern Example: "/api/v1"
     * @param {Object} options Route processor options (Optional)
     * @param {Function} handler Example: (request, response) => {}
     * @returns {Router} Chainable Router instance
     */
    _register_route() {
        // The first argument will always be the method (in lowercase)
        const method = arguments[0];

        // The pattern, options and handler must be dynamically parsed depending on the arguments provided and router behavior
        let pattern, options, handler;

        // Iterate through the remaining arguments to find the above values and also build an Array of middleware / handler callbacks
        // The route handler will be the last one in the array
        const callbacks = [];
        for (let i = 1; i < arguments.length; i++) {
            const argument = arguments[i];

            // The second argument should be the pattern. If it is a string, it is the pattern. If it is anything else and we do not have a context pattern, throw an error as that means we have no pattern.
            if (i === 1) {
                if (typeof argument === 'string') {
                    if (this.#context_pattern) {
                        // merge the provided pattern with the context pattern
                        pattern = merge_relative_paths(this.#context_pattern, argument);
                    } else {
                        // The path is as is
                        pattern = argument;
                    }

                    // Continue to the next argument as this is not the pattern but we have a context pattern
                    continue;
                } else if (!this.#context_pattern) {
                    throw new Error(
                        'HyperExpress.Router: Route pattern is required unless created from a chainable route instance using Route.route() method.'
                    );
                } else {
                    // The path is the context pattern
                    pattern = this.#context_pattern;
                }
            }

            // Look for options, middlewares and handler in the remaining arguments
            if (typeof argument == 'function') {
                // Scenario: Single function
                callbacks.push(argument);
            } else if (Array.isArray(argument)) {
                // Scenario: Array of functions
                callbacks.push(...argument);
            } else if (argument && typeof argument == 'object') {
                // Scenario: Route options object
                options = argument;
            }
        }

        // Write the route handler and route options object with fallback to the default options
        handler = callbacks.pop();
        options = {
            streaming: {},
            middlewares: [],
            ...(options || {}),
        };

        // Make a shallow copy of the options object to avoid mutating the original
        options = Object.assign({}, options);

        // Enforce a leading slash on the pattern if it begins with a catchall star
        // This is because uWebsockets.js does not treat non-leading slashes as catchall stars
        if (pattern.startsWith('*')) pattern = '/' + pattern;

        // Parse the middlewares into a new array to prevent mutating the original
        const middlewares = [];

        // Push all the options provided middlewares into the middlewares array
        if (Array.isArray(options.middlewares)) middlewares.push(...options.middlewares);

        // Push all the callback provided middlewares into the middlewares array
        if (callbacks.length > 0) middlewares.push(...callbacks);

        // Write the middlewares into the options object
        options.middlewares = middlewares;

        // Initialize the record object which will hold information about this route
        const record = {
            method,
            pattern,
            options,
            handler,
        };

        // Store record for future subscribers
        this.#records.routes.push(record);

        // Create route if this is a Server extended Router instance (ROOT)
        if (this.#is_app) return this._create_route(record);

        // Alert all subscribers of the new route that was created
        this.#subscribers.forEach((subscriber) => subscriber('route', record));

        // Return this to make the Router chainable
        return this;
    }

    /**
     * Registers a middleware from use() method and recalibrates.
     *
     * @private
     * @param {String} pattern
     * @param {Function} middleware
     */
    _register_middleware(pattern, middleware) {
        const record = {
            pattern: pattern.endsWith('/') ? pattern.slice(0, -1) : pattern, // Do not allow trailing slash in middlewares
            middleware,
        };

        // Store record for future subscribers
        this.#records.middlewares.push(record);

        // Create middleware if this is a Server extended Router instance (ROOT)
        if (this.#is_app) return this._create_middleware(record);

        // Alert all subscribers of the new middleware that was created
        this.#subscribers.forEach((subscriber) => subscriber('middleware', record));
    }

    /**
     * Registers a router from use() method and recalibrates.
     *
     * @private
     * @param {String} pattern
     * @param {Router} router
     */
    _register_router(pattern, router) {
        const reference = this;
        router._subscribe((event, object) => {
            switch (event) {
                case 'records':
                    // Destructure records from router
                    const { routes, middlewares } = object;

                    // Register routes from router locally with adjusted pattern
                    routes.forEach((record) =>
                        reference._register_route(
                            record.method,
                            merge_relative_paths(pattern, record.pattern),
                            record.options,
                            record.handler
                        )
                    );

                    // Register middlewares from router locally with adjusted pattern
                    return middlewares.forEach((record) =>
                        reference._register_middleware(merge_relative_paths(pattern, record.pattern), record.middleware)
                    );
                case 'route':
                    // Register route from router locally with adjusted pattern
                    return reference._register_route(
                        object.method,
                        merge_relative_paths(pattern, object.pattern),
                        object.options,
                        object.handler
                    );
                case 'middleware':
                    // Register middleware from router locally with adjusted pattern
                    return reference._register_middleware(
                        merge_relative_paths(pattern, object.patch),
                        object.middleware
                    );
            }
        });
    }

    /* Router public methods */

    /**
     * Subscribes a handler which will be invocated with changes.
     *
     * @private
     * @param {*} handler
     */
    _subscribe(handler) {
        // Pipe all records on first subscription to synchronize
        handler('records', this.#records);

        // Register subscriber handler for future updates
        this.#subscribers.push(handler);
    }

    /**
     * Registers middlewares and router instances on the specified pattern if specified.
     * If no pattern is specified, the middleware/router instance will be mounted on the '/' root path by default of this instance.
     *
     * @param {...(String|MiddlewareHandler|Router)} args (request, response, next) => {} OR (request, response) => new Promise((resolve, reject) => {})
     * @returns {Router} Chainable Router instance
     */
    use() {
        // If we have a context pattern, then this is a contextual chainable router and should not allow middlewares or routers to be bound to it
        if (this.#context_pattern)
            throw new Error(
                'HyperExpress.Router.use() -> Cannot bind middlewares or routers to a contextual router created using Router.route() method.'
            );

        // Parse a pattern for this use call with a fallback to the local-global scope aka. '/' pattern
        const pattern = arguments[0] && typeof arguments[0] == 'string' ? arguments[0] : '/';

        // Validate that the pattern value does not contain any wildcard or path parameter prefixes which are not allowed
        if (pattern.indexOf('*') > -1 || pattern.indexOf(':') > -1)
            throw new Error(
                'HyperExpress: Server/Router.use() -> Wildcard "*" & ":parameter" prefixed paths are not allowed when binding middlewares or routers using this method.'
            );

        // Register each candidate individually depending on the type of candidate value
        for (let i = 0; i < arguments.length; i++) {
            const candidate = arguments[i];
            if (typeof candidate == 'function') {
                // Scenario: Single function
                this._register_middleware(pattern, candidate);
            } else if (Array.isArray(candidate)) {
                // Scenario: Array of functions
                candidate.forEach((middleware) => this._register_middleware(pattern, middleware));
            } else if (typeof candidate == 'object' && candidate.constructor.name === 'Router') {
                // Scenario: Router instance
                this._register_router(pattern, candidate);
            } else if (candidate && typeof candidate == 'object' && typeof candidate.middleware == 'function') {
                // Scenario: Inferred middleware for third-party middlewares which support the Middleware.middleware property
                this._register_middleware(pattern, candidate.middleware);
            }
        }

        // Return this to make the Router chainable
        return this;
    }

    /**
     * @typedef {Object} RouteOptions
     * @property {Number} max_body_length Overrides the global maximum body length specified in Server constructor options.
     * @property {Array.<MiddlewareHandler>} middlewares Route specific middlewares
     * @property {Object} streaming Global content streaming options.
     * @property {import('stream').ReadableOptions} streaming.readable Global content streaming options for Readable streams.
     * @property {import('stream').WritableOptions} streaming.writable Global content streaming options for Writable streams.
     */

    /**
     * Returns a chainable Router instance which can be used to bind multiple method routes or middlewares on the same path easily.
     * Example: `Router.route('/api/v1').get(getHandler).post(postHandler).delete(destroyHandler)`
     * Example: `Router.route('/api/v1').use(middleware).user(middleware2)`
     * @param {String} pattern
     * @returns {Router} A chainable Router instance with a context pattern set to this router's pattern.
     */
    route(pattern) {
        // Ensure that the pattern is a string
        if (!pattern || typeof pattern !== 'string')
            throw new Error('HyperExpress.Router.route(pattern) -> pattern must be a string.');

        // Create a new router instance with the context pattern set to the provided pattern
        const router = new Router();
        router._set_context_pattern(pattern);
        this.use(router);

        // Return the router instance to allow for chainable bindings
        return router;
    }

    /**
     * Creates an HTTP route that handles any HTTP method requests.
     * Note! ANY routes do not support route specific middlewares.
     *
     * @param {String} pattern
     * @param {...(RouteOptions|MiddlewareHandler)} args
     */
    any() {
        return this._register_route('any', ...arguments);
    }

    /**
     * Alias of any() method.
     * Creates an HTTP route that handles any HTTP method requests.
     * Note! ANY routes do not support route specific middlewares.
     *
     * @param {String} pattern
     * @param {...(RouteOptions|MiddlewareHandler)} args
     */
    all() {
        // Alias of any() method
        return this.any(...arguments);
    }

    /**
     * Creates an HTTP route that handles GET method requests.
     *
     * @param {String} pattern
     * @param {...(RouteOptions|MiddlewareHandler)} args
     */
    get() {
        return this._register_route('get', ...arguments);
    }

    /**
     * Creates an HTTP route that handles POST method requests.
     *
     * @param {String} pattern
     * @param {...(RouteOptions|MiddlewareHandler)} args
     */
    post() {
        return this._register_route('post', ...arguments);
    }

    /**
     * Creates an HTTP route that handles PUT method requests.
     *
     * @param {String} pattern
     * @param {...(RouteOptions|MiddlewareHandler)} args
     */
    put() {
        return this._register_route('put', ...arguments);
    }

    /**
     * Creates an HTTP route that handles DELETE method requests.
     *
     * @param {String} pattern
     * @param {...(RouteOptions|MiddlewareHandler)} args
     */
    delete() {
        return this._register_route('del', ...arguments);
    }

    /**
     * Creates an HTTP route that handles HEAD method requests.
     *
     * @param {String} pattern
     * @param {...(RouteOptions|MiddlewareHandler)} args
     */
    head() {
        return this._register_route('head', ...arguments);
    }

    /**
     * Creates an HTTP route that handles OPTIONS method requests.
     *
     * @param {String} pattern
     * @param {...(RouteOptions|MiddlewareHandler)} args
     */
    options() {
        return this._register_route('options', ...arguments);
    }

    /**
     * Creates an HTTP route that handles PATCH method requests.
     *
     * @param {String} pattern
     * @param {...(RouteOptions|MiddlewareHandler)} args
     */
    patch() {
        return this._register_route('patch', ...arguments);
    }

    /**
     * Creates an HTTP route that handles TRACE method requests.
     *
     * @param {String} pattern
     * @param {...(RouteOptions|MiddlewareHandler)} args
     */
    trace() {
        return this._register_route('trace', ...arguments);
    }

    /**
     * Creates an HTTP route that handles CONNECT method requests.
     *
     * @param {String} pattern
     * @param {...(RouteOptions|MiddlewareHandler)} args
     */
    connect() {
        return this._register_route('connect', ...arguments);
    }

    /**
     * Intercepts and handles upgrade requests for incoming websocket connections.
     * Note! You must call response.upgrade(data) at some point in this route to open a websocket connection.
     *
     * @param {String} pattern
     * @param {...(RouteOptions|MiddlewareHandler)} args
     */
    upgrade() {
        return this._register_route('upgrade', ...arguments);
    }

    /**
     * @typedef {Object} WSRouteOptions
     * @property {('String'|'Buffer'|'ArrayBuffer')} message_type Specifies data type in which to provide incoming websocket messages. Default: 'String'
     * @property {Number} compression Specifies preset for permessage-deflate compression. Specify one from HyperExpress.compressors.PRESET
     * @property {Number} idle_timeout Specifies interval to automatically timeout/close idle websocket connection in seconds. Default: 32
     * @property {Number} max_backpressure Specifies maximum websocket backpressure allowed in character length. Default: 1024 * 1024
     * @property {Number} max_payload_length Specifies maximum length allowed on incoming messages. Default: 32 * 1024
     */

    /**
     * @typedef WSRouteHandler
     * @type {function(import('../ws/Websocket.js')):void}
     */

    /**
     * @param {String} pattern
     * @param {WSRouteOptions|WSRouteHandler} options
     * @param {WSRouteHandler} handler
     */
    ws(pattern, options, handler) {
        return this._register_route('ws', pattern, options, handler);
    }

    /* Route getters */

    /**
     * Returns All routes in this router in the order they were registered.
     * @returns {Array}
     */
    get routes() {
        return this.#records.routes;
    }

    /**
     * Returns all middlewares in this router in the order they were registered.
     * @returns {Array}
     */
    get middlewares() {
        return this.#records.middlewares;
    }
}

module.exports = Router;
