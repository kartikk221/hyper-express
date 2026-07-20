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

const BOOLEAN_OPTIONS = [
    'auto_close',
    'exclusive_port',
    'fast_abort',
    'strict_middleware',
    'trust_proxy',
    'fast_buffers',
    'ssl_prefer_low_memory_usage',
];
const STRING_OPTIONS = [
    'cert_file_name',
    'key_file_name',
    'passphrase',
    'dh_params_file_name',
    'ca_file_name',
    'ssl_ciphers',
];

function validate_server_options(options) {
    for (const name of BOOLEAN_OPTIONS) {
        if (
            Object.prototype.hasOwnProperty.call(options, name) &&
            typeof options[name] !== 'boolean'
        )
            throw new TypeError(`HyperExpress.Server option ${name} must be a boolean.`);
    }

    for (const name of ['max_body_buffer', 'max_body_length']) {
        if (
            Object.prototype.hasOwnProperty.call(options, name) &&
            (!Number.isSafeInteger(options[name]) || options[name] < 0)
        )
            throw new RangeError(
                `HyperExpress.Server option ${name} must be a non-negative safe integer.`
            );
    }

    for (const name of STRING_OPTIONS) {
        if (
            Object.prototype.hasOwnProperty.call(options, name) &&
            (typeof options[name] !== 'string' || options[name].includes('\0'))
        )
            throw new TypeError(
                `HyperExpress.Server option ${name} must be a string without null bytes.`
            );
    }

    if (
        Object.prototype.hasOwnProperty.call(options, 'streaming') &&
        (options.streaming === null ||
            typeof options.streaming !== 'object' ||
            Array.isArray(options.streaming))
    )
        throw new TypeError('HyperExpress.Server option streaming must be an object.');

    const has_certificate = Object.prototype.hasOwnProperty.call(options, 'cert_file_name');
    const has_private_key = Object.prototype.hasOwnProperty.call(options, 'key_file_name');
    if (has_certificate || has_private_key) {
        if (
            !has_certificate ||
            !has_private_key ||
            typeof options.cert_file_name !== 'string' ||
            !options.cert_file_name.length ||
            typeof options.key_file_name !== 'string' ||
            !options.key_file_name.length
        )
            throw new TypeError(
                'HyperExpress.Server TLS configuration requires non-empty cert_file_name and key_file_name strings.'
            );
    }
}

class Server extends Router {
    #port;
    #hosts;
    #uws_instance;
    #listen_socket;
    #has_websocket_routes = false;
    #descriptor;
    #owned_listen_sockets = new WeakSet();
    #closed_listen_sockets = new WeakSet();
    #auto_close_handlers = new Map();
    #shutdown_promise;
    #shutdown_resolve;
    #shutdown_result = false;
    #shutting_down = false;
    #options = {
        is_ssl: false,
        auto_close: true,
        exclusive_port: false,
        fast_abort: false,
        strict_middleware: false,
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
     * Server-owned live file cache. Deleting or replacing an entry disposes its watcher.
     * @private
     */
    _file_pool;

