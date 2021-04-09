const OPERATORS = require('../operators.js');
const uWebsockets = require('uWebSockets.js');

module.exports = class WebsocketRoute {
    #options = {
        idleTimeout: 30,
        compression: uWebsockets.DISABLED,
        maxBackpressure: 1024 * 1024, // 1 MB
        maxPayloadLength: 5 * 1024 * 1024, // 5 MB
    };

    #methods = {
        upgrade: (request, response, context) => response.status(500).end('AXUWS_UPGRADE_NOT_SETUP'),
        open: (ws) => ws.end(),
        message: () => {},
        drain: () => {},
        close: () => {},
    };

    constructor(options = this.#options) {
        if (typeof options !== 'object') throw new Error('HyperExpress: .ws(options) -> options must be a Javascript Object');
        OPERATORS.fill_object(this.#options, options);
    }

    initiate(pattern, context) {
        let options = this.#options;

        // Bind pass-through handlers
        options.open = (ws) => this.#methods.open(ws);
        options.message = (ws, message, isBinary) =>
            this.#methods.message(ws, isBinary ? message : this._array_buffer_to_string(message), isBinary);
        options.drain = (ws) => this.#methods.drain(ws);
        options.close = (ws, code, message) => this.#methods.close(ws, code, this._array_buffer_to_string(message));

        // Bind upgrade request handler with wrapped request/response
        let url_parameters_key = OPERATORS.parse_url_parameters_key(pattern);
        let session_engine = context.get_session_engine();
        let error_handler = context.get_error_handler();
        options.upgrade = (response, request, uws_context) =>
            context._wrap_request(
                request,
                response,
                url_parameters_key,
                this.#methods['upgrade'],
                error_handler,
                session_engine,
                context,
                uws_context
            );

        // Create uWS route
        context.uWS().ws(pattern, options);
    }

    handle(type, handler) {
        if (this.#methods[type] == undefined) throw new Error('HyperExpress: ' + type + ' type cannot be handled for a websocket route.');
        this.#methods[type] = handler;
    }

    options() {
        return this.#options;
    }

    _array_buffer_to_string(array_buffer, encoding = 'utf8') {
        return Buffer.from(array_buffer).toString(encoding);
    }
};
