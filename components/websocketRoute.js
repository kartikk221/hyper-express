const OPERATORS = require('../operators.js');
const uWebsockets = require('uWebSockets.js');

module.exports = class WebsocketRoute {
    #options = {
        idleTimeout: 32,
        compression: uWebsockets.DISABLED,
        maxBackpressure: 1024 * 1024,
        maxPayloadLength: 32 * 1024,
    };

    #methods = {
        upgrade: (request, response, context) => response.upgrade(), // By default upgrade all connections
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
        if (!context) throw new Error('HyperExpress: This method should not be called by user.');
        let options = this.#options;

        // Bind pass-through handlers
        options.open = (ws) => this.#methods.open(ws);
        options.message = (ws, message, isBinary) =>
            this.#methods.message(ws, isBinary ? message : OPERATORS.arr_buff_to_str(message), isBinary);
        options.drain = (ws) => this.#methods.drain(ws);
        options.close = (ws, code, message) => this.#methods.close(ws, code, OPERATORS.arr_buff_to_str(message));

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
};
