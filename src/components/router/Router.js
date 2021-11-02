const Request = require('../http/Request.js'); // lgtm [js/unused-local-variable]
const Response = require('../http/Response.js'); // lgtm [js/unused-local-variable]
const Websocket = require('../ws/Websocket.js'); // lgtm [js/unused-local-variable]
const { merge_relative_paths } = require('../../shared/operators.js');

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
        switch (method) {
            case 'ws':
                return {}; // WebsocketRoute is special so it has no defaults from here
            default:
                return {
                    expect_body: false,
                    middlewares: method === 'any' ? undefined : [],
                };
        }
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
    _register_route(method, pattern, options, handler = null) {
        // Determine final options object and final handler for route
        const fOptions =
            options && typeof options == 'object' ? options : this._default_options(method);
        const fHandler = typeof options == 'function' ? options : handler;
        const record = {
            method,
            pattern,
            options: fOptions,
            handler: fHandler,
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
            pattern,
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
                        reference._register_middleware(
                            merge_relative_paths(pattern, record.pattern),
                            record.middleware
                        )
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
     * @typedef MiddlewareHandler
     * @type {function(Request, Response, Function):void}
     */

    /**
     * Registers a middleware/router with specified path.
     *
     * @param {String|MiddlewareHandler|Router} pattern
     * @param {MiddlewareHandler|Router} handler (request, response, next) => {} OR (request, response) => new Promise((resolve, reject) => {})
     */
    use(pattern, handler) {
        const fPattern = typeof pattern == 'string' ? pattern : '/'; // Final Pattern parameter
        const pHandler = typeof pattern !== 'string' ? pattern : handler; // Parsed Handler parameter

        // Middleware Handler - Attempts to parse middleware property from a hyper-express middleware package
        const mHandler =
            typeof pHandler == 'object' && typeof pHandler.middleware == 'function'
                ? pHandler.middleware
                : undefined;

        // Final Handler - This is a catchall constant that contains the parsed handler for a middleware
        const fHandler = mHandler || pHandler; // Prioritize middleware handler with parsed handler as fallback

        // Ensure we have a valid handler which is either a router or function
        const isRouter = fHandler.constructor.name === 'Router';
        if (!isRouter && typeof fHandler !== 'function')
            throw new Error(
                'Server/Router.use() -> handler must be a Function or Router instance.'
            );

        // Ensure no wildcards or parameter path prefixes are found in pattern
        if (fPattern.indexOf('*') > -1 || fPattern.indexOf(':') > -1)
            throw new Error(
                'Server/Router.use() -> Wildcard * & :parameter prefixed paths are not allowed when binding middlewares or routers using this method.'
            );

        // Register Router/Handler to self instance
        if (isRouter) {
            this._register_router(fPattern, fHandler);
        } else {
            this._register_middleware(fPattern, fHandler);
        }
    }

    /**
     * @typedef {Object} RouteOptions
     * @property {Array.<MiddlewareHandler>|Array.<PromiseMiddlewareHandler>} middlewares Route specific middlewares
     * @property {Boolean} expect_body Pre-parses and populates Request.body with specified body type.
     */

    /**
     * @typedef RouteHandler
     * @type {function(Request, Response):void}
     */

    /**
     * Creates an HTTP route that handles any HTTP method requests.
     * Note! ANY routes do not support route specific middlewares.
     *
     * @param {String} pattern
     * @param {RouteOptions|RouteHandler} options
     * @param {RouteHandler} handler
     */
    any(pattern, options, handler) {
        return this._register_route('any', pattern, options, handler);
    }

    /**
     * Creates an HTTP route that handles GET method requests.
     *
     * @param {String} pattern
     * @param {RouteOptions|RouteHandler} options
     * @param {RouteHandler} handler
     */
    get(pattern, options, handler) {
        return this._register_route('get', pattern, options, handler);
    }

    /**
     * Creates an HTTP route that handles POST method requests.
     *
     * @param {String} pattern
     * @param {RouteOptions|RouteHandler} options
     * @param {RouteHandler} handler
     */
    post(pattern, options, handler) {
        return this._register_route('post', pattern, options, handler);
    }

    /**
     * Creates an HTTP route that handles PUT method requests.
     *
     * @param {String} pattern
     * @param {RouteOptions|RouteHandler} options
     * @param {RouteHandler} handler
     */
    put(pattern, options, handler) {
        return this._register_route('put', pattern, options, handler);
    }

    /**
     * Creates an HTTP route that handles DELETE method requests.
     *
     * @param {String} pattern
     * @param {RouteOptions|RouteHandler} options
     * @param {RouteHandler} handler
     */
    delete(pattern, options, handler) {
        return this._register_route('del', pattern, options, handler);
    }

    /**
     * Creates an HTTP route that handles HEAD method requests.
     *
     * @param {String} pattern
     * @param {RouteOptions|RouteHandler} options
     * @param {RouteHandler} handler
     */
    head(pattern, options, handler) {
        return this._register_route('head', pattern, options, handler);
    }

    /**
     * Creates an HTTP route that handles OPTIONS method requests.
     *
     * @param {String} pattern
     * @param {RouteOptions|RouteHandler} options
     * @param {RouteHandler} handler
     */
    options(pattern, options, handler) {
        return this._register_route('options', pattern, options, handler);
    }

    /**
     * Creates an HTTP route that handles PATCH method requests.
     *
     * @param {String} pattern
     * @param {RouteOptions|RouteHandler} options
     * @param {RouteHandler} handler
     */
    patch(pattern, options, handler) {
        return this._register_route('patch', pattern, options, handler);
    }

    /**
     * Creates an HTTP route that handles TRACE method requests.
     *
     * @param {String} pattern
     * @param {RouteOptions|RouteHandler} options
     * @param {RouteHandler} handler
     */
    trace(pattern, options, handler) {
        return this._register_route('trace', pattern, options, handler);
    }

    /**
     * Creates an HTTP route that handles CONNECT method requests.
     *
     * @param {String} pattern
     * @param {RouteOptions|RouteHandler} options
     * @param {RouteHandler} handler
     */
    connect(pattern, options, handler) {
        return this._register_route('connect', pattern, options, handler);
    }

    /**
     * Intercepts and handles upgrade requests for incoming websocket connections.
     * Note! You must call response.upgrade(data) at some point in this route to open a websocket connection.
     *
     * @param {String} pattern
     * @param {RouteOptions|RouteHandler} options
     * @param {RouteHandler} handler
     */
    upgrade(pattern, options, handler) {
        return this._register_route('upgrade', pattern, options, handler);
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
     * @type {function(Websocket):void}
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
     * Returns All routes in this router.
     * @returns {Object}
     */
    get routes() {
        return this.#records.routes;
    }

    /**
     * Returns all middlewares in this router.
     */
    get middlewares() {
        return this.#records.middlewares;
    }
}

module.exports = Router;
