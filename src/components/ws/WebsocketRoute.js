'use strict';
const uWebsockets = require('uWebSockets.js');

const Route = require('../router/Route.js');
const Websocket = require('./Websocket.js');
const { wrap_object, array_buffer_to_string } = require('../../shared/operators.js');

class WebsocketRoute extends Route {
    #upgrade_with;
    #message_parser;
    options = {
        idle_timeout: 32,
        message_type: 'String',
        compression: uWebsockets.DISABLED,
        max_backpressure: 1024 * 1024,
        max_payload_length: 32 * 1024,
    };

    constructor({ app, pattern, handler, options }) {
        // Initialize the super Router class
        super({ app, method: 'ws', pattern, options, handler });

        // Wrap local default options with user specified options
        wrap_object(this.options, options);
        this.#message_parser = this._get_message_parser(this.options.message_type);

        // Load companion upgrade route and initialize uWS.ws() route
        this._load_companion_route();
        this._create_uws_route();
    }

    /**
     * Returns a parser that automatically converts uWS ArrayBuffer to specified data type.
     * @private
     * @returns {Function}
     */
    _get_message_parser(type) {
        switch (type) {
            case 'String':
                // Converts ArrayBuffer -> String
                return (array_buffer) => array_buffer_to_string(array_buffer);
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
                    "Server.ws(options) -> options.message_type must be one of ['String', 'Buffer', 'ArrayBuffer']"
                );
        }
    }

    /**
     * Loads a companion upgrade route from app routes object.
     * @private
     */
    _load_companion_route() {
        const companion = this.app.routes['upgrade'][this.pattern];
        if (companion) {
            // Use existing companion route as it is a user assigned route
            this.#upgrade_with = companion;
        } else {
            // Create and use a temporary default route to allow for healthy upgrade request cycle
            // Default route will upgrade all incoming requests automatically
            this.app._create_route({
                method: 'upgrade',
                pattern: this.pattern,
                handler: (request, response) => response.upgrade(), // By default, upgrade all incoming requests
                options: {
                    _temporary: true, // Flag this route as temporary so it will get overwritten by user specified upgrade route
                },
            });

            // Store created route locally as Server will not call _set_upgrade_route
            // This is because this WebsocketRoute has not been created synchronously yet
            this.#upgrade_with = this.app.routes['upgrade'][this.pattern];
        }
    }

    /**
     * Sets the upgrade route for incoming upgrade request to traverse through HyperExpress request lifecycle.
     * @private
     * @param {Route} route
     */
    _set_upgrade_route(route) {
        this.#upgrade_with = route;
    }

    /**
     * Creates a uWS.ws() route that will power this WebsocketRoute instance.
     * @private
     */
    _create_uws_route() {
        // Destructure and convert HyperExpress options to uWS.ws() route options
        const { compression, idle_timeout, max_backpressure, max_payload_length } = this.options;
        const uws_options = {
            compression,
            idleTimeout: idle_timeout,
            maxBackpressure: max_backpressure,
            maxPayloadLength: max_payload_length,
        };

        // Create middleman upgrade route that pipes upgrade requests to HyperExpress request handler
        uws_options.upgrade = (uws_response, uws_request, socket_context) =>
            this.app._handle_uws_request(this.#upgrade_with, uws_request, uws_response, socket_context);

        // Bind middleman routes to pipe uws events into poly handlers
        uws_options.open = (ws) => this._on_open(ws);
        uws_options.drain = (ws) => this._on_drain(ws);
        uws_options.ping = (ws, message) => this._on_ping(ws, message);
        uws_options.pong = (ws, message) => this._on_pong(ws, message);
        uws_options.close = (ws, code, message) => this._on_close(ws, code, message);
        uws_options.message = (ws, message, isBinary) => this._on_message(ws, message, isBinary);

        // Create uWebsockets instance route
        this.app.uws_instance.ws(this.pattern, uws_options);
    }

    /**
     * Handles 'open' event from uWebsockets.js
     * @private
     * @param {uWS.Websocket} ws
     */
    _on_open(ws) {
        // Create and attach HyperExpress.Websocket polyfill component to uWS websocket
        ws.poly = new Websocket(ws);

        // Trigger WebsocketRoute handler on new connection open so user can listen for events
        this.handler(ws.poly);
    }

    /**
     * Handles 'ping' event from uWebsockets.js
     * @private
     * @param {uWS.Websocket} ws
     * @param {ArrayBuffer=} message
     */
    _on_ping(ws, message = '') {
        // Emit 'ping' event on websocket poly component
        ws.poly.emit('ping', this.#message_parser(message));
    }

    /**
     * Handles 'pong' event from uWebsockets.js
     * @private
     * @param {uWS.Websocket} ws
     * @param {ArrayBuffer=} message
     */
    _on_pong(ws, message = '') {
        // Emit 'pong' event on websocket poly component
        ws.poly.emit('pong', this.#message_parser(message));
    }

    /**
     * Handles 'drain' event from uWebsockets.js
     * @private
     * @param {uWS.Websocket} ws
     */
    _on_drain(ws) {
        // Emit 'drain' event on websocket poly component
        ws.poly.emit('drain');
    }

    /**
     * Handles 'message' event from uWebsockets.js
     * @private
     * @param {uWS.Websocket} ws
     * @param {ArrayBuffer} message
     * @param {Boolean} is_binary
     */
    _on_message(ws, message = '', is_binary) {
        // Emit 'message' event with parsed message from uWS
        ws.poly.emit('message', this.#message_parser(message), is_binary);
    }

    /**
     * Handles 'close' event from uWebsockets.js
     * @param {uWS.Websocket} ws
     * @param {Number} code
     * @param {ArrayBuffer} message
     */
    _on_close(ws, code, message = '') {
        // Mark websocket poly component as closed
        ws.poly._destroy();

        // Emit 'close' event with parsed message
        ws.poly.emit('close', code, this.#message_parser(message));

        // De-reference the attached polyfill Websocket component so it can ne garbage collected
        delete ws.poly;
    }
}

module.exports = WebsocketRoute;
