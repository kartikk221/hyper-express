'use strict';
const EventEmitter = require('events');
const { Readable, Writable } = require('stream');
const { array_buffer_to_string } = require('../../shared/operators.js');

const FRAGMENTS = {
    FIRST: 'FIRST',
    MIDDLE: 'MIDDLE',
    LAST: 'LAST',
};

class Websocket extends EventEmitter {
    #ws;
    #ip;
    #context;
    #stream;
    #closed = false;

    constructor(ws) {
        // Initialize event emitter
        super();

        // Parse information about websocket connection
        this.#ws = ws;
        this.#context = ws.context || {};
        this.#ip = array_buffer_to_string(ws.getRemoteAddressAsText());
    }

    /* EventEmitter overrides */

    /**
     * Binds an event listener to this `Websocket` instance.
     * See the Node.js `EventEmitter` documentation for more details on this extended method.
     * @param {('message'|'close'|'drain'|'ping'|'pong')} eventName
     * @param {Function} listener
     * @returns {Websocket}
     */
    on(eventName, listener) {
        // Pass all events to EventEmitter
        super.on(eventName, listener);
        return this;
    }

    /**
     * Binds a `one-time` event listener to this `Websocket` instance.
     * See the Node.js `EventEmitter` documentation for more details on this extended method.
     * @param {('message'|'close'|'drain'|'ping'|'pong')} eventName
     * @param {Function} listener
     * @returns {Websocket}
     */
    once(eventName, listener) {
        // Pass all events to EventEmitter
        super.once(eventName, listener);
        return this;
    }

    /**
     * Alias of uWS.cork() method. Accepts a callback with multiple operations for network efficiency.
     *
     * @param {Function} callback
     * @returns {Websocket}
     */
    atomic(callback) {
        return this.#ws ? this.#ws.cork(callback) : this;
    }

    /**
     * Sends a message to websocket connection.
     * Returns true if message was sent successfully.
     * Returns false if message was not sent due to buil up backpressure.
     *
     * @param {String|Buffer|ArrayBuffer} message
     * @param {Boolean=} is_binary
     * @param {Boolean=} compress
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
     * @param {String|Buffer|ArrayBuffer=} message
     * @returns {Boolean}
     */
    ping(message) {
        // Send ping OPCODE message through uWS connection
        return this.#ws ? this.#ws.ping(message) : false;
    }

    /**
     * Destroys this polyfill Websocket component and derefernces the underlying ws object
     * @private
     */
    _destroy() {
        this.#ws = null;
        this.#closed = true;
    }

    /**
     * Gracefully closes websocket connection by sending specified code and short message.
     *
     * @param {Number=} code
     * @param {(String|Buffer|ArrayBuffer)=} message
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
     * Returns whether this `Websocket` is subscribed to the specified topic.
     *
     * @param {String} topic
     * @returns {Boolean}
     */
    is_subscribed(topic) {
        return this.#ws ? this.#ws.isSubscribed(topic) : false;
    }

    /**
     * Subscribe to a topic in MQTT syntax.
     * MQTT syntax includes things like "root/child/+/grandchild" where "+" is a wildcard and "root/#" where "#" is a terminating wildcard.
     *
     * @param {String} topic
     * @returns {Boolean}
     */
    subscribe(topic) {
        return this.#ws ? this.#ws.subscribe(topic) : false;
    }

    /**
     * Unsubscribe from a topic.
     * Returns true on success, if the WebSocket was subscribed.
     *
     * @param {String} topic
     * @returns {Boolean}
     */
    unsubscribe(topic) {
        return this.#ws ? this.#ws.unsubscribe(topic) : false;
    }

    /**
     * Publish a message to a topic in MQTT syntax.
     * You cannot publish using wildcards, only fully specified topics.
     *
     * @param {String} topic
     * @param {String|Buffer|ArrayBuffer} message
     * @param {Boolean=} is_binary
     * @param {Boolean=} compress
     */
    publish(topic, message, is_binary, compress) {
        return this.#ws ? this.#ws.publish(topic, message, is_binary, compress) : false;
    }

    #buffered_fragment;
    /**
     * Buffers the provided fragment and returns the last buffered fragment.
     *
     * @param {String|Buffer|ArrayBuffer} fragment
     * @returns {String|Buffer|ArrayBuffer|undefined}
     */
    _buffer_fragment(fragment) {
        const current = this.#buffered_fragment;
        this.#buffered_fragment = fragment;
        return current;
    }

    /**
     * Initiates fragment based message writing with uWS and writes appropriate chunk based on provided type parameter.
     *
     * @param {String} type
     * @param {String|Buffer|ArrayBuffer} chunk
     * @param {Boolean=} is_binary
     * @param {Boolean=} compress
     * @param {Function=} callback
     * @returns {Boolean}
     */
    _write(type, chunk, is_binary, compress, callback) {
        // Ensure websocket still exists before attempting to write
        if (this.#ws) {
            // Attempt to send this fragment using the appropriate fragment method from uWS
            let sent;
            switch (type) {
                case FRAGMENTS.FIRST:
                    sent = this.#ws.sendFirstFragment(chunk, is_binary, compress);
                    break;
                case FRAGMENTS.MIDDLE:
                    sent = this.#ws.sendFragment(chunk, is_binary, compress);
                    break;
                case FRAGMENTS.LAST:
                    sent = this.#ws.sendLastFragment(chunk, is_binary, compress);
                    break;
                default:
                    throw new Error('Websocket._write() -> Invalid Fragment type constant provided.');
            }

            if (sent) {
                // Invoke the callback if chunk was sent successfully
                if (callback) callback();
            } else {
                // Wait for this connection to drain before retrying this chunk
                this.once('drain', () => this._write(type, chunk, is_binary, compress, callback));
            }

            // Return the sent status for consumer
            return sent;
        }

        // Throw an error with NOT_CONNECTED message to be caught by executor
        throw new Error('Websocket is no longer connected.');
    }

