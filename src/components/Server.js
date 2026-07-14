'use strict';
const path = require('path');
const fs = require('fs/promises');
const uWebSockets = require('uWebSockets.js');

const Route = require('./router/Route.js');
const Router = require('./router/Router.js');
const Request = require('./http/Request.js');
const Response = require('./http/Response.js');
const HostManager = require('./plugins/HostManager.js');
const WebsocketRoute = require('./ws/WebsocketRoute.js');

const { wrap_object, to_forward_slashes } = require('../shared/operators.js');

class Server extends Router {
    #port;
    #hosts;
    #uws_instance;
    #listen_socket;
    #options = {
        is_ssl: false,
        auto_close: true,
        exclusive_port: false,
        fast_abort: false,
        trust_proxy: false,
        fast_buffers: false,
        max_body_buffer: 16 * 1024,
        max_body_length: 250 * 1024,
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
     * @param {Boolean=} options.ssl_prefer_low_memory_usage Specifies uWebSockets to prefer lower memory usage while serving SSL.
     * @param {Boolean=} options.fast_buffers Buffer.allocUnsafe is used when set to true for faster performance.
     * @param {Boolean=} options.fast_abort Determines whether HyperExpress will abrubptly close bad requests. This can be much faster but the client does not receive an HTTP status code as it is a premature connection closure.
     * @param {Boolean=} options.trust_proxy Specifies whether to trust incoming request data from intermediate proxy(s)
     * @param {Number=} options.max_body_buffer Maximum body content to buffer in memory before a request data is handled. Behaves similar to `highWaterMark` in Node.js streams.
     * @param {Number=} options.max_body_length Maximum body content length allowed in bytes. For Reference: 1kb = 1024 bytes and 1mb = 1024kb.
     * @param {Boolean=} options.auto_close Whether to automatically close the server instance when the process exits. Default: true
     * @param {Boolean=} options.exclusive_port Whether to exclusively bind the listening port. Default: false
     * @param {Object} options.streaming Global content streaming options.
     * @param {import('stream').ReadableOptions=} options.streaming.readable Global content streaming options for Readable streams.
     * @param {import('stream').WritableOptions=} options.streaming.writable Global content streaming options for Writable streams.
     */
    constructor(options = {}) {
        if (options == null || typeof options !== 'object')
            throw new Error(
                'HyperExpress: HyperExpress.Server constructor only accepts an object type for the options parameter.'
            );

        super();
        super._is_app(true);

        // Merge user options into defaults and expose them to request lifecycle components
        wrap_object(this.#options, options);
        this._options = this.#options;
        try {
            const { cert_file_name, key_file_name } = options;
            this.#options.is_ssl = cert_file_name && key_file_name; // cert and key are required for SSL
            if (this.#options.is_ssl) {
                // uWS expects normalized absolute paths for TLS certificate files
                this.#options.cert_file_name = to_forward_slashes(path.resolve(cert_file_name));
                this.#options.key_file_name = to_forward_slashes(path.resolve(key_file_name));

                this.#uws_instance = uWebSockets.SSLApp(this.#options);
            } else {
                this.#uws_instance = uWebSockets.App(this.#options);
            }
        } catch (error) {
            // Format the provided options for the initialization error
            const option_strings = [];
            const option_keys = Object.keys(options);
            for (let index = 0; index < option_keys.length; index++) {
                const option_key = option_keys[index];
                const option_value = options[option_key];
                option_strings.push(`options.${option_key}: "${option_value}"`);
            }
            const _options = option_strings.join('\n');

            throw new Error(
                `new HyperExpress.Server(): Failed to create new Server instance due to an invalid configuration in options.\n${_options}`
            );
        }

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
        const exit_events = ['exit', 'SIGINT', 'SIGUSR1', 'SIGUSR2', 'SIGTERM'];
        for (const event_type of exit_events) {
            process.once(event_type, () => reference.close());
        }
    }

    /**
     * Starts HyperExpress webserver on specified port and host, or unix domain socket.
     *
     * @param {Number|String} first Required. Port or unix domain socket path to listen on. Example: 80 or "/run/listener.sock"
     * @param {(String|function(import('uWebSockets.js').listen_socket):void)=} second Optional. Host or callback to be called when the server is listening. Default: "0.0.0.0"
     * @param {(function(import('uWebSockets.js').us_listen_socket):void)=} third Optional. Callback to be called when the server is listening.
     * @returns {Promise<import('uWebSockets.js').us_listen_socket>} Promise which resolves to the listen socket when the server is listening.
     */
    async listen(first, second, third) {
        let port;
        let path;

        // Parse the overloaded port or UNIX socket argument
        if (typeof first == 'number' || (+first > 0 && +first < 65536)) {
            port = typeof first == 'string' ? +first : first;
        } else if (typeof first == 'string') {
            path = first;
        }

        let host = '0.0.0.0';
        let callback;
        if (second) {
            // The second argument can be either a callback or a host followed by a callback
            if (typeof second === 'function') {
                callback = second;
            } else {
                if (typeof second == 'string') {
                    host = second;
                } else {
                    throw new Error(
                        `HyperExpress.Server.listen(): The second argument must either be a callback function or a string as a hostname.`
                    );
                }

                if (third && typeof third === 'function') callback = third;
            }
        }

        // Fail before listening if either configured TLS file is unreadable
        if (this.#options.is_ssl) {
            const { cert_file_name, key_file_name } = this.#options;
            try {
                await Promise.all([fs.access(key_file_name), fs.access(cert_file_name)]);
            } catch (error) {
                throw new Error(
                    `HyperExpress.Server.listen(): The provided SSL certificate file at "${cert_file_name}" or private key file at "${key_file_name}" does not exist or is not readable.\n${error}`
                );
            }
        }

        // Bind with the uWS API matching the parsed TCP or UNIX socket target
        const reference = this;
        return await new Promise((resolve, reject) => {
            const on_listen_socket = (listen_socket) => {
                // Freeze and compile routing structures before accepting requests
                reference._compile();

                if (listen_socket) {
                    reference.#listen_socket = listen_socket;

                    if (reference.#options.auto_close) reference._bind_auto_close();

                    if (callback) callback(listen_socket);

                    resolve(listen_socket);
                } else {
                    reject(
                        'HyperExpress.Server.listen(): No Socket Received From uWebsockets.js likely due to an invalid host or busy port.'
                    );
                }
            };

            if (port !== undefined) {
                if (reference.#options.exclusive_port) {
                    // uWebSockets.js only supports listen options without a custom host
                    if (host !== '0.0.0.0')
                        return reject(
                            'HyperExpress.Server.listen(): A custom host cannot be used with the exclusive_port option.'
                        );

                    reference.#uws_instance.listen(
                        port,
                        uWebSockets.LIBUS_LISTEN_EXCLUSIVE_PORT,
                        on_listen_socket
                    );
                } else {
                    reference.#uws_instance.listen(host, port, on_listen_socket);
                }
            } else {
                reference.#uws_instance.listen_unix(on_listen_socket, path);
            }
        });
    }

    #shutdown_promise;
    /**
     * Performs a graceful shutdown of the server and closes the listen socket once all pending requests have been completed.
     * @param {uWebSockets.us_listen_socket=} listen_socket Optional
     * @returns {Promise<boolean>}
     */
    shutdown(listen_socket) {
        // If we already have a shutdown promise in flight, return it
        if (this.#shutdown_promise) return this.#shutdown_promise;

        // If we have no pending requests, we can shutdown immediately
        if (!this.#pending_requests_count) return Promise.resolve(this.close(listen_socket));

        // Defer closure until the final active request completes
        const scope = this;
        this.#shutdown_promise = new Promise((resolve) => {
            scope.#pending_requests_zero_handler = () => {
                resolve(scope.close(listen_socket));
            };
        });

        return this.#shutdown_promise;
    }

