export = WebsocketRoute;
declare class WebsocketRoute {
    constructor({ app, pattern, handler, options }: {
        app: any;
        pattern: any;
        handler: any;
        options: any;
    });
    /**
     * Returns a parser that automatically converts uWS ArrayBuffer to specified data type.
     * @private
     * @returns {Function}
     */
    private _get_message_parser;
    /**
     * Loads a companion upgrade route from app routes object.
     * @private
     */
    private _load_companion_route;
    /**
     * Sets companion upgrade route for incoming upgrade request to traverse through HyperExpress request cycle.
     * @private
     * @param {Route} route
     */
    private _set_companion_route;
    /**
     * Creates a uWs.ws() route will will power this WebsocketRoute instance.
     * @private
     */
    private _create_uws_route;
    /**
     * Handles 'open' event from uWebsockets.js
     * @private
     * @param {uWS.Websocket} ws
     */
    private _on_open;
    /**
     * Handles 'ping' event from uWebsockets.js
     * @private
     * @param {uWS.Websocket} ws
     * @param {ArrayBuffer} message
     */
    private _on_ping;
    /**
     * Handles 'pong' event from uWebsockets.js
     * @private
     * @param {uWS.Websocket} ws
     * @param {ArrayBuffer} message
     */
    private _on_pong;
    /**
     * Handles 'drain' event from uWebsockets.js
     * @private
     * @param {uWS.Websocket} ws
     */
    private _on_drain;
    /**
     * Handles 'message' event from uWebsockets.js
     * @private
     * @param {uWS.Websocket} ws
     * @param {ArrayBuffer} message
     * @param {Boolean} is_binary
     */
    private _on_message;
    /**
     * Handles 'close' event from uWebsockets.js
     * @param {uWS.Websocket} ws
     * @param {Number} code
     * @param {ArrayBuffer} message
     */
    _on_close(ws: any, code: number, message: ArrayBuffer): void;
    /**
     * WebsocketRoute constructor options
     */
    get options(): {
        idle_timeout: number;
        message_type: string;
        compression: number;
        max_backpressure: number;
        max_payload_length: number;
    };
    /**
     * Companion upgrade route for this instance
     */
    get upgrade_route(): any;
    #private;
}
