const uWebSockets = require('uWebSockets.js');
const OPERATORS = require('../operators.js');
const Request = require('./request.js');
const Response = require('./response.js');
const ROUTER_METHODS = ['any', 'connect', 'del', 'get', 'head', 'options', 'patch', 'post', 'put', 'trace'];

module.exports = class Server {
    #uWS = null;
    #listen_socket = null;
    #not_found_handler = null;
    #session_engine = null;
    #middlewares = [];
    #ws_compressors = {};
    #routes = {
        WS: {},
    };
    #error_handler = (request, response, error) => {
        response.send('HyperExpress: Uncaught Exception Occured: ');
        throw new Error(error);
    };

    constructor(options = {}) {
        // Validate options object
        if (typeof options !== 'object') throw new Error('HyperExpress: Must pass Javascript object during creation');

        // Create either Normal or SSL uWS instance to be power the webserver
        const { cert_file_name, key_file_name, passphrase } = options;
        if (cert_file_name && key_file_name && passphrase) {
            this.#uWS = uWebSockets.SSLApp(options);
        } else {
            this.#uWS = uWebSockets.App(options);
        }

        // Bind route instances
        let reference = this;
        ROUTER_METHODS.forEach((method) => {
            reference[method] = (pattern, handler) => reference._create_route(method, pattern, handler);
            reference.#routes[method.toUpperCase()] = {};
        });

        // Expose uWS websocket compressors
        this.#ws_compressors = {
            DISABLED: uWebSockets.DISABLED,
            SHARED: uWebSockets.SHARED_COMPRESSOR,
            DEDICATED: {},
        };

        [3, 4, 8, 16, 32, 64, 128, 256].forEach(
            (amount) => (reference.#ws_compressors['DEDICATED'][amount + 'KB'] = uWebSockets['DEDICATED_COMPRESSOR_' + amount + 'KB'])
        );
    }

    uWS() {
        return this.#uWS;
    }

    listen(port) {
        let reference = this;
        return new Promise((resolve, reject) => {
            this.#uWS.listen(port, (listen_socket) => {
                if (listen_socket) {
                    reference.#listen_socket = listen_socket;
                    resolve(listen_socket);
                } else {
                    reject('NO_SOCKET');
                }
            });
        });
    }

    close() {
        if (reference.#listen_socket !== null) {
            uWebSockets.us_listen_socket_close(this.#listen_socket);
            reference.#listen_socket = null;
            return true;
        }

        return false;
    }

    setErrorHandler(handler) {
        if (typeof handler !== 'function') throw new Error('HyperExpress: handler must be a function');
        this.#error_handler = handler;
    }

    setNotFoundHandler(handler) {
        if (typeof handler !== 'function') throw new Error('HyperExpress: handler must be a function');
        let should_bind = this.#not_found_handler === null;
        this.#not_found_handler = handler;
        if (should_bind) this.any('/*', (request, response) => this.#not_found_handler(request, response));
    }

    setSessionEngine(instance = {}) {
        if (instance.constructor && instance.constructor.name !== 'SessionEngine')
            throw new Error('HyperExpress: setSessionEngine only accepts a HyperExpress.SessionEngine instance');
        this.#session_engine = instance;
    }

    ws(pattern, websocket_route) {
        if (
            typeof websocket_route !== 'object' ||
            websocket_route.constructor == undefined ||
            websocket_route.constructor.name !== 'WebsocketRoute'
        )
            throw new Error(
                'HyperExpress: .ws(websocket_route) -> websocket_route must be a new HyperExpress.WebsocketRoute(options) instance'
            );

        if (this.#routes['WS'][pattern])
            throw new Error('HyperExpress: You cannot create the same websocket route again at route ' + pattern);

        // Store and initiate websocket route
        this.#routes['WS'][pattern] = websocket_route;
        websocket_route.initiate(pattern, this);

        return this.#routes['WS'][pattern];
    }

    ws_compressors() {
        return this.#ws_compressors;
    }

    routes() {
        return this.#routes;
    }

    get_error_handler() {
        return this.#error_handler;
    }

    get_session_engine() {
        return this.#session_engine;
    }

    use(handler) {
        if (typeof handler !== 'function') throw new Error('HyperExpress: handler must be a function');
        this.#middlewares.push(handler);
    }

    _chain_middlewares(request, response, final, position = 0) {
        if (this.#middlewares[position])
            setImmediate(
                (r) => r.#middlewares[position](request, response, () => r._chain_middlewares(request, response, final, position + 1)),
                this
            );
        final();
    }

    _create_route(method, pattern, handler) {
        if (this.#routes[method.toUpperCase()][pattern]) throw new Error('HyperExpress: You cannot create duplicate routes.');
        let url_parameters_key = OPERATORS.parse_url_parameters_key(pattern);
        let route = this.#uWS[method.toLowerCase()](pattern, (response, request) =>
            this._wrap_request(request, response, url_parameters_key, handler, this.get_error_handler(), this.#session_engine, this)
        );
        this.#routes[method.toUpperCase()][pattern] = route;
    }

    async _wrap_request(request, response, url_parameters_key, handler, error_handler, session_engine, master_context, uws_context) {
        // Wrap uWS request and response objects
        let wrapped_request = new Request(request, response, url_parameters_key, session_engine);
        let wrapped_response = new Response(wrapped_request, response, session_engine, error_handler, uws_context);

        // Pre-fetch body if content-length is specified
        if (wrapped_request.headers['content-length']) {
            try {
                await wrapped_request.text();
            } catch (error) {
                return error_handler(wrapped_request, wrapped_response, error);
            }
        }

        // Chain through middlewares and call handler
        master_context._chain_middlewares(wrapped_request, wrapped_response, () =>
            new Promise((resolve, reject) => {
                try {
                    resolve(handler(wrapped_request, wrapped_response));
                } catch (e) {
                    reject(e);
                }
            }).catch((error) => error_handler(wrapped_request, wrapped_response, error))
        );
    }

    _chain_middlewares(request, response, final, position = 0) {
        if (this.#middlewares[position]) {
            return setImmediate(
                (r) => r.#middlewares[position](request, response, () => r._chain_middlewares(request, response, final, position + 1)),
                this
            );
        }
        final();
    }
};
