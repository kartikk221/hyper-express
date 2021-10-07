const uWebSockets = require('uWebSockets.js');
const Request = require('./http/Request.js');
const Response = require('./http/Response.js');
const Route = require('./http/Route.js');
const WebsocketRoute = require('./ws/WebsocketRoute.js');

class Server {
    #uws_instance = null;
    #listen_socket = null;
    #session_engine = null;
    #trust_proxy = false;
    #unsafe_buffers = false;
    #fast_abort = false;
    #is_ssl = false;
    #max_body_length = 250 * 1000;
    #handlers = {
        on_not_found: null,
        on_error: (req, res, error) => {
            res.status(500).send('HyperExpress: Uncaught Exception Occured');
            throw error;
        },
    };

    #middlewares = [];

    #defaults = {
        cert_file_name: '',
        key_file_name: '',
        passphrase: '',
        dh_params_file_name: '',
        ssl_prefer_low_memory_usage: false,
        fast_buffers: false,
        fast_abort: this.#fast_abort,
        max_body_length: this.#max_body_length,
        trust_proxy: this.#trust_proxy,
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
     * @param {Boolean} options.trust_proxy Specifies whether to trust incoming request data from intermediate proxy(s)
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
        this.#is_ssl = cert_file_name && key_file_name;
        if (this.#is_ssl) {
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
     * @param {socket} listen_socket OPTIONAL
     * @returns {Boolean}
     */
    close(listen_socket) {
        let socket = listen_socket || this.#listen_socket;
        if (socket == null) return false;

        uWebSockets.us_listen_socket_close(socket);
        this.#listen_socket = null;
        return true;
    }

    /**
     * @typedef RouteErrorHandler
     * @type {function(Request, Response, Error):void}
     */

    /**
     * Sets a global error handler which will catch most uncaught errors
     * across all routes created on this server instance.
     *
     * @param {RouteErrorHandler} handler
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
     * @param {RouteHandler} handler
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
     * @typedef MiddlewareHandler
     * @type {function(Request, Response, Function):void}
     */

    /**
     * @typedef PromiseMiddlewareHandler
     * @type {function(Request, Response):Promise}
     */

    /**
     * Adds a global middleware for all incoming requests.
     *
     * @param {MiddlewareHandler|PromiseMiddlewareHandler} handler (request, response, next) => {} OR (request, response) => new Promise((resolve, reject) => {})
     */
    use(handler) {
        if (typeof handler !== 'function')
            throw new Error('HyperExpress: handler must be a function');

        // Register a global middleware
        this.#middlewares.push(handler);
    }

    /**
     * @private
     * This method binds a cleanup handler which closes the underlying uWS socket.
     */
    _bind_exit_handler() {
        let reference = this;
        ['exit', 'SIGINT', 'SIGUSR1', 'SIGUSR2', 'SIGTERM'].forEach((type) =>
            process.once(type, () => reference.close())
        );
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
     * This method is used to create and bind a uWebsockets route with a middleman wrapper
     *
     * @private
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
        const options_type = typeof options;
        if (options_type !== 'object' && options_type !== 'function')
            throw new Error('HyperExpress: Failed to create route as options must be an object.');

        // The options parameter is optional thus if handler is provided in place of options, use options as the handler
        if (typeof options == 'function') handler = options;

        // Parse route options if specified by user
        const route_options = options_type == 'object' ? options : {};

        // Register route specific middlewares
        let middlewares = [];
        if (Array.isArray(route_options.middlewares) && route_options.middlewares.length > 0)
            middlewares = route_options.middlewares;

        // Determine if we are expecting a specific body type
        let expect_body =
            typeof options !== 'function' && typeof options.expect_body == 'string'
                ? options.expect_body.toLowerCase()
                : undefined;

        // Create a Route object to pass along with uws request handler
        const route = new Route({
            app: this,
            method,
            pattern,
            handler,
            middlewares,
            expect_body,
        });

        // Bind uWS.method() route which passes incoming request/respone to our handler
        this.#uws_instance[method](pattern, (response, request) =>
            this._handle_uws_request(route, request, response, null)
        );

        // Store route in routes tree and return route to invocator
        this.#routes[method][pattern] = route;
        return route;
    }

    /**
     * This method is used to determine if request body should be pre-parsed in anticipation for future call.
     *
     * @private
     * @param {Route} route
     * @param {Request} wrapped_request
     * @returns {Boolean} Boolean
     */
    _pre_parse_body(route, wrapped_request) {
        // Return true to pre-parsing if we are expecting a specific type of body
        if (typeof route.expect_body == 'string') return true;

        // Determine a content-length and content-type header exists to trigger pre-parsing
        let has_content_type = wrapped_request.headers['content-type'];
        let content_length = +wrapped_request.headers['content-length'];
        return has_content_type && !isNaN(content_length) && content_length > 0;
    }

    /**
     * This method is used to handle incoming uWebsockets response/request objects
     * by wrapping/translating them into HyperExpress compatible request/response objects.
     *
     * @private
     * @param {Route} route
     * @param {Request} request
     * @param {Response} response
     * @param {UWS_SOCKET} socket
     */
    async _handle_uws_request(route, request, response, socket) {
        // Wrap uWS.Request -> Request
        const wrapped_request = new Request(request, response, route.path_parameters_key, this);

        // Wrap uWS.Response -> Response
        const wrapped_response = new Response(wrapped_request, response, socket, this);

        // We initiate buffer retrieval as uWS.Request is deallocated after initial synchronous cycle
        if (this._pre_parse_body(route, wrapped_request)) {
            // Check incoming content-length to ensure it is within max_body_length bounds
            // Abort request with a 413 Payload Too Large status code
            if (+wrapped_request.headers['content-length'] > this.max_body_length) {
                // Use fast abort scheme if specified
                if (this.fast_abort === true) return response.close();

                // According to uWebsockets developer, we have to drain incoming data before aborting and closing request
                // Prematurely closing request with a 413 leads to an ECONNRESET in which we lose 413 error from server
                return response.onData((_, is_last) => {
                    if (is_last) wrapped_response.status(413).send();
                });
            }

            // If a body type is expected, parse body based on one of the expected types and populate request.body property
            if (typeof route.expect_body == 'string') {
                switch (route.expect_body) {
                    case 'text':
                        wrapped_request._body = await wrapped_request.text();
                        break;
                    case 'json':
                        wrapped_request._body = await wrapped_request.json();
                        break;
                    case 'urlencoded':
                        wrapped_request._body = await wrapped_request.urlencoded();
                        break;
                    default:
                        wrapped_request._body = await wrapped_request.buffer();
                        break;
                }
            } else {
                // Initiate passive body buffer download without holding up the handling flow
                wrapped_request
                    .buffer()
                    .catch((error) => this.error_handler(wrapped_request, wrapped_response, error));
            }
        }

        // Wrap middlewares & route handler in a promise/try/catch to catch async/sync errors
        return new Promise((resolve, reject) => {
            try {
                // Call middleware chaining method and pass handler/socket
                resolve(route.app._chain_middlewares(route, wrapped_request, wrapped_response));
            } catch (error) {
                reject(error);
            }
        }).catch((error) => this.error_handler(wrapped_request, wrapped_response, error));
    }

    /**
     * This method chains a request/response through all middlewares and then calls route handler in end.
     *
     * @private
     * @param {Route} route - Route Object
     * @param {Request} request - Request Object
     * @param {Response} response - Response Object
     * @param {Error} error - Error or Extended Error Object
     */
    _chain_middlewares(route, request, response, cursor = 0, error) {
        // Break chain if response has been aborted
        if (response.aborted) return;

        // Trigger error handler if an error was provided by a middleware
        if (error instanceof Error) return response.throw_error(error);

        // Determine next callback based on if either global or route middlewares exist
        const has_global_middlewares = this.#middlewares.length > 0;
        const has_route_middlewares = route.middlewares.length > 0;
        const next =
            has_global_middlewares || has_route_middlewares
                ? (err) => this._chain_middlewares(route, request, response, cursor + 1, err)
                : undefined;

        // Execute global middlewares first as they take precedence over route specific middlewares
        if (has_global_middlewares) {
            // Determine current global middleware and execute
            const middleware = this.#middlewares[cursor];
            if (middleware) {
                // If middleware invocation returns a Promise, bind a then handler to trigger next iterator
                response._track_middleware_cursor(cursor);
                const output = middleware(request, response, next);
                if (output instanceof Promise) output.then(next);
                return;
            }
        }

        // Execute route specific middlewares if they exist
        if (has_route_middlewares) {
            // Determine current route specific/method middleware and execute while accounting for global middlewares cursor offset
            const middleware = route.middlewares[cursor - this.#middlewares.length];
            if (middleware) {
                // If middleware invocation returns a Promise, bind a then handler to trigger next iterator
                response._track_middleware_cursor(cursor);
                const output = middleware(request, response, next);
                if (output instanceof Promise) output.then(next);
                return;
            }
        }

        // Trigger user assigned route handler with wrapped request/response objects. Provide socket_context for upgrade requests.
        return route.handler(request, response, response.upgrade_socket);
    }

    /* Server Route Alias Methods */

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
     * @param {String} pattern
     * @param {RouteOptions|RouteHandler} options
     * @param {RouteHandler} handler
     */
    any(pattern, options, handler) {
        return this._create_route('any', pattern, options, handler);
    }

    /**
     * @param {String} pattern
     * @param {RouteOptions|RouteHandler} options
     * @param {RouteHandler} handler
     */
    get(pattern, options, handler) {
        return this._create_route('get', pattern, options, handler);
    }

    /**
     * @param {String} pattern
     * @param {RouteOptions|RouteHandler} options
     * @param {RouteHandler} handler
     */
    post(pattern, options, handler) {
        return this._create_route('post', pattern, options, handler);
    }

    /**
     * @param {String} pattern
     * @param {RouteOptions|RouteHandler} options
     * @param {RouteHandler} handler
     */
    delete(pattern, options, handler) {
        return this._create_route('del', pattern, options, handler);
    }

    /**
     * @param {String} pattern
     * @param {RouteOptions|RouteHandler} options
     * @param {RouteHandler} handler
     */
    head(pattern, options, handler) {
        return this._create_route('head', pattern, options, handler);
    }

    /**
     * @param {String} pattern
     * @param {RouteOptions|RouteHandler} options
     * @param {RouteHandler} handler
     */
    options(pattern, options, handler) {
        return this._create_route('options', pattern, options, handler);
    }

    /**
     * @param {String} pattern
     * @param {RouteOptions|RouteHandler} options
     * @param {RouteHandler} handler
     */
    patch(pattern, options, handler) {
        return this._create_route('patch', pattern, options, handler);
    }

    /**
     * @param {String} pattern
     * @param {RouteOptions|RouteHandler} options
     * @param {RouteHandler} handler
     */
    trace(pattern, options, handler) {
        return this._create_route('trace', pattern, options, handler);
    }

    /**
     * @param {String} pattern
     * @param {RouteOptions|RouteHandler} options
     * @param {RouteHandler} handler
     */
    connect(pattern, options, handler) {
        return this._create_route('connect', pattern, options, handler);
    }

    /**
     * @param {String} pattern Route pattern on which websocket connections can connect
     * @param {Object} options Websocket route options.
     * @param {String} options.messageType Specifies the data type in which incoming messages should be provided. Specify one of ['String', 'Buffer', 'ArrayBuffer'].
     * @param {Object} options.compression Specifies permessage-deflate compression to use. Use one of require('hyper-express').compressors presets. Default: compressors.DISABLED
     * @param {Number} options.idleTimeout Specifies interval to automatically timeout/close idle websocket connection in seconds. Default: 32
     * @param {Number} options.maxBackPressure Specifies maximum websocket backpressure allowed in character length. Default: (1024 * 1024)
     * @param {Number} options.maxPayloadLength Specifies maximum length allowed on incoming messages. Default: 32768 (1024 * 32)
     * @returns {WebsocketRoute} Websocket route object.
     */
    ws(pattern, options = {}) {
        // Do not allow duplicate routes for performance/stability reasons
        const method = 'ws';
        if (this.#routes[method]?.[pattern])
            throw new Error(
                `HyperExpress: Failed to create ${method} @ ${pattern} as duplicate routes are not allowed.`
            );

        // Enforce object type on provided options
        if (options == null || typeof options !== 'object')
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

    /**
     * Returns whether HyperExpress is running on SSL scheme or not.
     */
    get is_ssl() {
        return this.#is_ssl;
    }

    /**
     * Returns whether incoming request data from intermediate proxy(s) is trusted.
     */
    get trust_proxy() {
        return this.#trust_proxy;
    }
}

module.exports = Server;
