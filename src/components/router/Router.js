'use strict';
const { merge_relative_paths } = require('../../shared/operators.js');

function normalize_mount_pattern(pattern) {
    if (pattern.length > 1 && pattern.endsWith('/')) return pattern.slice(0, -1);
    return pattern;
}

function clone_route_options(options) {
    return {
        ...options,
        middlewares: Array.isArray(options.middlewares) ? [...options.middlewares] : [],
    };
}

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
    #handlers = {
        on_error: null,
        on_not_found: null,
    };
    #records = {
        routes: [],
        middlewares: [],
        mounts: [],
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

    /** @private */
    _get_error_handler() {
        return this.#handlers.on_error;
    }

    /** @private */
    _get_not_found_handler() {
        return this.#handlers.on_not_found;
    }

    /**
     * Registers a route in the routes array for this router.
     *
     * @private
     * @param {String} method Supported: any, get, post, delete, head, options, patch, put, trace
     * @param {String} pattern Example: "/api/v1"
     * @param {Object} options Route processor options (Optional)
     * @param {Function} handler Example: (request, response) => {}
     * @returns {this} Chainable instance
     */
    _register_route() {
        const method = arguments[0];

        // Normalize route overloads into a pattern, options object and ordered callbacks
        let pattern, options, handler;
        let options_count = 0;

        const callbacks = [];
        for (let argument_index = 1; argument_index < arguments.length; argument_index++) {
            const argument = arguments[argument_index];

            // Contextual routers may omit the pattern and begin with options or callbacks
            if (argument_index === 1) {
                if (typeof argument === 'string') {
                    if (this.#context_pattern) {
                        pattern = merge_relative_paths(this.#context_pattern, argument);
                    } else {
                        pattern = argument;
                    }

                    continue;
                } else if (!this.#context_pattern) {
                    throw new Error(
                        'HyperExpress.Router: Route pattern is required unless created from a chainable route instance using Route.route() method.'
                    );
                } else {
                    pattern = this.#context_pattern;
                }
            }

            if (typeof argument == 'function') {
                callbacks.push(argument);
            } else if (Array.isArray(argument)) {
                for (const candidate of argument) {
                    if (typeof candidate !== 'function')
                        throw new TypeError(
                            'HyperExpress.Router: Route middleware arrays may only contain functions.'
                        );
                }
                callbacks.push(...argument);
            } else if (argument && typeof argument == 'object') {
                options_count++;
                if (options_count > 1)
                    throw new TypeError(
                        'HyperExpress.Router: A route may only specify one options object.'
                    );
                options = argument;
            } else {
                throw new TypeError(
                    'HyperExpress.Router: Route arguments must be a pattern, options object, function, or middleware array.'
                );
            }
        }

        // The final callback handles the route while preceding callbacks act as middleware
        handler = callbacks.pop();
        if (typeof handler !== 'function')
            throw new TypeError('HyperExpress.Router: A route handler function is required.');

        options = {
            streaming: {},
            middlewares: [],
            ...(options || {}),
        };

        // Make a shallow copy of the options object to avoid mutating the original
        options = Object.assign({}, options);

        if (!pattern.length || pattern.includes('\0'))
            throw new TypeError(
                'HyperExpress.Router: Route patterns must be non-empty strings without null bytes.'
            );

        // uWS requires catch-all patterns to begin with a slash
        if (pattern.startsWith('*')) pattern = '/' + pattern;

        // Merge configured and positional middleware without mutating caller-owned arrays
        const middlewares = [];

        if (!Array.isArray(options.middlewares))
            throw new TypeError('HyperExpress.Router: options.middlewares must be an array of functions.');

        for (const middleware of options.middlewares) {
            if (typeof middleware !== 'function')
                throw new TypeError(
                    'HyperExpress.Router: options.middlewares may only contain functions.'
                );
            middlewares.push(middleware);
        }

        if (callbacks.length > 0) middlewares.push(...callbacks);

        options.middlewares = middlewares;

        const record = {
            method,
            pattern,
            options,
            handler,
            error_scopes: this.#is_app ? [] : [this],
        };

        return this._register_route_record(record);
    }

    /**
     * Stores and propagates an already-normalized route record.
     * @private
     * @param {Object} record
     */
    _register_route_record(record) {
        record = {
            ...record,
            options: clone_route_options(record.options),
            error_scopes: [...(record.error_scopes || [])],
        };

        // Store record for future subscribers
        this.#records.routes.push(record);

        // Server instances materialize records directly; routers notify their mounted parents
        if (this.#is_app) return this._create_route(record);

        // Notify mounted parent routers about the new route
        const subscribers = this.#subscribers;
        for (const subscriber of subscribers) {
            subscriber('route', record);
        }

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
            pattern: normalize_mount_pattern(pattern),
            middleware,
        };

        // Store record for future subscribers
        this.#records.middlewares.push(record);

        // Server instances materialize records directly; routers notify their mounted parents
        if (this.#is_app) return this._create_middleware(record);

        // Notify mounted parent routers about the new middleware
        const subscribers = this.#subscribers;
        for (const subscriber of subscribers) {
            subscriber('middleware', record);
        }

        return this;
    }

    /**
     * Stores a mounted router boundary used for scoped not-found handling.
     * @private
     * @param {Object} record
     */
    _register_mount(record) {
        record = {
            pattern: normalize_mount_pattern(record.pattern),
            scopes: [...record.scopes],
        };

        this.#records.mounts.push(record);

        if (this.#is_app) return this._create_router_mount(record);

        for (const subscriber of this.#subscribers) {
            subscriber('mount', record);
        }

        return this;
    }

    /**
     * Registers a router from use() method and recalibrates.
     *
     * @private
     * @param {String} pattern
     * @param {this} router
     */
    _register_router(pattern, router) {
        const reference = this;
        const parent_scopes = this.#is_app ? [] : [this];
        const mount_pattern = router.#context_pattern
            ? merge_relative_paths(pattern, router.#context_pattern)
            : pattern;

        this._register_mount({
            pattern: mount_pattern,
            scopes: [router, ...parent_scopes],
        });

        router._subscribe((event, object) => {
            switch (event) {
                case 'records':
                    const { routes, middlewares, mounts } = object;

                    // Replay existing child routes beneath the mounted path
                    for (const route_record of routes) {
                        reference._register_route_record({
                            ...route_record,
                            pattern: merge_relative_paths(pattern, route_record.pattern),
                            error_scopes: [...route_record.error_scopes, ...parent_scopes],
                        });
                    }

                    // Replay existing child middleware beneath the mounted path
                    for (const middleware_record of middlewares) {
                        reference._register_middleware(
                            merge_relative_paths(pattern, middleware_record.pattern),
                            middleware_record.middleware
                        );
                    }

                    for (const mount_record of mounts) {
                        reference._register_mount({
                            pattern: merge_relative_paths(pattern, mount_record.pattern),
                            scopes: [...mount_record.scopes, ...parent_scopes],
                        });
                    }
                    return;
                case 'route':
                    // Register route from router locally with adjusted pattern
                    return reference._register_route_record({
                        ...object,
                        pattern: merge_relative_paths(pattern, object.pattern),
                        error_scopes: [...object.error_scopes, ...parent_scopes],
                    });
                case 'middleware':
                    // Register middleware from router locally with adjusted pattern
                    return reference._register_middleware(
                        merge_relative_paths(pattern, object.pattern),
                        object.middleware
                    );
                case 'mount':
                    return reference._register_mount({
                        pattern: merge_relative_paths(pattern, object.pattern),
                        scopes: [...object.scopes, ...parent_scopes],
                    });
            }
        });

        return this;
    }

    /* Router public methods */

    /**
     * Subscribes a handler which will be invoked with changes.
     *
     * @private
     * @param {*} handler
     */
    _subscribe(handler) {
        // Replay existing records before subscribing to future registrations
        handler('records', this.#records);

        this.#subscribers.push(handler);
    }

    /**
     * Sets the error handler for routes and middleware owned by this router.
     * @param {function(NativeRequest, NativeResponse, Error):any} handler
     * @returns {this}
     */
    set_error_handler(handler) {
        if (typeof handler !== 'function')
            throw new TypeError('HyperExpress.Router.set_error_handler(): handler must be a function.');

        this.#handlers.on_error = handler;
        return this;
    }

    /**
     * Sets the not-found handler for requests beneath this router's mount boundary.
     * @param {function(NativeRequest, NativeResponse):any} handler
     * @returns {this}
     */
    set_not_found_handler(handler) {
        if (typeof handler !== 'function')
            throw new TypeError('HyperExpress.Router.set_not_found_handler(): handler must be a function.');

        this.#handlers.on_not_found = handler;
        return this;
    }

    /**
     * Registers middlewares and router instances on the specified pattern if specified.
     * If no pattern is specified, the middleware/router instance will be mounted on the '/' root path by default of this instance.
     *
     * @param {...(String|MiddlewareHandler|Router)} args (request, response, next) => {} OR (request, response) => new Promise((resolve, reject) => {})
     * @returns {this} Chainable instance
     */
    use() {
        // If we have a context pattern, then this is a contextual Chainable and should not allow middlewares or routers to be bound to it
        if (this.#context_pattern)
            throw new Error(
                'HyperExpress.Router.use() -> Cannot bind middlewares or routers to a contextual router created using Router.route() method.'
            );

        // Parse a pattern for this use call with a fallback to the local-global scope aka. '/' pattern
        const pattern = arguments[0] && typeof arguments[0] == 'string' ? arguments[0] : '/';

        if (!pattern.length || pattern.includes('\0'))
            throw new TypeError(
                'HyperExpress.Router.use(): mount patterns must be non-empty strings without null bytes.'
            );

        // Validate that the pattern value does not contain any wildcard or path parameter prefixes which are not allowed
        if (pattern.indexOf('*') > -1 || pattern.indexOf(':') > -1)
            throw new Error(
                'HyperExpress: Server/Router.use() -> Wildcard "*" & ":parameter" prefixed paths are not allowed when binding middlewares or routers using this method.'
            );

        // Register middleware, arrays, mounted routers and third-party middleware wrappers
        for (let candidate_index = 0; candidate_index < arguments.length; candidate_index++) {
            const candidate = arguments[candidate_index];
            if (typeof candidate == 'function') {
                this._register_middleware(pattern, candidate);
            } else if (Array.isArray(candidate)) {
                const middlewares = candidate;
                for (const middleware_handler of middlewares) {
                    if (typeof middleware_handler !== 'function')
                        throw new TypeError(
                            'HyperExpress.Router.use(): Middleware arrays may only contain functions.'
                        );
                }
                for (const middleware_handler of middlewares) {
                    this._register_middleware(pattern, middleware_handler);
                }
            } else if (candidate instanceof Router) {
                this._register_router(pattern, candidate);
            } else if (candidate && typeof candidate == 'object' && typeof candidate.middleware == 'function') {
                // Scenario: Inferred middleware for third-party middlewares which support the Middleware.middleware property
                this._register_middleware(pattern, candidate.middleware);
            } else if (candidate_index !== 0 || candidate !== pattern) {
                throw new TypeError(
                    'HyperExpress.Router.use(): Expected a middleware function, middleware array, Router, or middleware wrapper.'
                );
            }
        }

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
     * Returns a Chainable instance which can be used to bind multiple method routes or middlewares on the same path easily.
     * Example: `Router.route('/api/v1').get(getHandler).post(postHandler).delete(destroyHandler)`
     * Example: `Router.route('/api/v1').use(middleware).user(middleware2)`
     * @param {String} pattern
     * @returns {this} A Chainable instance with a context pattern set to this router's pattern.
     */
    route(pattern) {
        if (typeof pattern !== 'string' || !pattern.length || pattern.includes('\0'))
            throw new Error(
                'HyperExpress.Router.route(pattern) -> pattern must be a non-empty string without null bytes.'
            );

        // Bind subsequent route calls to the provided context pattern
        const router = new Router();
        router._set_context_pattern(pattern);
        this.use(router);

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
     * @property {('String'|'Buffer'|'ArrayBuffer'|'ArrayBufferSafe')} message_type Specifies data type in which to provide incoming websocket messages. ArrayBuffer is a volatile zero-copy view; ArrayBufferSafe is retained. Default: 'String'
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
    ws() {
        return this._register_route('ws', ...arguments);
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