    /**
     * @param {Object} options Server Options
     * @param {String=} options.cert_file_name Path to SSL certificate file to be used for SSL/TLS.
     * @param {String=} options.key_file_name Path to SSL private key file to be used for SSL/TLS.
     * @param {String=} options.passphrase Strong passphrase for SSL cryptographic purposes.
     * @param {String=} options.dh_params_file_name Path to SSL Diffie-Hellman parameters file.
     * @param {Boolean=} options.ssl_prefer_low_memory_usage Specifies uWebSockets to prefer lower memory usage while serving SSL.
     * @param {Boolean=} options.fast_buffers Buffer.allocUnsafe is used when set to true for faster performance.
     * @param {Boolean=} options.fast_abort Determines whether HyperExpress will abrubptly close bad requests. This can be much faster but the client does not receive an HTTP status code as it is a premature connection closure.
     * @param {Boolean=} options.strict_middleware Reports duplicate middleware completion to the scoped error handler. Default: false.
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
        if (options == null || typeof options !== 'object' || Array.isArray(options))
            throw new Error(
                'HyperExpress: HyperExpress.Server constructor only accepts an object type for the options parameter.'
            );

        // Snapshot top-level accessors once into a null-prototype data object before validation
        // or native option translation.
        options = Object.assign(Object.create(null), options);
        validate_server_options(options);

        super();
        super._is_app(true);

        const file_pool = Object.create(null);
        this._file_pool = new Proxy(file_pool, {
            deleteProperty(target, key) {
                const live_file = target[key];
                if (live_file && typeof live_file.close === 'function') live_file.close();
                return Reflect.deleteProperty(target, key);
            },
            set(target, key, live_file) {
                const previous = target[key];
                if (previous && previous !== live_file && typeof previous.close === 'function')
                    previous.close();
                target[key] = live_file;
                return true;
            },
        });

        // Merge user options into defaults and expose them to request lifecycle components
        wrap_object(this.#options, options);
        this._options = this.#options;
        try {
            const { cert_file_name, key_file_name } = options;
            this.#options.is_ssl = Boolean(cert_file_name && key_file_name);
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
        if (this.#auto_close_handlers.size) return false;

        const reference = this;
        const exit_events = ['exit', 'SIGINT', 'SIGUSR1', 'SIGUSR2', 'SIGTERM'];
        for (const event_type of exit_events) {
            const handler = () => reference.force_close();
            this.#auto_close_handlers.set(event_type, handler);
            process.once(event_type, handler);
        }
        return true;
    }

    /** @private */
    _unbind_auto_close() {
        for (const [event_type, handler] of this.#auto_close_handlers)
            process.removeListener(event_type, handler);
        this.#auto_close_handlers.clear();
    }

    /** @private */
    _dispose_file_pool() {
        for (const cache_key of Object.keys(this._file_pool)) delete this._file_pool[cache_key];
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
        if (this.#listen_socket)
            throw new Error('HyperExpress.Server.listen(): This server is already listening.');
        if (this.#shutting_down)
            throw new Error(
                'HyperExpress.Server.listen(): Cannot listen while a graceful shutdown is in progress.'
            );

        let port;
        let socket_path;

        // Parse the overloaded port or UNIX socket argument without allowing malformed numeric
        // strings to fall through as accidental filesystem paths.
        if (typeof first === 'number') {
            if (!Number.isInteger(first) || first < 0 || first >= 65536)
                throw new RangeError(
                    'HyperExpress.Server.listen(): TCP ports must be integers from 0 through 65535.'
                );
            port = first;
        } else if (typeof first === 'string') {
            const trimmed = first.trim();
            const numeric = Number(trimmed);
            if (/^\d+$/.test(trimmed)) {
                if (!Number.isInteger(numeric) || numeric < 0 || numeric >= 65536)
                    throw new RangeError(
                        'HyperExpress.Server.listen(): TCP ports must be integers from 0 through 65535.'
                    );
                port = numeric;
            } else if (trimmed && Number.isFinite(numeric)) {
                throw new RangeError(
                    'HyperExpress.Server.listen(): TCP port strings must contain decimal digits only.'
                );
            } else if (trimmed && !first.includes('\0')) {
                socket_path = first;
            } else {
                throw new TypeError(
                    'HyperExpress.Server.listen(): Unix socket paths cannot be empty.'
                );
            }
        } else
            throw new TypeError(
                'HyperExpress.Server.listen(): The first argument must be a valid TCP port or Unix socket path.'
            );

        let host = '0.0.0.0';
        let callback;
        if (second !== undefined) {
            // The second argument can be either a callback or a host followed by a callback
            if (typeof second === 'function') {
                if (third !== undefined)
                    throw new TypeError(
                        'HyperExpress.Server.listen(): The third argument is only valid after a hostname.'
                    );
                callback = second;
            } else {
                if (
                    typeof second === 'string' &&
                    second.trim().length &&
                    !second.includes('\0')
                ) {
                    host = second;
                } else {
                    throw new TypeError(
                        'HyperExpress.Server.listen(): The second argument must either be a callback function or a non-empty hostname string.'
                    );
                }

                if (third !== undefined && typeof third !== 'function')
                    throw new TypeError(
                        'HyperExpress.Server.listen(): The third argument must be a callback function.'
                    );
                if (third) callback = third;
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
        this.#port = undefined;

        return await new Promise((resolve, reject) => {
            const on_listen_socket = (listen_socket) => {
                if (listen_socket) {
                    try {
                        reference.#owned_listen_sockets.add(listen_socket);
                        // Freeze and compile routing structures before accepting requests
                        reference._compile();
                        reference.#shutdown_promise = undefined;
                        reference.#shutdown_resolve = undefined;
                        reference.#shutdown_result = false;
                        reference.#pending_requests_zero_handler = null;
                        reference.#listen_socket = listen_socket;

                        if (reference.#options.auto_close) reference._bind_auto_close();

                        if (callback) {
                            const output = callback(listen_socket);
                            if (output instanceof Error) throw output;
                            if (output != null && typeof output.then === 'function') {
                                Promise.resolve(output).then(
                                    (value) => {
                                        if (value instanceof Error) {
                                            reference._stop_listening(listen_socket);
                                            reject(value);
                                        } else {
                                            resolve(listen_socket);
                                        }
                                    },
                                    (error) => {
                                        reference._stop_listening(listen_socket);
                                        reject(error);
                                    }
                                );
                                return;
                            }
                        }

                        resolve(listen_socket);
                    } catch (error) {
                        reference._stop_listening(listen_socket);
                        reject(error);
                    }
                } else {
                    reject(
                        new Error(
                            'HyperExpress.Server.listen(): No socket was received from uWebSockets.js, likely because the address is invalid or already in use.'
                        )
                    );
                }
            };

            if (port !== undefined) {
                if (reference.#options.exclusive_port) {
                    // uWebSockets.js only supports listen options without a custom host
                    if (host !== '0.0.0.0')
                        return reject(
                            new Error(
                                'HyperExpress.Server.listen(): A custom host cannot be used with the exclusive_port option.'
                            )
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
                reference.#uws_instance.listen_unix(on_listen_socket, socket_path);
            }
        });
    }

    /**
     * Stops accepting new connections immediately, then waits for active HTTP requests.
     * WebSockets are intentionally not part of graceful HTTP request accounting.
     * @param {uWebSockets.us_listen_socket=} listen_socket Optional
     * @returns {Promise<boolean>}
     */
    shutdown(listen_socket) {
        if (this.#shutdown_promise) return this.#shutdown_promise;

        const stopped = this._stop_listening(listen_socket);
        // An explicit stale or foreign token must not transition this server into shutdown while
        // its actual listener remains active.
        if (listen_socket && !stopped) return Promise.resolve(false);

        this.#shutting_down = true;
        this.#shutdown_result = stopped;
        this.#shutdown_promise = new Promise((resolve) => (this.#shutdown_resolve = resolve));
        this.#pending_requests_zero_handler = () => this._finish_shutdown();

        if (!this.#pending_requests_count) this._finish_shutdown();

        return this.#shutdown_promise;
    }

    /** @private */
    _finish_shutdown() {
        if (!this.#shutting_down) return false;
        this.#shutting_down = false;
        this.#pending_requests_zero_handler = null;
        this._dispose_file_pool();

        const resolve = this.#shutdown_resolve;
        this.#shutdown_resolve = undefined;
        if (resolve) resolve(this.#shutdown_result);
        return true;
    }

    /** @private */
    _stop_listening(listen_socket) {
        const socket = listen_socket || this.#listen_socket;
        if (
            !socket ||
            !this.#owned_listen_sockets.has(socket) ||
            this.#closed_listen_sockets.has(socket)
        )
            return false;

        this.#closed_listen_sockets.add(socket);
        uWebSockets.us_listen_socket_close(socket);
        if (!listen_socket || socket === this.#listen_socket) {
            this.#listen_socket = null;
            this.#port = undefined;
            this._unbind_auto_close();
        }
        return true;
    }

    /**
     * Stops/Closes HyperExpress webserver instance.
     *
     * @param {uWebSockets.us_listen_socket=} listen_socket Optional
     * @returns {Boolean}
     */
    close(listen_socket) {
        const closed = this._stop_listening(listen_socket);
        if (!this.#shutting_down) this._dispose_file_pool();
        return closed;
    }

    /**
     * Forcefully closes all native listen, HTTP, and WebSocket sockets owned by this app.
     * @returns {Boolean} Always true after native close has been invoked.
     */
    force_close() {
        if (this.#listen_socket) this.#closed_listen_sockets.add(this.#listen_socket);
        this.#uws_instance.close();
        this.#listen_socket = null;
        this.#port = undefined;
        this.#pending_requests_count = 0;
        this._unbind_auto_close();
        this._dispose_file_pool();
        if (this.#shutting_down) this._finish_shutdown();
        return true;
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
        return this;
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
        return this;
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
        if (!this.#has_websocket_routes) return false;
        return this.#uws_instance.publish(topic, message, is_binary, compress);
    }

    /**
     * Returns the number of subscribers to a topic across all WebSocket connections on this Server instance.
     *
     * @param {String} topic
     * @returns {Number}
     */
    num_of_subscribers(topic) {
        if (!this.#has_websocket_routes) return 0;
        return this.#uws_instance.numSubscribers(topic);
    }

    /** Returns the native application descriptor for worker distribution. */
    get_descriptor() {
        // The addon allocates a permanent V8 Persistent every time getDescriptor() is called.
        // The encoded app pointer is stable, so one read avoids an unbounded native-side leak.
        if (this.#descriptor === undefined) this.#descriptor = this.#uws_instance.getDescriptor();
        return this.#descriptor;
    }

    /** Adds a child application descriptor for worker distribution. */
    add_child_app_descriptor(descriptor) {
        if (typeof descriptor !== 'number' || !Number.isFinite(descriptor) || descriptor === 0)
            throw new TypeError(
                'HyperExpress.Server.add_child_app_descriptor(): descriptor must be a non-zero finite uWebSockets.js AppDescriptor.'
            );
        this.#uws_instance.addChildAppDescriptor(descriptor);
        return this;
    }

    /** Removes a child application descriptor from worker distribution. */
    remove_child_app_descriptor(descriptor) {
        if (typeof descriptor !== 'number' || !Number.isFinite(descriptor) || descriptor === 0)
            throw new TypeError(
                'HyperExpress.Server.remove_child_app_descriptor(): descriptor must be a non-zero finite uWebSockets.js AppDescriptor.'
            );
        this.#uws_instance.removeChildAppDescriptor(descriptor);
        return this;
    }

    /* Server Routes & Middlewares Logic */

    #middlewares = Object.assign(Object.create(null), {
        '/': [], // This will contain global middlewares
    });

    #routes = {
        any: Object.create(null),
        get: Object.create(null),
        post: Object.create(null),
        del: Object.create(null),
        head: Object.create(null),
        options: Object.create(null),
        patch: Object.create(null),
        put: Object.create(null),
        trace: Object.create(null),
        connect: Object.create(null),
        upgrade: Object.create(null),
        ws: Object.create(null),
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
        const { method, pattern, options, handler, error_scopes = [] } = record;

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
            error_scopes,
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
                this.#has_websocket_routes = true;
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
                `HyperExpress: Routes/Routers must not be created or used after the Server.listen() has been called. [MIDDLEWARE ${pattern}]`
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

    #router_mounts = [];

    /**
     * Records a router mount boundary for scoped not-found selection.
     * @private
     */
    _create_router_mount(record) {
        if (this.#routes_locked === true)
            throw new Error(
                `HyperExpress: Routes/Routers must not be created or used after the Server.listen() has been called. [ROUTER ${record.pattern}]`
            );

        this.#router_mounts.push({
            pattern: record.pattern,
            scopes: [...record.scopes],
        });
        return this;
    }

    /**
     * Runs the not-found handler selected by longest matching router mount boundary.
     * @private
     */
    _handle_not_found(request, response) {
        let selected;
        for (const mount of this.#router_mounts) {
            const pattern = mount.pattern;
            const matches =
                pattern === '/' || request.path === pattern || request.path.startsWith(pattern + '/');

            if (matches && (!selected || pattern.length > selected.pattern.length)) selected = mount;
        }

        const scopes = selected ? selected.scopes : [];
        let handler;
        for (const scope of scopes) {
            handler = scope._get_not_found_handler();
            if (handler) break;
        }
        if (!handler) handler = this.#handlers.on_not_found;

        const on_error = (error) => response.route.handle_error(request, response, error, scopes);
        try {
            const output = handler(request, response);
            if (output != null && typeof output.then === 'function') {
                Promise.resolve(output).then(
                    (value) => {
                        if (value instanceof Error) on_error(value);
                    },
                    on_error
                );
            }
        } catch (error) {
            on_error(error);
        }
    }

    /**
     * Compiles the route and middleware structures for this instance for use in the uWS server.
     * Note! This method will lock any future creation of routes or middlewares.
     * @private
     */
    _compile() {
        if (this.#routes_locked) return false;

        // Bind the not found handler as a catchall route if the user did not already bind a global ANY catchall route
        if (this.#handlers.on_not_found) {
            const exists = this.#routes.any['/*'] !== undefined;
            if (!exists) this.any('/*', (request, response) => this._handle_not_found(request, response));
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
        return true;
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
        let response;
        try {
            const request = new Request(route, uws_request);
            request._raw_response = uws_response;

            response = new Response(uws_response);
            response.route = route;
            response._wrapped_request = request;
            response._upgrade_socket = socket || null;

            this.#pending_requests_count++;

            // Capture every connection-derived value before uWS can invalidate this HttpResponse.
            // This also makes request address getters stable after send, abort, or upgrade.
            request._capture_connection_metadata();

            // Account for a request that raced with listen-socket closure before rejecting it.
            if (this.#shutdown_promise) return response.close();

            // Enter the route lifecycle only when body parsing remains within its configured limit
            if (request._body_parser_run(response, route.max_body_length)) {
                route.handle(request, response);

                // Defer future writes through cork when handling continues asynchronously
                if (!response.completed) response._cork = true;
            }
        } catch (error) {
            // No exception may cross a callback entered by uWebSockets.js. Once the wrappers exist,
            // route through normal error handling; constructor failures close the raw response.
            if (response) {
                try {
                    response.throw(error);
                } catch {
                    if (!response.completed) response.close();
                }
            } else {
                try {
                    uws_response.close();
                } catch {}
            }
        }
    }

    /* Safe Server Getters */

    /** Returns whether this server uses uWebSockets.js SSLApp. */
    get is_ssl() {
        return this.#options.is_ssl;
    }

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
