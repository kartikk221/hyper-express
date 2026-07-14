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
        super();

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
     * Returns false if message was not sent due to built-up backpressure.
     *
     * @param {String|Buffer|ArrayBuffer} message
     * @param {Boolean=} is_binary
     * @param {Boolean=} compress
     * @returns {Boolean}
     */
    send(message, is_binary, compress) {
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
        return this.#ws ? this.#ws.ping(message) : false;
    }

    /**
     * Destroys this polyfill Websocket component and dereferences the underlying ws object
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
        if (this.#ws) {
            // Map the fragment position to the corresponding uWS send operation
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
                if (callback) callback();
            } else {
                // Retry the fragment after uWS backpressure drains
                this.once('drain', () => this._write(type, chunk, is_binary, compress, callback));
            }

            return sent;
        }

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
        if (this.#ws === null) return;

        const sent = this._write(type, chunk, is_binary);
        if (!sent) {
            // Pause source consumption until the WebSocket drains
            stream.pause();

            this.once('drain', () => this._stream_chunk(stream, type, chunk, is_binary));
        } else if (stream.isPaused()) {
            // Resume only after the previously blocked fragment is accepted
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
        if (!(readable instanceof Readable))
            throw new Error('Websocket.stream(readable) -> readable must be a Readable stream.');

        // Fragment state is connection-wide, so only one stream may run at a time
        if (this.#stream)
            throw new Error(
                'Websocket.stream(readable) -> You may not stream data while another stream operation is active on this websocket. Make sure you are not already streaming or piping a stream to this websocket.'
            );

        const scope = this;
        return new Promise((resolve) => {
            scope.#stream = readable;

            // Delay one fragment so the final fragment can use the correct uWS opcode
            let is_first = true;
            readable.on('data', (chunk) => {
                const fragment = scope._buffer_fragment(chunk);
                if (fragment) {
                    scope._stream_chunk(readable, is_first ? FRAGMENTS.FIRST : FRAGMENTS.MIDDLE, fragment, is_binary);

                    if (is_first) is_first = false;
                }
            });

            const end_stream = () => {
                const fragment = scope._buffer_fragment();

                // A single buffered fragment can be sent as a complete message
                if (is_first) {
                    scope.#ws.send(fragment, is_binary);
                } else {
                    scope._stream_chunk(scope.#stream, FRAGMENTS.LAST, fragment, is_binary);
                }

                scope.#stream = undefined;
                resolve();
            };

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
        // Writable and readable streaming share the same connection fragment state
        const scope = this;
        if (this.#stream)
            throw new Error(
                'Websocket.writable -> You may only access and utilize one writable stream at any given time. Make sure you are not already streaming or piping a stream to this websocket.'
            );

        // Delay one fragment so finish can emit the correct final opcode
        let is_first = true;
        this.#stream = new Writable({
            write: (chunk, encoding, callback) => {
                const fragment = scope._buffer_fragment(chunk);

                if (fragment) {
                    scope._write(is_first ? FRAGMENTS.FIRST : FRAGMENTS.MIDDLE, fragment, true, false, callback);

                    if (is_first) is_first = false;
                } else {
                    // Continue consumption while the first fragment remains buffered
                    callback();
                }
            },
        });

        const end_stream = () => {
            const fragment = scope._buffer_fragment();

            if (is_first) {
                scope.#ws.send(fragment, true, false);
                scope.#ws.stream = undefined;
            } else {
                scope._write(FRAGMENTS.LAST, fragment, true, false, () => (scope.#stream = undefined));
            }
        };

        this.#stream.on('finish', end_stream);

        return this.#stream;
    }
}

module.exports = Websocket;
