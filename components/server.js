const uWebSockets = require('uWebSockets.js');
const OPERATORS = require('../operators.js');
const Request = require('./request.js');
const Response = require('./response.js');
const SessionEngine = require('./session_engine.js');
const WebsocketRoute = require('./websocket.js');
const ROUTER_METHODS = ['any', 'connect', 'del', 'get', 'head', 'options', 'patch', 'post', 'put', 'trace'];

module.exports = class HyperExpress {
    #uWS = null;
    #listen_socket = null;
    #not_found_handler = null;
    #session_engine = null;
    #routes = {};
    #ws_compressors = {};
    #middlewares = [];
    #error_handler = (request, response, error) => {
        response.send('HyperExpress: Uncaught Exception Occured');
        throw new Error(error);
    };

    constructor(options = {}) {
        // Validate options object
        if (typeof options !== 'object') throw new Error('HyperExpress: Must pass Javascript object during creation');

        // Parse parameters from options
        const { cert_file_name, key_file_name } = options;

        // Create under the hood uWebsockets instance
        let is_ssl_instance = cert_file_name && key_file_name;
        if (is_ssl_instance) {
            this.#uWS = uWebSockets.SSLApp(options);
        } else {
            this.#uWS = uWebSockets.App(options);
        }

        // Bind route instances
        let reference = this;
        ROUTER_METHODS.forEach((method) => {
            reference[method] = (pattern, handler) => reference._create_route(method, pattern, handler);
            reference.#routes[method] = {};
        });

        // Expose uWS websocket compressors
        this.#ws_compressors = {
            DISABLED: this.#uWS.DISABLED,
            SHARED: this.#uWS.SHARED_COMPRESSOR,
            DEDICATED: {},
        };

        [3, 4, 8, 16, 32, 64, 128, 256].forEach(
            (amount) => (reference[amount + 'KB'] = reference.#uWS['DEDICATED_COMPRESSOR_' + amount + 'KB'])
        );
    }

    uWS() {
        return this.#uWS;
    }

    listen(port, callback = () => {}) {
        let reference = this;
        this.#uWS.listen(port, (listen_socket) => {
            reference.#listen_socket = listen_socket;
            callback();
        });
    }

    close() {
        this.#uWS.us_listen_socket_close(this.#listen_socket);
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

    ws(pattern, options) {
        if (this.#websocket_routes[pattern])
            throw new Error('HyperExpress: You cannot create the same websocket route again at route ' + pattern);
        this.#routes['websocket'][pattern] = new WebsocketRoute(pattern, options, this);
        return this.#routes['websocket'][pattern];
    }

    ws_compressors() {}

    routes() {
        return this.#websocket_routes;
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
                (r) => r.#middlewares[position](request, response, () => ref._chain_middlewares(request, response, final, position + 1)),
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
        if (req.headers['content-length']) {
            try {
                await req.body();
            } catch (error) {
                return error_handler(req, res, error);
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
            setImmediate(
                (r) => r.#middlewares[position](request, response, () => ref._chain_middlewares(request, response, final, position + 1)),
                this
            );
        }
        final();
    }
};
