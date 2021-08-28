const uWebSockets = require('uWebSockets.js');
const operators = require('../shared/operators.js');
const Request = require('./http/Request.js');
const Response = require('./http/Response.js');
const WebsocketRoute = require('./ws/WebsocketRoute.js');

class Server {
    #uws_instance = null;
    #listen_socket = null;
    #session_engine = null;
    #middlewares = [];
    #handlers = {
        on_not_found: null,
        on_error: (req, res, error) => {
            res.status(500).send('HyperExpress: Uncaught Exception Occured');
            throw error;
        },
    };

    constructor(options = {}) {
        // Only accept object as a parameter type for options
        if (typeof options !== 'object')
            throw new Error(
                'HyperExpress: HyperExpress.Server constructor only accepts an object type for the options parameter.'
            );

        // Create underlying uWebsockets App or SSLApp to power HyperExpress
        const { cert_file_name, key_file_name, passphrase } = options;
        if (cert_file_name && key_file_name && passphrase) {
            this.#uws_instance = uWebSockets.SSLApp(options);
        } else {
            this.#uws_instance = uWebSockets.App(options);
        }
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
        this.#middlewares.push(handler);
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
     * @param {Request} request - Request Object
     * @param {Response} response - Response Object
     * @param {Function} final - Callback/Chain completion handler
     */
    _chain_middlewares(request, response, final, cursor = 0) {
        // Break chain if request has been aborted
        if (response.aborted) return;

        // Determine current middleware and execute
        let current = this.#middlewares[cursor];
        if (current)
            return current(request, response, () =>
                this._chain_middlewares(request, response, final, cursor + 1)
            );

        return final();
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

        // Pre-parse path parameters key and bind a middleman uWebsockets route for wrapping request/response objects
        let path_parameters_key = operators.parse_path_params(pattern);
        let route_options = options_type == 'object' ? options : {};
        let route = this.#uws_instance[method](pattern, (response, request) =>
            this._handle_wrapped_request(
                request,
                response,
                null,
                handler,
                path_parameters_key,
                this,
                route_options
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
    _pre_parse_body(wrapped_request, options) {
        // Do not pre-parse if options.pre_parse_body is turned off
        if (options.pre_parse_body === false) return false;

        // Determine a content-length and content-type header exists to trigger pre-parsing
        let has_content_type = wrapped_request.headers['content-type'];
        let content_length = +wrapped_request.headers['content-length'];
        return has_content_type && !isNaN(content_length) && content_length > 0;
    }

    /**
     * INTERNAL METHOD! This method is an internal method and should NOT be called manually.
     * This method is used as a middleman wrapper for request/response objects to bind HyperExpress abstractions.
     *
     * @param {Request} request
     * @param {Response} response
     * @param {UWS_SOCKET} socket
     * @param {Function} handler
     * @param {Array} path_params_key
     * @param {Server} master_context
     */
    async _handle_wrapped_request(
        request,
        response,
        socket,
        handler,
        path_params_key,
        master_context,
        options = {}
    ) {
        // Wrap uWS.Request -> Request
        let wrapped_request = new Request(
            request,
            response,
            path_params_key,
            master_context.session_engine
        );

        // Wrap uWS.Response -> Response
        let wrapped_response = new Response(wrapped_request, response, socket, this);

        // Pre-Parse body into a buffer as uWS.Request is deallocated after first synchronous execution
        if (this._pre_parse_body(wrapped_request, options))
            try {
                await wrapped_request.buffer();
            } catch (error) {
                return master_context.error_handler(wrapped_request, wrapped_response, error);
            }

        // Check to ensure some middlewares have been bound
        if (master_context.#middlewares.length > 0) {
            // Chain through middlewares and trigger user request handler as callback
            master_context._chain_middlewares(wrapped_request, wrapped_response, () =>
                master_context._trigger_request_handler(
                    master_context,
                    wrapped_request,
                    wrapped_response,
                    handler
                )
            );
        } else {
            // Trigger request handler directly to save on additional anonymous method initialization
            master_context._trigger_request_handler(
                master_context,
                wrapped_request,
                wrapped_response,
                handler
            );
        }
    }

    /**
     * INTERNAL METHOD! This method is an internal method and should NOT be called manually.
     * Triggers user specified route handler.
     *
     * @param {Server} master_context
     * @param {Request} wrapped_request
     * @param {Response} wrapped_response
     * @param {Function} route_handler
     * @returns {Promise} Promise
     */
    _trigger_request_handler(master_context, wrapped_request, wrapped_response, route_handler) {
        // Check to ensure request has not been aborted
        if (!wrapped_response.aborted)
            return new Promise((resolve, reject) => {
                try {
                    resolve(route_handler(wrapped_request, wrapped_response));
                } catch (error) {
                    reject(error);
                }
            }).catch((error) =>
                master_context.error_handler(wrapped_request, wrapped_response, error)
            );
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
}

module.exports = Server;