    /**
     * Streams the provided chunk while pausing the stream being consumed during backpressure.
     *
     * @param {Readable} stream
     * @param {String} type
     * @param {Buffer|ArrayBuffer} chunk
     * @param {Boolean} is_binary
     */
    _stream_chunk(stream, type, chunk, is_binary) {
        // Break execution if connection is no longer connected
        if (this.#ws === null) return;

        // Attempt to write this chunk
        const sent = this._write(type, chunk, is_binary);
        if (!sent) {
            // Pause the readable stream as we failed to write this chunk
            stream.pause();

            // Wait for this connection to be drained before trying again
            this.once('drain', () => this._stream_chunk(stream, type, chunk, is_binary));
        } else if (stream.isPaused()) {
            // Resume the stream if it has been paused and we sent a chunk successfully
            stream.resume();
        }
    }

    /**
     * This method is used to stream a message to the receiver.
     * Note! The data is by default streamed as Binary due to how partial fragments are sent.
     * This is done to prevent processing errors depending on client's receiver's incoming fragment processing strategy.
     *
     * @param {Readable} readable A Readable stream which will be consumed as message
     * @param {Boolean=} is_binary Whether data being streamed is in binary. Default: true
     * @returns {Promise}
     */
    stream(readable, is_binary = true) {
        // Ensure readable is an instance of a stream.Readable
        const scope = this;
        if (!(readable instanceof Readable))
            throw new Error('Websocket.stream(readable) -> readable must be a Readable stream.');

        // Prevent multiple streaming operations from taking place
        if (this.#stream)
            throw new Error(
                'Websocket.stream(readable) -> You may not stream() data while another streaming operation is active on this websocket. Make sure you are not already streaming or piping a stream to this websocket.'
            );

        return new Promise((resolve, reject) => {
            // Store the readable as the pending stream for this connection
            scope.#stream = readable;

            // Bind a listener for the 'data' event to consume chunks
            let is_first = true;
            readable.on('data', (chunk) => {
                // Buffer the incoming chunk as a fragment
                const fragment = scope._buffer_fragment(chunk);

                // Check to see if we have a fragment to send post buffering
                if (fragment) {
                    // Stream the retrieved current fragment
                    scope._stream_chunk(readable, is_first ? FRAGMENTS.FIRST : FRAGMENTS.MIDDLE, fragment, is_binary);

                    // Invert the is_first boolean after fragment
                    if (is_first) is_first = false;
                }
            });

            // Create a callback for ending the readable consumption
            const end_stream = () => {
                // Retrieve the last buffered fragment to send as last chunk
                const fragment = scope._buffer_fragment();

                // Stream the final chunk as last fragment and cleanup the readable
                scope._stream_chunk(scope.#stream, FRAGMENTS.LAST, fragment, is_binary);
                scope.#stream = undefined;
                resolve();
            };

            // Bind listeners to end the framented write procedure
            readable.once('end', end_stream);
        });
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
        return this.#ws ? this.#ws.getBufferedAmount() : 0;
    }

    /**
     * Returns a list of topics this websocket is subscribed to.
     * @returns {Array<String>}
     */
    get topics() {
        return this.#ws ? this.#ws.getTopics() : [];
    }

    /**
     * Returns a Writable stream associated with this response to be used for piping streams.
     * Note! You can only retrieve/use only one writable at any given time.
     *
     * @returns {Writable}
     */
    get writable() {
        // Prevent multiple streaming operations from taking place
        const scope = this;
        if (this.#stream)
            throw new Error(
                'Websocket.writable -> You may only access and utilize one writable stream at any given time. Make sure you are not already streaming or piping a stream to this websocket.'
            );

        // Create a new writable stream object which will write with the _write method
        let is_first = true;
        this.#stream = new Writable({
            write: (chunk, encoding, callback) => {
                // Buffer the incoming chunk as a fragment
                const fragment = scope._buffer_fragment(chunk);

                // Check to see if we have a fragment to send post buffering
                if (fragment) {
                    // Write the current retrieved fragment
                    scope._write(is_first ? FRAGMENTS.FIRST : FRAGMENTS.MIDDLE, fragment, true, false, callback);

                    // Invert the is_first boolean after first fragment
                    if (is_first) is_first = false;
                } else {
                    // Trigger the callback even if don't have a fragment to continue consuming
                    callback();
                }
            },
        });

        // Create a callback for ending the writable usage
        const end_stream = () => {
            // Retrieve the last buffered fragment to write as last chunk
            const fragment = scope._buffer_fragment();

            // Write the final empty chunk as last fragment and cleanup the writable
            scope._write(FRAGMENTS.LAST, fragment, true, false, () => (scope.#stream = undefined));
        };

        // Bind listeners to end the framented write procedure
        this.#stream.on('finish', end_stream);

        // Return the writable stream
        return this.#stream;
    }
}

module.exports = Websocket;
