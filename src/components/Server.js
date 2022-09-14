'use strict';
const uWebSockets = require('uWebSockets.js');

const Route = require('./router/Route.js');
const Router = require('./router/Router.js');
const Request = require('./http/Request.js');
const Response = require('./http/Response.js');
const HostManager = require('./plugins/HostManager.js');
const WebsocketRoute = require('./ws/WebsocketRoute.js');

const { wrap_object } = require('../shared/operators.js');

class Server extends Router {
    #port;
    #hosts;
    #uws_instance;
    #listen_socket;
    #options = {
        is_ssl: false,
        auto_close: true,
        fast_abort: false,
        trust_proxy: false,
        fast_buffers: false,
        max_body_length: 250 * 1000,
        streaming: {},
    };

    /**
     * Server instance options.
     * @returns {Object}
     */
    _options = null;

    /**
     * @param {Object} options Server Options
     * @param {String=} options.cert_file_name Path to SSL certificate file to be used for SSL/TLS.
     * @param {String=} options.key_file_name Path to SSL private key file to be used for SSL/TLS.
     * @param {String=} options.passphrase Strong passphrase for SSL cryptographic purposes.
     * @param {String=} options.dh_params_file_name Path to SSL Diffie-Hellman parameters file.
     * @param {Boolean=} options.ssl_prefer_low_memory_usage Specifies uWebsockets to prefer lower memory usage while serving SSL
     * @param {Boolean=} options.fast_buffers Buffer.allocUnsafe is used when set to true for faster performance.
     * @param {Boolean=} options.fast_abort Determines whether HyperExpress will abrubptly close bad requests. This can be much faster but the client does not receive an HTTP status code as it is a premature connection closure.
     * @param {Boolean=} options.trust_proxy Specifies whether to trust incoming request data from intermediate proxy(s)
     * @param {Number=} options.max_body_length Maximum body content length allowed in bytes. For Reference: 1kb = 1000 bytes and 1mb = 1000kb.
     * @param {Boolean=} options.auto_close Whether to automatically close the server instance when the process exits. Default: true
     * @param {Object} options.streaming Global content streaming options.
     * @param {import('stream').ReadableOptions=} options.streaming.readable Global content streaming options for Readable streams.
     * @param {import('stream').WritableOptions=} options.streaming.writable Global content streaming options for Writable streams.
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

        // Expose the options object for future use
        this._options = options;

        try {
            // Create underlying uWebsockets App or SSLApp to power HyperExpress
            const { cert_file_name, key_file_name } = options;
            this.#options.is_ssl = cert_file_name && key_file_name; // cert and key are required for SSL
            if (this.#options.is_ssl) {
                this.#uws_instance = uWebSockets.SSLApp(options);
            } else {
                this.#uws_instance = uWebSockets.App(options);
            }
        } catch (error) {
            // Throw error if uWebsockets.js fails to initialize
            throw new Error(
                `new HyperExpress.Server(): Failed to create new Server instance due to invalid SSL configuration. Please ensure you have entered the correct SSL paths and parameters. uWebsockets.js: ${error}`
            );
        }

        // Initialize the HostManager for this Server instance
        this.#hosts = new HostManager(this);
    }

    /**
     * This object can be used to store properties/references local to this Server instance.
     */
    locals = {};

    /**
     * @private
     * This method binds a cleanup handler which automatically closes this Server instance.
     */
    _bind_auto_close() {
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
                // Compile the Server instance
                reference._compile();

                // Determine if we received a listen socket
                if (listen_socket) {
                    // Store the listen socket for future closure & bind the auto close handler if enabled from constructor options
                    reference.#listen_socket = listen_socket;
                    if (reference.#options.auto_close) reference._bind_auto_close();
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
     * @param {uWebSockets.us_listen_socket=} listen_socket Optional
     * @returns {Boolean}
     */
    close(listen_socket) {
        // Fall back to self listen socket if none provided by user
        const socket = listen_socket || this.#listen_socket;
        if (socket) {
            // Close the determined socket
            uWebSockets.us_listen_socket_close(socket);

            // Nullify the local socket reference if it was used
            if (!listen_socket) this.#listen_socket = null;

            return true;
        }
        return false;
    }

    #routes_locked = false;
    #handlers = {
        on_not_found: null,
        on_error: (request, response, error) => {
            // Log the error to the console
            console.error(error);

            // Throw on default if user has not bound an error handler
            return response.status(500).send('HyperExpress: Uncaught Exception Occured');
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
        if (typeof handler !== 'function') throw new Error('HyperExpress: handler must be a function');
        this.#handlers.on_error = handler;
    }

    /**
     * @typedef RouteHandler
     * @type {function(Request, Response):void}
     */

    /**
     * Sets a global not found handler which will handle all requests that are unhandled by any registered route.
     *
     * @param {RouteHandler} handler
     */
    set_not_found_handler(handler) {
        if (typeof handler !== 'function') throw new Error('HyperExpress: handler must be a function');
        this.#handlers.on_not_found = handler;
    }

    /**
     * Publish a message to a topic in MQTT syntax to all WebSocket connections on this Server instance.
     * You cannot publish using wildcards, only fully specified topics.
     *
     * @param {String} topic
     * @param {String|Buffer|ArrayBuffer} message
     * @param {Boolean=} is_binary
     * @param {Boolean=} compress
     * @returns {Boolean}
     */
    publish(topic, message, is_binary, compress) {
        return this.#uws_instance.publish(topic, message, is_binary, compress);
    }

    /**
     * Returns the number of subscribers to a topic across all WebSocket connections on this Server instance.
     *
     * @param {String} topic
     * @returns {Number}
     */
    num_of_subscribers(topic) {
        return this.#uws_instance.numSubscribers(topic);
    }

    /* Server Routes & Middlewares Logic */

    #middlewares = {
        '/': [], // This will contain global middlewares
    };

    #routes = {
        any: {},
        get: {},
        post: {},
        del: {},
        head: {},
        options: {},
        patch: {},
        put: {},
        trace: {},
        upgrade: {},
        ws: {},
    };

    #incremented_id = 0;

    /**
     * Returns an incremented ID unique to this Server instance.
     *
     * @private
     * @returns {Number}
     */
    _get_incremented_id() {
        return this.#incremented_id++;
    }

    /**
     * Binds route to uWS server instance and begins handling incoming requests.
     *
     * @private
     * @param {Object} record { method, pattern, options, handler }
     */
    _create_route(record) {
        // Destructure record into route options
        const { method, pattern, options, handler } = record;

        // Do not allow route creation once it is locked after a not found handler has been bound
        if (this.#routes_locked === true)
            throw new Error(
                `HyperExpress: Routes/Routers must not be created or used after the Server.listen() has been called. [${method.toUpperCase()} ${pattern}]`
            );

        // Do not allow duplicate routes for performance/stability reasons
        // We make an exception for 'upgrade' routes as they must replace the default route added by WebsocketRoute
        if (method !== 'upgrade' && this.#routes[method][pattern])
            throw new Error(
                `HyperExpress: Failed to create route as duplicate routes are not allowed. Ensure that you do not have any routers or routes that try to handle requests at the same pattern. [${method.toUpperCase()} ${pattern}]`
            );

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
                if (companion) companion._set_upgrade_route(route);
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
        const { pattern, middleware } = record;

        // Do not allow route creation once it is locked after a not found handler has been bound
        if (this.#routes_locked === true)
            throw new Error(
                `HyperExpress: Routes/Routers must not be created or used after the Server.listen() has been called. [${method.toUpperCase()} ${pattern}]`
            );

        // Initialize middlewares array for specified pattern
        if (this.#middlewares[pattern] == undefined) this.#middlewares[pattern] = [];

        // Create a middleware object with an appropriate priority
        const object = {
            id: this._get_incremented_id(),
            pattern,
            handler: middleware,
        };

        // Store middleware object in its pattern branch
        this.#middlewares[pattern].push(object);
    }

    /**
     * Compiles the route and middleware structures for this instance for use in the uWS server.
     * Note! This method will lock any future creation of routes or middlewares.
     * @private
     */
    _compile() {
        // Bind the not found handler as a catchall route
        if (this.#handlers.on_not_found)
            this.any('/*', (request, response) => this.#handlers.on_not_found(request, response));

        // Iterate through all routes
        Object.keys(this.#routes).forEach((method) =>
            Object.keys(this.#routes[method]).forEach((pattern) => this.#routes[method][pattern].compile())
        );

        // Lock routes from further creation
        this.#routes_locked = true;
    }

    /* uWS -> Server Request/Response Handling Logic */

    /**
     * This method is used to handle incoming requests from uWS and pass them to the appropriate route through the HyperExpress request lifecycle.
     *
     * @private
     * @param {Route} route
     * @param {uWebSockets.HttpRequest} uws_request
     * @param {uWebSockets.HttpResponse} uws_response
     * @param {uWebSockets.us_socket_context_t=} socket
     */
    _handle_uws_request(route, uws_request, uws_response, socket) {
        // Wrap uWS.Request -> HyperExpress.Request
        const request = new Request(route, uws_request, uws_response);

        // Wrap uWS.Response -> HyperExpress.Response
        const response = new Response(route, request, uws_response, socket);

        // Stream any incoming request body data with configured limit
        // Use the route-specific max body length if it is set else use the global max body length
        if (request._stream_with_limit(response, route.max_body_length)) {
            // Handle the request with its associated route
            route.handle(request, response, 0);
        }
    }

    /* Safe Server Getters */

    /**
     * Returns the local server listening port of the server instance.
     * @returns {Number}
     */
    get port() {
        // Initialize port if it does not exist yet
        // Ensure there is a listening socket before returning port
        if (this.#port === undefined) {
            // Throw error if listening socket does not exist
            if (!this.#listen_socket)
                throw new Error(
                    'HyperExpress: Server.port is not available as the server is not listening. Please ensure you called already Server.listen() OR have not yet called Server.close() when accessing this property.'
                );

            // Cache the resolved port
            this.#port = uWebSockets.us_socket_local_port(this.#listen_socket);
        }

        // Return port
        return this.#port;
    }

    /**
     * Returns the server's internal uWS listening socket.
     * @returns {uWebSockets.us_listen_socket=}
     */
    get socket() {
        return this.#listen_socket;
    }

    /**
     * Underlying uWS instance.
     * @returns {uWebSockets.TemplatedApp}
     */
    get uws_instance() {
        return this.#uws_instance;
    }

    /**
     * Returns the Server Hostnames manager for this instance.
     * Use this to support multiple hostnames on the same server with different SSL configurations.
     * @returns {HostManager}
     */
    get hosts() {
        return this.#hosts;
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
