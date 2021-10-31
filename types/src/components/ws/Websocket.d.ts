export = Websocket;
declare class Websocket extends EventEmitter {
    constructor(ws: any);
    /**
     * Alias of uWS.cork() method. Accepts a callback with multiple operations for network efficiency.
     *
     * @param {Function} callback
     * @returns {Websocket}
     */
    atomic(callback: Function): Websocket;
    /**
     * Sends a message to websocket connection.
     * Returns true if message was sent successfully.
     * Returns false if message was not sent due to buil up backpressure.
     *
     * @param {String|Buffer|ArrayBuffer} message
     * @param {Boolean} is_binary
     * @param {compress} compress
     * @returns {Boolean}
     */
    send(message: string | Buffer | ArrayBuffer, is_binary: boolean, compress: any): boolean;
    /**
     * Sends a ping control message.
     * Returns Boolean depending on backpressure similar to send().
     *
     * @param {String|Buffer|ArrayBuffer} message
     */
    ping(message: string | Buffer | ArrayBuffer): void;
    /**
     * Destroys this polyfill Websocket component and derefernces the underlying ws object
     * @private
     */
    private _destroy;
    /**
     * Gracefully closes websocket connection by sending specified code and short message.
     *
     * @param {Number} code
     * @param {String|Buffer|ArrayBuffer} message
     */
    close(code: number, message: string | Buffer | ArrayBuffer): void;
    /**
     * Forcefully closes websocket connection.
     * No websocket close code/message is sent.
     * This will immediately emit the 'close' event.
     */
    destroy(): void;
    /**
     * Returns whether this websocket is subscribed to specified topic.
     *
     * @param {String} topic
     * @returns {Boolean}
     */
    is_subscribed(topic: string): boolean;
    /**
     * Subscribe to a topic in MQTT syntax.
     * MQTT syntax includes things like "root/child/+/grandchild" where "+" is a wildcard and "root/#" where "#" is a terminating wildcard.
     *
     * @param {String} topic
     * @returns {Boolean}
     */
    subscribe(topic: string): boolean;
    /**
     * Unsubscribe from a topic.
     * Returns true on success, if the WebSocket was subscribed.
     *
     * @param {String} topic
     * @returns {Boolean}
     */
    unsubscribe(topic: string): boolean;
    /**
     * Publish a message to a topic in MQTT syntax.
     * You cannot publish using wildcards, only fully specified topics.
     *
     * @param {String} topic
     * @param {String|Buffer|ArrayBuffer} message
     * @param {Boolean} is_binary
     * @param {Boolean} compress
     */
    publish(topic: string, message: string | Buffer | ArrayBuffer, is_binary: boolean, compress: boolean): any;
    /**
     * Underlying uWS.Websocket object
     */
    get raw(): any;
    /**
     * Returns IP address of this websocket connection.
     * @returns {String}
     */
    get ip(): string;
    /**
     * Returns context values from the response.update(context) connection upgrade call.
     *
     * @returns {Object}
     */
    get context(): any;
    /**
     * Returns whether is websocket connection is closed.
     * @returns {Boolean}
     */
    get closed(): boolean;
    /**
     * Returns the bytes buffered in backpressure.
     * This is similar to the bufferedAmount property in the browser counterpart.
     * @returns {Number}
     */
    get buffered(): number;
    /**
     * Returns a list of topics this websocket is subscribed to.
     * @returns {Array.<String>}
     */
    get topics(): string[];
    #private;
}
import EventEmitter = require("events");
