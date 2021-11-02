const uWebSockets = require('uWebSockets.js');
const Request = require('./http/Request.js');
const Response = require('./http/Response.js');
const Router = require('./router/Router.js');
const Route = require('./router/Route.js');
const WebsocketRoute = require('./ws/WebsocketRoute.js');

const { wrap_object } = require('../shared/operators.js');

class Server extends Router {
    #uws_instance;
    #listen_socket;
    #options = {
        trust_proxy: false,
        unsafe_buffers: false,
        fast_abort: false,
        is_ssl: false,
        max_body_length: 250 * 1000,
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
    constructor(options = {}) {
        // Only accept object as a parameter type for options
        if (options == null || typeof options !== 'object')
            throw new Error(
                'HyperExpress: HyperExpress.Server constructor only accepts an object type for the options parameter.'
            );

        // Initialize extended Router instance
        super();

        // Store options locally for access throughout processing
        wrap_object(this.#options, options);

        // Create underlying uWebsockets App or SSLApp to power HyperExpress
        const { cert_file_name, key_file_name } = options;
        this.#options.is_ssl = cert_file_name && key_file_name; // cert and key are required for SSL
        if (this.#options.is_ssl) {
            this.#uws_instance = uWebSockets.SSLApp(options);
        } else {
            this.#uws_instance = uWebSockets.App(options);
        }
    }

    /**
     * @private
     * This method binds a cleanup handler which closes the uWS server based on listen socket.
     */
    _bind_exit_handler() {
        const reference = this;
        ['exit', 'SIGINT', 'SIGUSR1', 'SIGUSR2', 'SIGTERM'].forEach((type) =>
            process.once(type, () => reference.close())
        );
    }

    /**
     * Starts HyperExpress webserver on specified port and host.
     *
     * @param {Number} port
     * @param {String=} host Optional. Default: 0.0.0.0
     * @returns {Promise} Promise
     */
    listen(port, host = '0.0.0.0') {
        const reference = this;
        return new Promise((resolve, reject) =>
            reference.#uws_instance.listen(host, port, (listen_socket) => {
                if (listen_socket) {
                    reference.#listen_socket = listen_socket;
                    reference._bind_exit_handler();
                    resolve(listen_socket);
                } else {
                    reject('No Socket Received From uWebsockets.js');
                }
            })
        );
    }

    /**
     * Stops/Closes HyperExpress webserver instance.
     *
     * @param {uWebSockets.us_listen_socket} [listen_socket] Optional
     * @returns {Boolean}
     */
    close(listen_socket) {
        // Fall back to self listen socket if none provided by user
        const socket = listen_socket || this.#listen_socket;
        if (socket) {
            // Close the listen socket from uWebsockets and nullify the reference
            uWebSockets.us_listen_socket_close(socket);
            this.#listen_socket = null;
            return true;
        }
        return false;
    }

    #routes_locked = false;
    #handlers = {
        on_not_found: null,
        on_error: (request, response, error) => {
            // Throw on default if user has not bound an error handler
            response.status(500).send('HyperExpress: Uncaught Exception Occured');
            throw error;
        },
    };

    /**
     * @typedef RouteErrorHandler
     * @type {function(Request, Response, Error):void}
     */

    /**
     * Sets a global error handler which will catch most uncaught errors across all routes/middlewares.
     *
     * @param {RouteErrorHandler} handler
     */
    set_error_handler(handler) {
        if (typeof handler !== 'function')
            throw new Error('HyperExpress: handler must be a function');
        this.#handlers.on_error = handler;
    }

    /**
     * @typedef RouteHandler
     * @type {function(Request, Response):void}
     */

    /**
     * Sets a global not found handler which will handle all requests that are unhandled by any registered route.
     * Note! This handler must be registered after all routes and routers.
     *
     * @param {RouteHandler} handler
     */
    set_not_found_handler(handler) {
        if (typeof handler !== 'function')
            throw new Error('HyperExpress: handler must be a function');

        // Store not_found handler and bind it as a catchall route
        if (this.#handlers.on_not_found === null) {
            this.#handlers.on_not_found = handler;
            return setTimeout(
                (reference) => {
                    reference.any('/*', (request, response) =>
                        reference.#handlers.on_not_found(request, response)
                    );
                    reference.#routes_locked = true;
                },
                0,
                this
            );
        }

        // Do not allow user to re-register not found handler
        throw new Error('HyperExpress: A Not Found handler has already been registered.');
    }

    /* Server Routes & Middlewares Logic */

    #middlewares = {
        '/': [], // This will contain global middlewares
    };

    #routes = {
        any: {},
        get: {},
        post: {},
        delete: {},
        head: {},
        options: {},
        patch: {},
        put: {},
        trace: {},
        upgrade: {},
        ws: {},
    };

    /**
     * Binds route to uWS server instance and begins handling incoming requests.
     *
     * @private
     * @param {Object} record { method, pattern, options, handler }
     */
    _create_route(record) {
        // Destructure record into route options
        const reference = this;
        const { method, pattern, options, handler } = record;

        // Do not allow route creation once it is locked after a not found handler has been bound
        if (this.#routes_locked === true)
            throw new Error(
                `HyperExpress: Routes/Routers must not be created or used after the set_not_found_handler() has been set due to uWebsockets.js's internal router not allowing for this to occur. [${method.toUpperCase()} ${pattern}]`
            );

        // Do not allow duplicate routes for performance/stability reasons
        // We make an exception for 'upgrade' routes as they must replace the default route added by WebsocketRoute
        if (method !== 'upgrade' && this.#routes[method]?.[pattern])
            throw new Error(
                `HyperExpress: Failed to create route as duplicate routes are not allowed. Ensure that you do not have any routers or routes that try to handle requests at the same pattern. [${method.toUpperCase()} ${pattern}]`
            );

        // Process and combine middlewares for routes that support middlewares
        if (!['ws'].includes(method)) {
            // Initialize route-specific middlewares if they do not exist
            if (!Array.isArray(options.middlewares)) options.middlewares = [];

            // Parse middlewares that apply to this route based on execution pattern
            const middlewares = [];
            Object.keys(this.#middlewares).forEach((match) => {
                // Do not match with global middlewares as they are always executed separately
                if (match == '/') return;

                // Store middleware if its execution pattern matches our route pattern
                if (pattern.startsWith(match))
                    reference.#middlewares[match].forEach((object) => middlewares.push(object));
            });

            // Map all user specified route specific middlewares with a priority of 2
            options.middlewares = options.middlewares.map((middleware) => ({
                priority: 2,
                middleware,
            }));

            // Combine matched middlewares with route middlewares
            options.middlewares = middlewares.concat(options.middlewares);
        }

        // Create a Route object to contain route information through handling process
        const route = new Route({
            app: this,
            method,
            pattern,
            options,
            handler,
        });

        // Mark route as temporary if specified from options
        if (options._temporary === true) route._temporary = true;

        // Handle websocket/upgrade routes separately as they follow a different lifecycle
        switch (method) {
            case 'ws':
                // Create a WebsocketRoute which initializes uWS.ws() route
                this.#routes[method][pattern] = new WebsocketRoute({
                    app: this,
                    pattern,
                    handler,
                    options,
                });
                break;
            case 'upgrade':
                // Throw an error if an upgrade route already exists that was not created by WebsocketRoute
                const current = this.#routes[method][pattern];
                if (current && current._temporary !== true)
                    throw new Error(
                        `HyperExpress: Failed to create upgrade route as an upgrade route with the same pattern already exists and duplicate routes are not allowed. [${method.toUpperCase()} ${pattern}]`
                    );

                // Overwrite the upgrade route that exists from WebsocketRoute with this custom route
                this.#routes[method][pattern] = route;

                // Assign route to companion WebsocketRoute
                const companion = this.#routes['ws'][pattern];
                if (companion) companion._set_companion_route(route);
                break;
            default:
                // Store route in routes object for structural tracking
                this.#routes[method][pattern] = route;

                // Bind uWS.method() route which passes incoming request/respone to our handler
                return this.#uws_instance[method](pattern, (response, request) =>
                    this._handle_uws_request(route, request, response, null)
                );
        }
    }

    /**
     * Binds middleware to server instance and distributes over all created routes.
     *
     * @private
     * @param {Object} record
     */
    _create_middleware(record) {
        // Destructure record from Router
        const reference = this;
        const { pattern, middleware } = record;

        // Initialize middlewares array for specified pattern
        if (this.#middlewares[pattern] == undefined) this.#middlewares[pattern] = [];

        // Create a middleware object with an appropriate priority
        const object = {
            priority: pattern == '/' ? 0 : 1, // 0 priority are global middlewares
            middleware,
        };

        // Store middleware object in its pattern branch
        this.#middlewares[pattern].push(object);

        // Inject middleware into all routes that match its execution pattern if it is non global
        const match = pattern.endsWith('/') ? pattern.substr(0, pattern.length - 1) : pattern;
        if (object.priority !== 0)
            Object.keys(this.#routes).forEach((method) => {
                // Ignore ws routes as they are WebsocketRoute components
                if (method === 'ws') return;

                // Match middleware pattern against all routes with this method
                const routes = reference.#routes[method];
                Object.keys(routes).forEach((pattern) => {
                    // If route's pattern starts with middleware pattern, then use middleware
                    if (pattern.startsWith(match)) routes[pattern].use(object);
                });
            });
    }

    /* uWS -> Server Request/Response Handling Logic */

    /**
     * This method is used to determine if request body should be pre-parsed in anticipation for future call.
     *
     * @private
     * @param {Route} route
     * @param {Request} wrapped_request
     * @returns {Boolean}
     */
    _pre_parse_body(route, wrapped_request) {
        // Return true to pre-parsing if we are expecting a specific type of body
        if (typeof route.options.expect_body == 'string') return true;

        // Determine a content-length and content-type header exists to trigger pre-parsing
        const has_content_type = wrapped_request.headers['content-type'];
        const content_length = +wrapped_request.headers['content-length'];
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
     * @param {uWebSockets.us_socket_context_t} [socket]
     */
    async _handle_uws_request(route, request, response, socket) {
        // Wrap uWS.Request -> Request
        const wrapped_request = new Request(
            request,
            response,
            route.path_parameters_key,
            route.app
        );

        // Wrap uWS.Response -> Response
        const wrapped_response = new Response(wrapped_request, response, socket, route.app);

        // We initiate buffer retrieval as uWS.Request is deallocated after initial synchronous cycle
        if (this._pre_parse_body(route, wrapped_request)) {
            // Check incoming content-length to ensure it is within max_body_length bounds
            // Abort request with a 413 Payload Too Large status code
            if (+wrapped_request.headers['content-length'] > route.app.options.max_body_length) {
                // Use fast abort scheme if specified
                if (route.app.options.fast_abort === true) return response.close();

                // According to uWebsockets developer, we have to drain incoming data before aborting and closing request
                // Prematurely closing request with a 413 leads to an ECONNRESET in which we lose 413 error from server
                return response.onData((_, is_last) => {
                    if (is_last) wrapped_response.status(413).send();
                });
            }

            // If a body type is expected, parse body based on one of the expected types and populate request.body property
            if (typeof route.options.expect_body == 'string') {
                switch (route.options.expect_body) {
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
                    .catch((error) =>
                        route.app.handlers.on_error(wrapped_request, wrapped_response, error)
                    );
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
        }).catch((error) => route.app.handlers.on_error(wrapped_request, wrapped_response, error));
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
        const has_global_middlewares = this.#middlewares['/'].length > 0;
        const has_route_middlewares = route.middlewares.length > 0;
        const next =
            has_global_middlewares || has_route_middlewares
                ? (err) => route.app._chain_middlewares(route, request, response, cursor + 1, err)
                : undefined;

        // Execute global middlewares first as they take precedence over route specific middlewares
        if (has_global_middlewares) {
            // Determine current global middleware and execute
            const object = this.#middlewares['/'][cursor];
            if (object) {
                // If middleware invocation returns a Promise, bind a then handler to trigger next iterator
                response._track_middleware_cursor(cursor);
                const output = object.middleware(request, response, next);
                if (output instanceof Promise) output.then(next);
                return;
            }
        }

        // Execute route specific middlewares if they exist
        if (has_route_middlewares) {
            // Determine current route specific/method middleware and execute while accounting for global middlewares cursor offset
            const object = route.middlewares[cursor - this.#middlewares['/'].length];
            if (object) {
                // If middleware invocation returns a Promise, bind a then handler to trigger next iterator
                response._track_middleware_cursor(cursor);
                const output = object.middleware(request, response, next);
                if (output instanceof Promise) output.then(next);
                return;
            }
        }

        // Trigger user assigned route handler with wrapped request/response objects.
        // Provide socket_context for upgrade requests.
        return route.handler(request, response, response.upgrade_socket);
    }

    /* Safe Server Getters */

    /**
     * Underlying uWS instance.
     * @returns {uWebSockets.us_listen_socket}
     */
    get uws_instance() {
        return this.#uws_instance;
    }

    /**
     * Server instance options.
     * @returns {Object}
     */
    get options() {
        return this.#options;
    }

    /**
     * Server instance global handlers.
     * @returns {Object}
     */
    get handlers() {
        return this.#handlers;
    }

    /**
     * Server instance routes.
     * @returns {Object}
     */
    get routes() {
        return this.#routes;
    }

    /**
     * Server instance middlewares.
     * @returns {Object}
     */
    get middlewares() {
        return this.#middlewares;
    }
}

module.exports = Server;
