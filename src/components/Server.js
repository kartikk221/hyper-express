const uWebSockets = require('uWebSockets.js');
const operators = require('../shared/operators.js');
const Request = require('./http/Request.js');
const Response = require('./http/Response.js');
const WebsocketRoute = require('./ws/WebsocketRoute.js');

class Server {
    #uws_instance = null;
    #listen_socket = null;
    #session_engine = null;
    #unsafe_buffers = false;
    #fast_abort = false;
    #max_body_length = 250 * 1000;
    #handlers = {
        on_not_found: null,
        on_error: (req, res, error) => {
            res.status(500).send('HyperExpress: Uncaught Exception Occured');
            throw error;
        },
    };

    #middlewares = {
        global: {
            ANY: [],
        },
    };

    #defaults = {
        cert_file_name: '',
        key_file_name: '',
        passphrase: '',
        dh_params_file_name: '',
        ssl_prefer_low_memory_usage: false,
        fast_buffers: false,
        fast_abort: this.#fast_abort,
        max_body_length: this.#max_body_length,
    };

    /**
     * @param {Object} options Server Options
     * @param {String} options.cert_file_name Path to SSL certificate file.
     * @param {String} options.key_file_name Path to SSL private key file to be used for SSL/TLS.
     * @param {String} options.passphrase Strong passphrase for SSL cryptographic purposes.
     * @param {String} options.dh_params_file_name Path to SSL Diffie-Hellman parameters file.
     * @param {Boolean} options.ssl_prefer_low_memory_usage Specifies uWebsockets to prefer lower memory usage while serving SSL
     * @param {Boolean} options.fast_buffers Buffer.allocUnsafe is used when set to true for faster performance.
     * @param {Boolean} options.fast_abort Determines whether HyperExpress will abrubptly close bad requests. This can be much faster but the client does not receive an HTTP status code as it is a premature connection closure.
     * @param {Number} options.max_body_length Maximum body content length allowed in bytes. For Reference: 1kb = 1000 bytes and 1mb = 1000kb.
     */
    constructor(options = this.#defaults) {
        // Only accept object as a parameter type for options
        if (typeof options !== 'object')
            throw new Error(
                'HyperExpress: HyperExpress.Server constructor only accepts an object type for the options parameter.'
            );

        // Create underlying uWebsockets App or SSLApp to power HyperExpress
        const { cert_file_name, key_file_name } = options;
        if (cert_file_name && key_file_name) {
            this.#uws_instance = uWebSockets.SSLApp(options);
        } else {
            this.#uws_instance = uWebSockets.App(options);
        }

        // Determine which type of buffering scheme to utilize
        if (options.fast_buffers === true) this.#unsafe_buffers = true;

        // Determine whether HyperExpress should use fast abort scheme
        if (options.fast_abort === true) this.#fast_abort = true;

        // Determine maximum body length in bytes to allow for incoming requests
        if (typeof options.max_body_length == 'number' && options.max_body_length > 0)
            this.#max_body_length = options.max_body_length;
    }

    /**
     * This method is used to intiate the HyperExpress server
     *
     * @param {Number} port
     * @param {String} host
     * @returns {Promise} Promise
     */
    listen(port, host = '0.0.0.0') {
        let reference = this;
        return new Promise((resolve, reject) =>
            reference.#uws_instance.listen(host, port, (listen_socket) => {
                if (listen_socket) {
                    reference.#listen_socket = listen_socket;
                    this._bind_exit_handler();
                    resolve(listen_socket);
                } else {
                    reject('NO_SOCKET');
                }
            })
        );
    }

    /**
     * Closes/Halts current HyperExpress Server instance based on provided listen_socket
     *
     * @param {socket} listen_socket
     * @returns {Boolean} true || false
     */
    close(listen_socket) {
        let socket = listen_socket || this.#listen_socket;
        if (socket == null) return false;

        uWebSockets.us_listen_socket_close(socket);
        this.#listen_socket = null;
        return true;
    }

    /**
     * Sets a global error handler which will catch most uncaught errors
     * across all routes created on this server instance.
     *
     * @param {Function} handler
     */
    set_error_handler(handler) {
        if (typeof handler !== 'function')
            throw new Error('HyperExpress: handler must be a function');
        this.#handlers.on_error = handler;
    }

    /**
     * Sets a global not found handler which will handle
     * all incoming requests that are not handled by any existing routes.
     * Note! You must call this method last as it is a catchall route.
     *
     * @param {Function} handler
     */
    set_not_found_handler(handler) {
        if (typeof handler !== 'function')
            throw new Error('HyperExpress: handler must be a function');

        // Store not_found handler and bind it as a catchall route
        let should_bind = this.#handlers.on_not_found === null;
        this.#handlers.on_not_found = handler;
        if (should_bind)
            this.any('/*', (request, response) => this.#handlers.on_not_found(request, response));
    }

    /**
     * Binds a session engine which enables request.session for all requests.
     *
     * @param {SessionEngine} session_engine
     */
    set_session_engine(session_engine) {
        if (session_engine?.constructor?.name !== 'SessionEngine')
            throw new Error('HyperExpress: session_engine must be a SessionEngine instance');
        this.#session_engine = session_engine;
    }

    /**
     * Adds a global middleware for all incoming requests.
     *
     * @param {Function} handler (request, response, next) => {}
     */
    use(handler) {
        if (typeof handler !== 'function')
            throw new Error('HyperExpress: handler must be a function');

        // Register a global middleware
        this._register_middleware('global', 'ANY', handler, true);
    }

    /**
     * Registers a middleware onto internal middlewares tree.
     *
     * @param {String} route Route pattern for middleware
     * @param {String} method Route method (Uppercase) for middleware
     * @param {Array|Function} methods Singular function or an array of functions to store as middlewares
     * @param {Boolean} push Whether to write over old registered middlewares or push onto the old middlewares array
     */
    _register_middleware(route, method, methods, push = true) {
        if (route !== 'global' && method == 'ANY')
            throw new Error(
                'Route specific middlewares not allowed with .any() routes. Please only bind middlewares on method specific routes.'
            );

        // Initialize route branch in middlewares object
        if (this.#middlewares[route] == undefined) this.#middlewares[route] = {};

        // Convert singular provided handler function into an Array
        let handlers;
        if (typeof methods == 'function') {
            handlers = [methods];
        } else if (Array.isArray(methods)) {
            // Validate methods array contains functions only
            methods.forEach((method) => {
                if (typeof method !== 'function')
                    throw new Error(
                        '_register_middleware(route, method, methods) -> methods only contain Functions'
                    );
            });
            handlers = methods;
        } else {
            throw new Error(
                '_register_middleware(route, method, methods) -> methods must be a Function or Array'
            );
        }

        if (push === true) {
            // Initialize route:method branch if undefined for push operations
            if (this.#middlewares[route][method] == undefined) {
                this.#middlewares[route][method] = handlers;
            } else {
                let current = this.#middlewares[route][method];
                let concatenated = current.concat(handlers);
                this.#middlewares[route][method] = concatenated;
            }
        } else {
            // We will simply write over any old handlers that were registered to the route:method branch
            this.#middlewares[route][method] = handlers;
        }
    }

    /**
     * INTERNAL METHOD! This method is an internal method and should NOT be called manually.
     * This method binds a cleanup handler which closes the underlying uWS socket.
     */
    _bind_exit_handler() {
        let reference = this;
        ['exit', 'SIGINT', 'SIGUSR1', 'SIGUSR2', 'SIGTERM'].forEach((type) =>
            process.once(type, () => reference.close())
        );
    }

    /**
     * INTERNAL METHOD! This method is an internal method and should NOT be called manually.
     * This method chains a request/response through all middlewares.
     *
     * @param {String} route_pattern
     * @param {Request} request - Request Object
     * @param {Response} response - Response Object
     * @param {Function} route_handler - User specified route handler
     * @param {uWS.Socket} socket_context - uWebsockets.js upgrade request socket context.
     */
    _chain_middlewares(
        route_pattern,
        request,
        response,
        route_handler,
        socket_context,
        branch = 'global',
        cursor = 0
    ) {
        // Break chain if request has been aborted
        if (response.aborted) return;

        // Global middlewares take precedence over route specific middlewares
        if (branch === 'global') {
            // Determine current global middleware and execute
            let middleware = this.#middlewares['global']['ANY'][cursor];
            if (middleware)
                return middleware(request, response, () =>
                    this._chain_middlewares(
                        route_pattern,
                        request,
                        response,
                        route_handler,
                        socket_context,
                        branch,
                        cursor + 1
                    )
                );

            // Switch to route branch and reset cursor for route specific middlewares execution
            branch = 'route';
            cursor = 0;
        }

        // See if route/method specific middlewares exist and execute
        let pattern_middlewares = this.#middlewares[route_pattern];
        if (pattern_middlewares && pattern_middlewares[request.method]) {
            // Determine current route specific/method middleware and execute
            let middleware = this.#middlewares[route_pattern][request.method][cursor];
            if (middleware)
                return middleware(request, response, () =>
                    this._chain_middlewares(
                        route_pattern,
                        request,
                        response,
                        route_handler,
                        socket_context,
                        branch,
                        cursor + 1
                    )
                );
        }

        // Trigger user assigned route handler with wrapped request/response objects. Provide socket_context for upgrade requests.
        return route_handler(request, response, socket_context);
    }

    #routes = {
        ws: {},
        any: {},
        get: {},
        post: {},
        delete: {},
        head: {},
        options: {},
        patch: {},
        put: {},
        trace: {},
    };

    /**
     * INTERNAL METHOD! This method is an internal method and should NOT be called manually.
     * This method is used to create and bind a uWebsockets route with a middleman wrapper
     *
     * @param {String} method Supported: any, get, post, delete, head, options, patch, put, trace
     * @param {String} pattern Example: "/api/v1"
     * @param {Object} options Route processor options (Optional)
     * @param {Function} handler Example: (request, response) => {}
     */
    _create_route(method, pattern, options, handler) {
        // Do not allow duplicate routes for performance/stability reasons
        if (this.#routes[method]?.[pattern])
            throw new Error(
                'HyperExpress: Failed to create route as duplicate routes are not allowed.'
            );

        // Do not allow non object type options
        let options_type = typeof options;
        if (options_type !== 'object' && options_type !== 'function')
            throw new Error('HyperExpress: Failed to create route as options must be an object.');

        // Convert options to handler if options is a function
        if (typeof options == 'function') handler = options;

        // Parse route options if specified by user
        let route_options = options_type == 'object' ? options : {};

        // Register route specific middlewares
        if (Array.isArray(route_options.middlewares) && route_options.middlewares.length > 0)
            this._register_middleware(
                pattern,
                method.toUpperCase(),
                route_options.middlewares,
                false
            );

        // Pre-parse path parameters key and bind a middleman uWebsockets route for wrapping request/response objects
        let path_parameters_key = operators.parse_path_params(pattern);
        let route = this.#uws_instance[method](pattern, (response, request) =>
            this._handle_wrapped_request(
                pattern,
                request,
                response,
                null,
                handler,
                path_parameters_key,
                this
            )
        );

        return (this.#routes[method][pattern] = route);
    }

    /**
     * INTERNAL METHOD! This method is an internal method and should NOT be called manually.
     * This method is used to determine if request body should be pre-parsed in anticipation for future call.
     *
     * @param {Request} wrapped_request
     * @returns {Boolean} Boolean
     */
    _pre_parse_body(wrapped_request) {
        // Determine a content-length and content-type header exists to trigger pre-parsing
        let has_content_type = wrapped_request.headers['content-type'];
        let content_length = +wrapped_request.headers['content-length'];
        return has_content_type && !isNaN(content_length) && content_length > 0;
    }

    /**
     * INTERNAL METHOD! This method is an internal method and should NOT be called manually.
     * This method is used as a middleman wrapper for request/response objects to bind HyperExpress abstractions.
     *
     * @param {String} route_pattern
     * @param {Request} request
     * @param {Response} response
     * @param {UWS_SOCKET} socket
     * @param {Function} handler
     * @param {Array} path_params_key
     * @param {Server} master_context
     */
    async _handle_wrapped_request(
        route_pattern,
        request,
        response,
        socket,
        handler,
        path_params_key,
        master_context
    ) {
        // Wrap uWS.Request -> Request
        let wrapped_request = new Request(request, response, path_params_key, master_context);

        // Wrap uWS.Response -> Response
        let wrapped_response = new Response(wrapped_request, response, socket, this);

        // We initiate buffer retrieval as uWS.Request is deallocated after initial synchronous cycle
        if (this._pre_parse_body(wrapped_request)) {
            // Check incoming content-length to ensure it is within max_body_length bounds
            // Abort request with a 413 Payload Too Large status code
            if (+wrapped_request.headers['content-length'] > master_context.max_body_length) {
                // Use fast abort scheme if specified
                if (master_context.fast_abort === true) return response.close();

                // According to uWebsockets developer, we have to drain incoming data before aborting and closing request
                // Prematurely closing request with a 413 leads to an ECONNRESET in which we lose 413 error from client
                return response.onData((array_buffer, is_last) => {
                    if (is_last) wrapped_response.status(413).send();
                });
            }

            // Initiate body buffer download
            wrapped_request
                .buffer()
                .catch((error) =>
                    master_context.error_handler(wrapped_request, wrapped_response, error)
                );
        }

        // Wrap middlewares & route handler in a Promise to catch async/sync errors
        return new Promise((resolve, reject) => {
            try {
                // Call middleware chaining method and pass handler/socket
                resolve(
                    master_context._chain_middlewares(
                        route_pattern,
                        wrapped_request,
                        wrapped_response,
                        handler,
                        socket
                    )
                );
            } catch (error) {
                reject(error);
            }
        }).catch((error) => master_context.error_handler(wrapped_request, wrapped_response, error));
    }

    /* Server Route Alias Methods */

    any(pattern, options, handler) {
        return this._create_route('any', pattern, options, handler);
    }

    get(pattern, options, handler) {
        return this._create_route('get', pattern, options, handler);
    }

    post(pattern, options, handler) {
        return this._create_route('post', pattern, options, handler);
    }

    delete(pattern, options, handler) {
        return this._create_route('del', pattern, options, handler);
    }

    head(pattern, options, handler) {
        return this._create_route('head', pattern, options, handler);
    }

    options(pattern, options, handler) {
        return this._create_route('options', pattern, options, handler);
    }

    patch(pattern, options, handler) {
        return this._create_route('patch', pattern, options, handler);
    }

    trace(pattern, options, handler) {
        return this._create_route('trace', pattern, options, handler);
    }

    connect(pattern, options, handler) {
        return this._create_route('connect', pattern, options, handler);
    }

    ws(pattern, options = {}) {
        // Do not allow duplicate routes for performance/stability reasons
        let method = 'ws';
        if (this.#routes[method]?.[pattern])
            throw new Error(
                `HyperExpress: Failed to create ${method} @ ${pattern} as duplicate routes are not allowed.`
            );

        // Enforce object type on provided options
        if (typeof options !== 'object')
            throw new Error('HyperExpress: .ws(pattern, options) -> options must be an Object');

        // Create WebsocketRoute instance for specified pattern/options
        let route = new WebsocketRoute(pattern, options, this);
        this.#routes[method][pattern] = route;
        return route;
    }

    /* Safe Server Getters */

    /**
     * Returns middlewares store/tree used by HyperExpress to route incoming requests through middlewares.
     */
    get middlewares() {
        return this.#middlewares;
    }

    /**
     * Returns global error handler for current Server instance.
     *
     * @returns {Function} (request, response, error) => {}
     */
    get error_handler() {
        return this.#handlers.on_error;
    }

    /**
     * Returns session engine instance bound to current Server instance.
     *
     * @returns {SessionEngine} SessionEngine
     */
    get session_engine() {
        return this.#session_engine;
    }

    /**
     * Returns underlying uWebsockets.js Templated App instance.
     *
     * @returns {uWS} uWS (uWebsockets)
     */
    get uws_instance() {
        return this.#uws_instance;
    }

    /**
     * Returns all routes for current Server instance grouped by handled method.
     *
     * @returns {Object} Object
     */
    get routes() {
        return this.#routes;
    }

    /**
     * Returns whether instance is using unasfe buffers for storing incoming request bodies.
     */
    get fast_buffers() {
        return this.#unsafe_buffers;
    }

    /**
     * Returns Maximum number of bytes allowed in incoming body content length.
     */
    get max_body_length() {
        return this.#max_body_length;
    }

    /**
     * Returns whether HyperExpress will abruptly close incoming requests with bad data.
     */
    get fast_abort() {
        return this.#fast_abort;
    }
}

module.exports = Server;