    /**
     * Stops/Closes HyperExpress webserver instance.
     *
     * @param {uWebSockets.us_listen_socket=} listen_socket Optional
     * @returns {Boolean}
     */
    close(listen_socket) {
        const socket = listen_socket || this.#listen_socket;
        if (socket) {
            uWebSockets.us_listen_socket_close(socket);

            // Preserve externally supplied socket ownership
            if (!listen_socket) this.#listen_socket = null;

            return true;
        }
        return false;
    }

    #routes_locked = false;
    #handlers = {
        on_not_found: (request, response) => response.status(404).send(),
        on_error: (request, response, error) => {
            console.error(error);
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
                `HyperExpress: Failed to create route as duplicate routes are not allowed. Ensure that you do not have any routers or routes that try to handle requests with the same pattern. [${method.toUpperCase()} ${pattern}]`
            );

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

                // Replace the temporary upgrade route while retaining its companion WebSocket route
                this.#routes[method][pattern] = route;

                const companion = this.#routes['ws'][pattern];
                if (companion) companion._set_upgrade_route(route);
                break;
            default:
                this.#routes[method][pattern] = route;

                // Bridge the native uWS callback into the HyperExpress request lifecycle
                return this.#uws_instance[method](pattern, (response, request) => {
                    this._handle_uws_request(route, request, response, null);
                });
        }
    }

    /**
     * Binds middleware to server instance and distributes over all created routes.
     *
     * @private
     * @param {Object} record
     */
    _create_middleware(record) {
        const { pattern, middleware } = record;

        // Do not allow middleware creation after routing structures have been compiled
        if (this.#routes_locked === true)
            throw new Error(
                `HyperExpress: Routes/Routers must not be created or used after the Server.listen() has been called. [${method.toUpperCase()} ${pattern}]`
            );

        if (this.#middlewares[pattern] == undefined) this.#middlewares[pattern] = [];

        // The shared ID preserves registration order across routes and middleware
        const object = {
            id: this._get_incremented_id(),
            pattern,
            handler: middleware,
        };

        this.#middlewares[pattern].push(object);
    }

    /**
     * Compiles the route and middleware structures for this instance for use in the uWS server.
     * Note! This method will lock any future creation of routes or middlewares.
     * @private
     */
    _compile() {
        // Bind the not found handler as a catchall route if the user did not already bind a global ANY catchall route
        if (this.#handlers.on_not_found) {
            const exists = this.#routes.any['/*'] !== undefined;
            if (!exists) this.any('/*', (request, response) => this.#handlers.on_not_found(request, response));
        }

        // Compile every registered route grouped by HTTP method and pattern
        const route_methods = Object.keys(this.#routes);
        for (let method_index = 0; method_index < route_methods.length; method_index++) {
            const route_method = route_methods[method_index];
            const routes = this.#routes[route_method];
            const route_patterns = Object.keys(routes);
            for (let pattern_index = 0; pattern_index < route_patterns.length; pattern_index++) {
                const route_pattern = route_patterns[pattern_index];
                const route = routes[route_pattern];
                route.compile();
            }
        }

        // Lock routes from further creation
        this.#routes_locked = true;
    }

    /* uWS -> Server Request/Response Handling Logic */

    #pending_requests_count = 0;
    #pending_requests_zero_handler = null;

    /**
     * Resolves a single pending request and ticks sthe pending request handler if one exists.
     */
    _resolve_pending_request() {
        if (this.#pending_requests_count > 0) {
            this.#pending_requests_count--;

            // Resolve graceful shutdown after the final active request completes
            if (this.#pending_requests_count === 0 && this.#pending_requests_zero_handler)
                this.#pending_requests_zero_handler();
        }
    }

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
        const request = new Request(route, uws_request);
        request._raw_response = uws_response;

        const response = new Response(uws_response);
        response.route = route;
        response._wrapped_request = request;
        response._upgrade_socket = socket || null;

        // If we are in the process of gracefully shutting down, we must immediately close the request
        if (this.#pending_requests_zero_handler) return response.close();

        this.#pending_requests_count++;

        // Enter the route lifecycle only when body parsing remains within its configured limit
        if (request._body_parser_run(response, route.max_body_length)) {
            route.handle(request, response);

            // Defer future writes through cork when handling continues asynchronously
            if (!response.completed) response._cork = true;
        }
    }

    /* Safe Server Getters */

    /**
     * Returns the local server listening port of the server instance.
     * @returns {Number}
     */
    get port() {
        // Resolve and cache the bound port from the active listen socket
        if (this.#port === undefined) {
            if (!this.#listen_socket)
                throw new Error(
                    'HyperExpress: Server.port is not available as the server is not listening. Please ensure you called already Server.listen() OR have not yet called Server.close() when accessing this property.'
                );

            this.#port = uWebSockets.us_socket_local_port(this.#listen_socket);
        }

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
