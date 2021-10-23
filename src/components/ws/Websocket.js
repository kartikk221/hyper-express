const EventEmitter = require('events');
const { array_buffer_to_string } = require('../../shared/operators.js');

class Websocket extends EventEmitter {
    #ws;
    #ip;
    #context;
    #closed = false;

    constructor(ws) {
        // Initialize event emitter
        super();

        // Parse information about websocket connection
        this.#ws = ws;
        this.#context = ws.context || {};
        this.#ip = array_buffer_to_string(ws.getRemoteAddressAsText());
    }

    /**
     * Alias of uWS.cork() method. Accepts a callback with multiple operations for network efficiency.
     *
     * @param {Function} callback
     * @returns {Websocket}
     */
    atomic(callback) {
        if (this.#ws) this.#ws.cork(callback);
        return this;
    }

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
    send(message, is_binary, compress) {
        // Send message through uWS connection
        if (this.#ws) return this.#ws.send(message, is_binary, compress);
        return false;
    }

    /**
     * Sends a ping control message.
     * Returns Boolean depending on backpressure similar to send().
     *
     * @param {String|Buffer|ArrayBuffer} message
     */
    ping(message) {
        // Send ping OPCODE message through uWS connection
        if (this.#ws) this.#ws.ping(message);
    }

    /**
     * Destroys this polyfill Websocket component and derefernces the underlying ws object
     * @private
     */
    _destroy() {
        this.#closed = true;
        this.#ws = null;
    }

    /**
     * Gracefully closes websocket connection by sending specified code and short message.
     *
     * @param {Number} code
     * @param {String|Buffer|ArrayBuffer} message
     */
    close(code, message) {
        // Close websocket using uWS.end() method which gracefully closes connections
        if (this.#ws) this.#ws.end(code, message);
    }

    /**
     * Forcefully closes websocket connection.
     * No websocket close code/message is sent.
     * This will immediately emit the 'close' event.
     */
    destroy() {
        if (this.#ws) this.#ws.close();
    }

    /**
     * Returns whether this websocket is subscribed to specified topic.
     *
     * @param {String} topic
     * @returns {Boolean}
     */
    is_subscribed(topic) {
        if (this.#ws) return this.#ws.isSubscribed(topic);
        return false;
    }

    /**
     * Subscribe to a topic in MQTT syntax.
     * MQTT syntax includes things like "root/child/+/grandchild" where "+" is a wildcard and "root/#" where "#" is a terminating wildcard.
     *
     * @param {String} topic
     * @returns {Boolean}
     */
    subscribe(topic) {
        if (this.#ws) return this.#ws.subscribe(topic);
        return false;
    }

    /**
     * Unsubscribe from a topic.
     * Returns true on success, if the WebSocket was subscribed.
     *
     * @param {String} topic
     * @returns {Boolean}
     */
    unsubscribe(topic) {
        if (this.#ws) return this.#ws.unsubscribe(topic);
        return false;
    }

    /**
     * Publish a message to a topic in MQTT syntax.
     * You cannot publish using wildcards, only fully specified topics.
     *
     * @param {String} topic
     * @param {String|Buffer|ArrayBuffer} message
     * @param {Boolean} is_binary
     * @param {Boolean} compress
     */
    publish(topic, message, is_binary, compress) {
        if (this.#ws) return this.#ws.publish(topic, message, is_binary, compress);
        return false;
    }

    /* Websocket Getters */

    /**
     * Underlying uWS.Websocket object
     */
    get raw() {
        return this.#ws;
    }

    /**
     * Returns IP address of this websocket connection.
     * @returns {String}
     */
    get ip() {
        return this.#ip;
    }

    /**
     * Returns context values from the response.update(context) connection upgrade call.
     *
     * @returns {Object}
     */
    get context() {
        return this.#context;
    }

    /**
     * Returns whether is websocket connection is closed.
     * @returns {Boolean}
     */
    get closed() {
        return this.#closed;
    }

    /**
     * Returns the bytes buffered in backpressure.
     * This is similar to the bufferedAmount property in the browser counterpart.
     * @returns {Number}
     */
    get buffered() {
        if (this.#ws) return this.#ws.getBufferedAmount();
        return 0;
    }

    /**
     * Returns a list of topics this websocket is subscribed to.
     * @returns {Array.<String>}
     */
    get topics() {
        if (this.#ws) return this.#ws.getTopics();
        return [];
    }
}

module.exports = Websocket;
