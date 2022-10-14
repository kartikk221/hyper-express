'use strict';
const { merge_relative_paths } = require('../../shared/operators.js');

/**
 * @typedef {import('../http/Request.js') & import('stream').Stream} Request
 */

/**
 * @typedef {import('../http/Response.js') & import('stream').Stream} Response
 */

/**
 * @typedef {function(Request, Response, Function):any|Promise<any>} MiddlewareHandler
 */

class Router {
    #is_app = false;
    #subscribers = [];
    #records = {
        routes: [],
        middlewares: [],
    };

    constructor() {
        // Determine if Router is extended thus a Server instance
        this.#is_app = this.constructor.name === 'Server';
    }

    /**
     * Returns default route options based on method.
     *
     * @private
     * @param {String} method
     * @returns {Object}
     */
    _default_options(method) {
        return {
            streaming: {},
            middlewares: [],
        };
    }

    /**
     * Registers a route in the routes array for this router.
     *
     * @private
     * @param {String} method Supported: any, get, post, delete, head, options, patch, put, trace
     * @param {String} pattern Example: "/api/v1"
     * @param {Object} options Route processor options (Optional)
     * @param {Function} handler Example: (request, response) => {}
     */
    _register_route() {
        // Initialize property holders for building a route record
        let method = arguments[0]; // First argument will always be the method (in lowercase)
        let pattern = arguments[1]; // Second argument will always be the pattern
        let options, handler;

        // Look for object/function types to parse route options, potential middlewares and route handler from remaining arguments
        const callbacks = [];
        for (let i = 2; i < arguments.length; i++) {
            const parameter = arguments[i];
            if (typeof parameter == 'function') {
                // Scenario: Single function
                callbacks.push(parameter);
            } else if (Array.isArray(parameter)) {
                // Scenario: Array of functions
                callbacks.push(...parameter);
            } else if (parameter && typeof parameter == 'object') {
                // Scenario: Route options object
                options = parameter;
            }
        }

        // Write the route handler and route options object with fallback to the default options
        handler = callbacks.pop();
        options = options || this._default_options(method);

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
     */
    use() {
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
                // Scenario: Inferred middleware
                this._register_middleware(pattern, candidate.middleware);
            }
        }
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
