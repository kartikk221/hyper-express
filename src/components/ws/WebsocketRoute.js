const uWebsockets = require('uWebSockets.js');
const operators = require('../../shared/operators.js');

class WebsocketRoute {
    // Default options
    #options = {
        idleTimeout: 32,
        compression: uWebsockets.DISABLED,
        maxBackpressure: 1024 * 1024,
        maxPayloadLength: 32 * 1024,
    };

    constructor(pattern, options, context) {
        let reference = this;

        // Wrap passed options over default options object
        operators.fill_object(this.#options, options);

        // Bind passthrough handlers to allow for manual assignments
        options.open = (ws) => this.#methods.open(ws);
        options.drain = (ws) => this.#methods.drain(ws);
        options.close = (ws, code, message) => {
            return reference.#methods.close(
                ws,
                code,
                operators.arr_buff_to_str(message)
            );
        };
        options.message = (ws, message, isBinary) => {
            return reference.#methods.message(
                ws,
                isBinary ? message : operators.arr_buff_to_str(message),
                isBinary
            );
        };

        // Bind passthrough upgrade handler that utilizes same wrapping as normal routes
        let url_parameters_key = operators.parse_path_params(pattern);
        options.upgrade = (response, request, socket_context) => {
            return context._handle_wrapped_request(
                request,
                response,
                socket_context,
                reference.#methods.upgrade,
                url_parameters_key,
                context
            );
        };

        // Bind a route to the underlying uWS instance
        context.uws_instance.ws(pattern, options);
    }

    #methods = {
        upgrade: (request, response, socket) => response.upgrade(), // By default upgrade all incoming connections
        open: (ws) => {},
        message: (ws, message, isBinary) => {},
        drain: (ws) => {},
        close: (ws, code, message) => {},
    };

    /**
     * This method is used to handle specific events for a websocket route.
     *
     * @param {String} event Event Name
     * @param {Function} handler Event Handler Function
     */
    handle(event, handler) {
        if (this.#methods[event] == undefined)
            throw new Error(
                `HyperExpress: ${event} is not a supported event for a websocket route`
            );

        if (typeof handler !== 'function')
            throw new Error(
                'HyperExpress: .handle(event, handler) -> handler must be a Function'
            );

        this.#methods[event] = handler;
    }

    /* WebsocketRoute Getters */
    get _options() {
        return this.#options;
    }
}

module.exports = WebsocketRoute;
