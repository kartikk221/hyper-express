'use strict';
const uWebsockets = require('uWebSockets.js');

const Route = require('../router/Route.js');
const Websocket = require('./Websocket.js');
const { wrap_object, array_buffer_to_string } = require('../../shared/operators.js');

const MAX_NATIVE_SIGNED_INTEGER = 0x7fffffff;
const VALID_COMPRESSORS = new Set([
    uWebsockets.DISABLED,
    uWebsockets.SHARED_COMPRESSOR,
    uWebsockets.DEDICATED_COMPRESSOR_3KB,
    uWebsockets.DEDICATED_COMPRESSOR_4KB,
    uWebsockets.DEDICATED_COMPRESSOR_8KB,
    uWebsockets.DEDICATED_COMPRESSOR_16KB,
    uWebsockets.DEDICATED_COMPRESSOR_32KB,
    uWebsockets.DEDICATED_COMPRESSOR_64KB,
    uWebsockets.DEDICATED_COMPRESSOR_128KB,
    uWebsockets.DEDICATED_COMPRESSOR_256KB,
]);
const VALID_DECOMPRESSORS = new Set([
    uWebsockets.DISABLED,
    uWebsockets.SHARED_DECOMPRESSOR,
    uWebsockets.DEDICATED_DECOMPRESSOR_512B,
    uWebsockets.DEDICATED_DECOMPRESSOR_1KB,
    uWebsockets.DEDICATED_DECOMPRESSOR_2KB,
    uWebsockets.DEDICATED_DECOMPRESSOR_4KB,
    uWebsockets.DEDICATED_DECOMPRESSOR_8KB,
    uWebsockets.DEDICATED_DECOMPRESSOR_16KB,
    uWebsockets.DEDICATED_DECOMPRESSOR_32KB,
]);

