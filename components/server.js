const uWebSockets = require('uWebSockets.js');
const OPERATORS = require('../operators.js');
const Request = require('./request.js');
const Response = require('./response.js');
const SessionEngine = require('./session_engine.js');
const ROUTER_METHODS = ['any', 'connect', 'del', 'get', 'head', 'options', 'patch', 'post', 'put', 'trace'];

module.exports = class HyperExpress {
    #uWS = null;
    #not_found_handler = null;
    #session_engine = null;
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
        ROUTER_METHODS.forEach((method) => (reference[method] = (pattern, handler) => reference._create_route(method, pattern, handler)));
    }

    raw() {
        return this.#uWS;
    }

    listen(port, callback = () => {}) {
        this.#uWS.listen(port, callback);
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

    setSessionEngine(configuration) {
        if (this.#session_engine === null) this.#session_engine = new SessionEngine(configuration);
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
        if (this.#middlewares[position]) {
            setImmediate(
                (r) => r.#middlewares[position](request, response, () => ref._chain_middlewares(request, response, final, position + 1)),
                this
            );
        }
        final();
    }

    _create_route(method, pattern, handler) {
        let url_parameters_key = OPERATORS.parse_url_parameters_key(pattern);
        this.#uWS[method.toLowerCase()](pattern, (response, request) =>
            this._wrap_request(request, response, url_parameters_key, handler, this.get_error_handler(), this.#session_engine, this)
        );
    }

    async _wrap_request(request, response, url_parameters_key, handler, error_handler, session_engine_config, master_context, uws_context) {
        // Wrap uWS request and response objects
        let wrapped_request = new Request(request, response, url_parameters_key, session_engine_config);
        let wrapped_response = new Response(wrapped_request, response, session_engine_config, error_handler, uws_context);

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
