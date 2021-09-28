const uWebsockets = require('uWebSockets.js');
const Route = require('../http/Route.js');
const operators = require('../../shared/operators.js');

class WebsocketRoute {
    #route;

    // Default options
    #options = {
        idleTimeout: 32,
        messageType: 'String', // ['String', 'Buffer', 'ArrayBuffer']
        compression: uWebsockets.DISABLED,
        maxBackpressure: 1024 * 1024,
        maxPayloadLength: 32 * 1024,
    };

    // Passthrough uWS event handlers from user
    #methods = {
        upgrade: (request, response, socket) => response.upgrade(), // By default upgrade all incoming connections
        open: (ws) => {},
        message: (ws, message, isBinary) => {},
        drain: (ws) => {},
        close: (ws, code, message) => {},
    };

    constructor(pattern, options, context) {
        // Wrap passed options over default options object
        operators.fill_object(this.#options, options);

        // Bind passthrough handlers to allow for manual assignments
        const parser = this._get_message_parser();
        options.open = (ws) => this.#methods.open(ws);
        options.drain = (ws) => this.#methods.drain(ws);
        options.message = (ws, message, isBinary) =>
            this.#methods.message(ws, parser(message), isBinary);
        options.close = (ws, code, message) => this.#methods.close(ws, code, parser(message));

        // Create a Route object to pass along with uws request handler
        this.#route = new Route(context, 'ws', pattern, this.#methods.upgrade, []);

        // Bind passthrough upgrade handler that utilizes same wrapping as normal routes
        options.upgrade = (response, request, socket_context) =>
            context._handle_uws_request(this.#route, request, response, socket_context);

        // Bind a route to the underlying uWS instance
        context.uws_instance.ws(pattern, options);
    }

    /**
     * @private
     * @returns {Function} Incoming message[ArrayBuffer] parser for uWebsockets handler.
     */
    _get_message_parser() {
        switch (this.#options.messageType) {
            case 'String':
                // Converts ArrayBuffer -> String
                return (array_buffer) => operators.arr_buff_to_str(array_buffer);

            case 'Buffer':
                // Converts & Copies ArrayBuffer -> Buffer
                // We concat (copy) because ArrayBuffer from uWS is deallocated after initial synchronous execution
                return (array_buffer) => Buffer.concat([Buffer.from(array_buffer)]);
            case 'ArrayBuffer':
                // Simply return the ArrayBuffer from uWS handler
                return (array_buffer) => array_buffer;
            default:
                // Throw error on invalid type
                throw new Error(
                    "ws(options) -> Invalid options.messageType provided. Please provide one of ['String', 'Buffer', 'FastBuffer', 'ArrayBuffer']"
                );
        }
    }

    /**
     * This method is used to handle specific events for a websocket route.
     *
     * @param {('upgrade'|'open'|'message'|'drain'|'close')} event Event Name
     * @param {Function} handler Event Handler Function
     */
    on(event, handler) {
        if (this.#methods[event] == undefined)
            throw new Error(
                `HyperExpress: ${event} is not a supported event for a websocket route`
            );

        if (typeof handler !== 'function')
            throw new Error('HyperExpress: .handle(event, handler) -> handler must be a Function');

        // Store handler into methods object
        this.#methods[event] = handler;

        // Set handler for route object if upgrade handler is changed
        if (event == 'upgrade') this.#route.set_handler(handler);
    }

    /**
     * Alias of .on() method for backwards compatibility.
     * This will be deprecated in the future and move to .on().
     *
     * @param {('upgrade'|'open'|'message'|'drain'|'close')} event Event Name
     * @param {Function} handler Event Handler Function
     */
    handle(event, handler) {
        return this.on(event, handler);
    }

    /* WebsocketRoute Getters */
    get _options() {
        return this.#options;
    }
}

module.exports = WebsocketRoute;
