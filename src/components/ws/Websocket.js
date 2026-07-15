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
    #port;
    #context;
    #stream;
    #closed = false;
    #handling_unhandled_error = false;

    constructor(ws) {
        super();

        this.#ws = ws;
        this.#context = ws.context || {};
        this.#ip = array_buffer_to_string(ws.getRemoteAddressAsText());
        this.#port = ws.getRemotePort();
    }

    /* EventEmitter overrides */

    /**
     * Binds an event listener to this `Websocket` instance.
     * @param {('message'|'close'|'drain'|'ping'|'pong'|'dropped'|'subscription'|'error')} eventName
     * @param {Function} listener
     * @returns {Websocket}
     */
    on(eventName, listener) {
        super.on(eventName, listener);
        return this;
    }

    /**
     * Binds a one-time event listener to this `Websocket` instance.
     * @param {('message'|'close'|'drain'|'ping'|'pong'|'dropped'|'subscription'|'error')} eventName
     * @param {Function} listener
     * @returns {Websocket}
     */
    once(eventName, listener) {
        super.once(eventName, listener);
        return this;
    }

    /**
     * Emits an event while containing synchronous throws and rejected listener thenables.
     * Listener failures are forwarded to the WebSocket `error` event. An unhandled error
     * closes an active connection with status 1011 rather than escaping a native callback.
     * @param {String|Symbol} eventName
     * @param {...*} values
     * @returns {Boolean}
     */
    emit(eventName, ...values) {
        const listeners = super.rawListeners(eventName);
        if (listeners.length === 0) {
            if (eventName === 'error') this._close_on_unhandled_error(values[0]);
            return false;
        }

        for (const listener of listeners) {
            try {
                const output = Reflect.apply(listener, this, values);
                let is_thenable = false;
                try {
                    is_thenable = output != null && typeof output.then === 'function';
                } catch (error) {
                    this._handle_listener_error(eventName, error);
                    continue;
                }

                if (is_thenable)
                    Promise.resolve(output).then(
                        (value) => {
                            if (value instanceof Error) this._handle_listener_error(eventName, value);
                        },
                        (error) => this._handle_listener_error(eventName, error)
                    );
            } catch (error) {
                this._handle_listener_error(eventName, error);
            }
        }
        return true;
    }

    /** @private */
    _handle_listener_error(event_name, error) {
        if (!(error instanceof Error)) error = new Error(`ERR_CAUGHT_NON_ERROR_TYPE: ${error}`);
        if (event_name === 'error') return this._close_on_unhandled_error(error);
        this.emit('error', error);
    }

    /** @private */
    _close_on_unhandled_error(error) {
        if (this.#handling_unhandled_error) return;
        this.#handling_unhandled_error = true;

        if (!(error instanceof Error)) error = new Error(`ERR_CAUGHT_NON_ERROR_TYPE: ${error}`);
        if (this.#ws) {
            try {
                this.#ws.end(1011, 'Internal server error');
            } catch {
                try {
                    this.#ws.close();
                } catch {}
            }
        }
    }

    /**
     * Alias of uWS.cork(). The HyperExpress wrapper is always returned.
     * @param {Function} callback
     * @returns {Websocket}
     */
    atomic(callback) {
        if (this.#ws)
            this.#ws.cork(() => {
                try {
                    const output = callback();
                    if (output != null && typeof output.then === 'function')
                        Promise.resolve(output).then(
                            (value) => {
                                if (value instanceof Error) this.emit('error', value);
                            },
                            (error) => this.emit('error', error)
                        );
                } catch (error) {
                    this.emit('error', error);
                }
            });
        return this;
    }

    /**
     * Sends a message and returns the native uWS send status:
     * 1 for success, 2 for a dropped message, and 0 for backpressure.
     * @param {String|Buffer|ArrayBuffer|ArrayBufferView} message
     * @param {Boolean=} is_binary
     * @param {Boolean=} compress
     * @returns {Number}
     */
    send(message, is_binary, compress) {
        return this.#ws ? this.#ws.send(message, is_binary, compress) : 0;
    }

    /**
     * Sends a ping and returns the native uWS send status.
     * @param {String|Buffer|ArrayBuffer|ArrayBufferView=} message
     * @returns {Number}
     */
    ping(message) {
        return this.#ws ? this.#ws.ping(message) : 0;
    }

    /** @private */
    _destroy() {
        if (this.#closed) return false;
        this.#ws = null;
        this.#closed = true;
        return true;
    }

    /** Gracefully closes the WebSocket connection. */
    close(code, message) {
        if (this.#ws) this.#ws.end(code, message);
    }

    /** Forcefully closes the WebSocket connection. */
    destroy() {
        if (this.#ws) this.#ws.close();
    }

    is_subscribed(topic) {
        return this.#ws ? this.#ws.isSubscribed(topic) : false;
    }

    subscribe(topic) {
        return this.#ws ? this.#ws.subscribe(topic) : false;
    }

    unsubscribe(topic) {
        return this.#ws ? this.#ws.unsubscribe(topic) : false;
    }

    publish(topic, message, is_binary, compress) {
        return this.#ws ? this.#ws.publish(topic, message, is_binary, compress) : false;
    }

    /** @private */
    _disconnected_error() {
        const error = new Error('HyperExpress.Websocket is no longer connected.');
        error.code = 'ERR_WEBSOCKET_CLOSED';
        return error;
    }

    /**
     * Attempts a native send exactly once per invocation. A status-0 send has already been
     * accepted into native backpressure, so wait for drain before continuing without retrying it.
     * @private
     * @param {Function} attempt
     * @returns {Promise<Number>}
     */
    _wait_for_send(attempt) {
        return new Promise((resolve, reject) => {
            let settled = false;
            let drain_handler;

            const cleanup = () => {
                if (drain_handler) this.removeListener('drain', drain_handler);
                this.removeListener('close', on_close);
            };
            const settle = (error, status) => {
                if (settled) return;
                settled = true;
                cleanup();
                if (error) reject(error);
                else resolve(status);
            };
            const on_close = () => settle(this._disconnected_error());
            const run = () => {
                if (!this.#ws) return settle(this._disconnected_error());

                let status;
                try {
                    status = attempt(this.#ws);
                } catch (error) {
                    return settle(error);
                }

                if (status === 1 || status === 2) return settle(undefined, status);
                if (status !== 0)
                    return settle(
                        new Error(`HyperExpress.Websocket received an invalid native send status: ${status}`)
                    );

                drain_handler = () => {
                    this.removeListener('drain', drain_handler);
                    drain_handler = undefined;
                    settle(undefined, status);
                };
                this.once('drain', drain_handler);
            };

            this.once('close', on_close);
            run();
        });
    }

    /** @private */
    _write_fragment(type, chunk, is_binary, compress) {
        return this._wait_for_send((ws) => {
            switch (type) {
                case FRAGMENTS.FIRST:
                    return ws.sendFirstFragment(chunk, is_binary, compress);
                case FRAGMENTS.MIDDLE:
                    return ws.sendFragment(chunk, compress);
                case FRAGMENTS.LAST:
                    return ws.sendLastFragment(chunk, compress);
                default:
                    throw new Error('HyperExpress.Websocket received an invalid fragment type.');
            }
        }).then((status) => this._accept_stream_status(status));
    }

    /** @private */
    _write_message(chunk, is_binary, compress) {
        return this._wait_for_send((ws) => ws.send(chunk, is_binary, compress)).then((status) =>
            this._accept_stream_status(status)
        );
    }

    /** @private */
    _accept_stream_status(status) {
        if (status === 2) {
            const error = new Error(
                'HyperExpress.Websocket stream message was dropped by the native backpressure limit.'
            );
            error.code = 'ERR_WEBSOCKET_MESSAGE_DROPPED';
            throw error;
        }
        return status;
    }

    /**
     * Streams one complete WebSocket message from a Readable source.
     * @param {Readable} readable
     * @param {Boolean=} is_binary
     * @returns {Promise<Websocket>}
     */
    async stream(readable, is_binary = true) {
        if (!(readable instanceof Readable))
            throw new TypeError('HyperExpress.Websocket.stream(readable) requires a Readable stream.');
        if (!this.#ws) throw this._disconnected_error();
        if (this.#stream)
            throw new Error(
                'HyperExpress.Websocket.stream(readable) cannot run while another stream operation is active.'
            );

        this.#stream = readable;
        const iterator = readable[Symbol.asyncIterator]();
        let close_reject;
        const socket_closed = new Promise((resolve, reject) => (close_reject = reject));
        const on_socket_close = () => close_reject(this._disconnected_error());
        this.once('close', on_socket_close);

        let buffered;
        let sent_first = false;
        let failed;
        try {
            while (true) {
                const result = await Promise.race([iterator.next(), socket_closed]);
                if (result.done) break;

                if (buffered !== undefined) {
                    await this._write_fragment(
                        sent_first ? FRAGMENTS.MIDDLE : FRAGMENTS.FIRST,
                        buffered,
                        is_binary,
                        false
                    );
                    sent_first = true;
                }
                buffered = result.value;
            }

            if (buffered === undefined) {
                await this._write_message(Buffer.alloc(0), is_binary, false);
            } else if (!sent_first) {
                await this._write_message(buffered, is_binary, false);
            } else {
                await this._write_fragment(FRAGMENTS.LAST, buffered, is_binary, false);
            }
            return this;
        } catch (error) {
            failed = error;
            if (!readable.destroyed) readable.destroy();
            throw error;
        } finally {
            this.removeListener('close', on_socket_close);
            if (failed && typeof iterator.return === 'function') {
                try {
                    await iterator.return();
                } catch {}
            }
            if (this.#stream === readable) this.#stream = undefined;
        }
    }

    /* Websocket Getters */

    get raw() {
        return this.#ws;
    }

    get ip() {
        return this.#ip;
    }

    get remote_port() {
        return this.#port;
    }

    get context() {
        return this.#context;
    }

    get closed() {
        return this.#closed;
    }

    get buffered() {
        return this.#ws ? this.#ws.getBufferedAmount() : 0;
    }

    get topics() {
        return this.#ws ? this.#ws.getTopics() : [];
    }

    /**
     * Returns a Writable that emits exactly one binary WebSocket message.
     * @returns {Writable}
     */
    get writable() {
        if (!this.#ws) throw this._disconnected_error();
        if (this.#stream)
            throw new Error(
                'HyperExpress.Websocket.writable cannot be used while another stream operation is active.'
            );

        const scope = this;
        let buffered;
        let sent_first = false;
        const writable = new Writable({
            write(chunk, encoding, callback) {
                if (buffered === undefined) {
                    buffered = chunk;
                    return callback();
                }

                const fragment = buffered;
                buffered = chunk;
                scope
                    ._write_fragment(
                        sent_first ? FRAGMENTS.MIDDLE : FRAGMENTS.FIRST,
                        fragment,
                        true,
                        false
                    )
                    .then(() => {
                        sent_first = true;
                        callback();
                    }, callback);
            },
            final(callback) {
                let operation;
                if (buffered === undefined) {
                    operation = scope._write_message(Buffer.alloc(0), true, false);
                } else if (!sent_first) {
                    operation = scope._write_message(buffered, true, false);
                } else {
                    operation = scope._write_fragment(FRAGMENTS.LAST, buffered, true, false);
                }
                operation.then(() => callback(), callback);
            },
        });

        this.#stream = writable;
        const on_socket_close = () => {
            if (!writable.destroyed) writable.destroy(scope._disconnected_error());
        };
        const release = () => {
            scope.removeListener('close', on_socket_close);
            if (scope.#stream === writable) scope.#stream = undefined;
        };
        this.once('close', on_socket_close);
        writable.once('finish', release);
        writable.once('close', release);
        writable.on('error', (error) => {
            if (!scope.closed) scope.emit('error', error);
        });

        return writable;
    }
}

module.exports = Websocket;