function validate_websocket_options(options) {
    for (const name of ['max_backpressure', 'max_payload_length']) {
        const value = options[name];
        if (!Number.isInteger(value) || value < 0 || value > MAX_NATIVE_SIGNED_INTEGER)
            throw new RangeError(
                `Server.ws(options) -> options.${name} must be an integer from 0 through ${MAX_NATIVE_SIGNED_INTEGER}.`
            );
    }

    const idle_timeout = options.idle_timeout;
    if (
        !Number.isInteger(idle_timeout) ||
        (idle_timeout !== 0 && (idle_timeout < 8 || idle_timeout > 960))
    )
        throw new RangeError(
            'Server.ws(options) -> options.idle_timeout must be 0 or an integer from 8 through 960 seconds.'
        );

    if (Object.prototype.hasOwnProperty.call(options, 'max_lifetime')) {
        const max_lifetime = options.max_lifetime;
        if (
            !Number.isInteger(max_lifetime) ||
            (max_lifetime !== 0 && (max_lifetime < 1 || max_lifetime > 239))
        )
            throw new RangeError(
                'Server.ws(options) -> options.max_lifetime must be 0 or an integer from 1 through 239 minutes.'
            );
    }

    for (const name of ['close_on_backpressure_limit', 'send_pings_automatically']) {
        if (
            Object.prototype.hasOwnProperty.call(options, name) &&
            typeof options[name] !== 'boolean'
        )
            throw new TypeError(`Server.ws(options) -> options.${name} must be a boolean.`);
    }

    const compression = options.compression;
    if (
        !Number.isInteger(compression) ||
        compression < 0 ||
        compression > 0xfff ||
        (compression & ~0xfff) !== 0 ||
        !VALID_COMPRESSORS.has(compression & 0xff) ||
        !VALID_DECOMPRESSORS.has(compression & 0xf00)
    )
        throw new RangeError(
            'Server.ws(options) -> options.compression must combine valid uWebSockets.js compressor and decompressor presets.'
        );
}

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
        super({ app, method: 'ws', pattern, options, handler });

        // Merge route options before creating the native uWS route
        wrap_object(this.options, options);
        validate_websocket_options(this.options);
        this.#message_parser = this._get_message_parser(this.options.message_type);

        // Pair the WebSocket route with its HTTP upgrade lifecycle
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
                return (array_buffer) => array_buffer_to_string(array_buffer);
            case 'Buffer':
                // Copy because uWS invalidates the message ArrayBuffer after the synchronous callback
                return (array_buffer) => Buffer.from(new Uint8Array(array_buffer));
            case 'ArrayBuffer':
                // Preserve the v6 zero-copy contract. This view is volatile after the callback returns.
                return (array_buffer) => array_buffer;
            case 'ArrayBufferSafe':
                // Opt into retaining a copy after uWS invalidates its callback memory.
                return (array_buffer) => array_buffer.slice(0);
            default:
                throw new Error(
                    "Server.ws(options) -> options.message_type must be one of ['String', 'Buffer', 'ArrayBuffer', 'ArrayBufferSafe']"
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
            // Preserve a user-defined upgrade route when one already exists
            this.#upgrade_with = companion;
        } else {
            // Create a temporary upgrade route that accepts matching WebSocket requests by default
            this.app._create_route({
                method: 'upgrade',
                pattern: this.pattern,
                handler: (request, response) => response.upgrade(), // By default, upgrade all incoming requests
                options: {
                    _temporary: true, // Flag this route as temporary so it will get overwritten by user specified upgrade route
                },
            });

            // Capture the temporary companion before this WebsocketRoute is stored by Server
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
        // Translate HyperExpress option names into the native uWS WebSocket configuration
        const { compression, idle_timeout, max_backpressure, max_payload_length } = this.options;
        const uws_options = {
            compression,
            idleTimeout: idle_timeout,
            maxBackpressure: max_backpressure,
            maxPayloadLength: max_payload_length,
        };
        if (Object.prototype.hasOwnProperty.call(this.options, 'close_on_backpressure_limit'))
            uws_options.closeOnBackpressureLimit = this.options.close_on_backpressure_limit;
        if (Object.prototype.hasOwnProperty.call(this.options, 'max_lifetime'))
            uws_options.maxLifetime = this.options.max_lifetime;
        if (Object.prototype.hasOwnProperty.call(this.options, 'send_pings_automatically'))
            uws_options.sendPingsAutomatically = this.options.send_pings_automatically;

        // Bridge upgrade requests and WebSocket events into HyperExpress lifecycle handlers
        uws_options.upgrade = (uws_response, uws_request, socket_context) =>
            this.app._handle_uws_request(this.#upgrade_with, uws_request, uws_response, socket_context);

        uws_options.open = (ws) => this._on_open(ws);
        uws_options.dropped = (ws, message, isBinary) => this._on_dropped(ws, message, isBinary);
        uws_options.drain = (ws) => this._on_drain(ws);
        uws_options.ping = (ws, message) => this._on_ping(ws, message);
        uws_options.pong = (ws, message) => this._on_pong(ws, message);
        uws_options.subscription = (ws, topic, newCount, oldCount) =>
            this._on_subscription(ws, topic, newCount, oldCount);
        uws_options.close = (ws, code, message) => this._on_close(ws, code, message);
        uws_options.message = (ws, message, isBinary) => this._on_message(ws, message, isBinary);

        this.app.uws_instance.ws(this.pattern, uws_options);
    }

    /**
     * Handles 'open' event from uWebsockets.js
     * @private
     * @param {uWS.Websocket} ws
     */
    _on_open(ws) {
        try {
            ws.poly = new Websocket(ws);
            const output = this.handler(ws.poly);
            if (output != null && typeof output.then === 'function')
                Promise.resolve(output).then(
                    (value) => {
                        if (value instanceof Error) ws.poly?.emit('error', value);
                    },
                    (error) => ws.poly?.emit('error', error)
                );
        } catch (error) {
            if (ws.poly) {
                ws.poly.emit('error', error);
            } else {
                // Construction failures have no wrapper capable of receiving an error event.
                // Close while the native object is still valid and let the guarded close bridge run.
                try {
                    ws.end(1011, 'Internal server error');
                } catch {
                    try {
                        ws.close();
                    } catch {}
                }
            }
        }
    }

    /**
     * Parses and dispatches a native WebSocket event without allowing conversion failures,
     * overwritten emit methods, or listener failures to unwind through uWebSockets.js.
     * @private
     */
    _dispatch_native_event(ws, event, create_values) {
        const poly = ws.poly;
        if (!poly) return false;

        try {
            if (create_values) poly.emit(event, ...create_values());
            else poly.emit(event);
            return true;
        } catch (error) {
            try {
                Websocket.prototype.emit.call(poly, 'error', error);
            } catch {
                try {
                    ws.end(1011, 'Internal server error');
                } catch {
                    try {
                        ws.close();
                    } catch {}
                }
            }
            return false;
        }
    }

    /**
     * Handles 'ping' event from uWebsockets.js
     * @private
     * @param {uWS.Websocket} ws
     * @param {ArrayBuffer=} message
     */
    _on_ping(ws, message = '') {
        this._dispatch_native_event(ws, 'ping', () => [this.#message_parser(message)]);
    }

    /**
     * Handles 'pong' event from uWebsockets.js
     * @private
     * @param {uWS.Websocket} ws
     * @param {ArrayBuffer=} message
     */
    _on_pong(ws, message = '') {
        this._dispatch_native_event(ws, 'pong', () => [this.#message_parser(message)]);
    }

    /**
     * Handles 'drain' event from uWebsockets.js
     * @private
     * @param {uWS.Websocket} ws
     */
    _on_drain(ws) {
        this._dispatch_native_event(ws, 'drain');
    }

    /**
     * Handles a message dropped by native backpressure policy.
     * @private
     */
    _on_dropped(ws, message = '', is_binary) {
        this._dispatch_native_event(ws, 'dropped', () => [
            this.#message_parser(message),
            is_binary,
        ]);
    }

    /**
     * Handles native topic subscription count changes.
     * @private
     */
    _on_subscription(ws, topic, new_count, old_count) {
        this._dispatch_native_event(ws, 'subscription', () => [
            array_buffer_to_string(topic),
            new_count,
            old_count,
        ]);
    }

    /**
     * Handles 'message' event from uWebsockets.js
     * @private
     * @param {uWS.Websocket} ws
     * @param {ArrayBuffer} message
     * @param {Boolean} is_binary
     */
    _on_message(ws, message = '', is_binary) {
        this._dispatch_native_event(ws, 'message', () => [
            this.#message_parser(message),
            is_binary,
        ]);
    }

    /**
     * Handles 'close' event from uWebsockets.js
     * @param {uWS.Websocket} ws
     * @param {Number} code
     * @param {ArrayBuffer} message
     */
    _on_close(ws, code, message = '') {
        const poly = ws.poly;
        if (!poly) return;

        // Mark the wrapper disconnected before close observers run
        poly._destroy();

        try {
            poly.emit('close', code, this.#message_parser(message));
        } catch (error) {
            try {
                Websocket.prototype.emit.call(poly, 'error', error);
            } catch {}
        } finally {
            // Release the wrapper even if conversion or user-overridden methods fail.
            delete ws.poly;
        }
    }
}

module.exports = WebsocketRoute;
