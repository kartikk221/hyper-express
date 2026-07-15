'use strict';
const cookie = require('cookie');
const signature = require('cookie-signature');
const status_codes = require('http').STATUS_CODES;
const mime_types = require('mime-types');
const stream = require('stream');
const Path = require('path');

const NodeResponse = require('../compatibility/NodeResponse.js');
const ExpressResponse = require('../compatibility/ExpressResponse.js');
const { inherit_prototype } = require('../../shared/operators.js');

const LiveFile = require('../plugins/LiveFile.js');
const SSEventStream = require('../plugins/SSEventStream.js');

class Response {
    _sse;
    _locals;
    route = null;
    _corked = false;
    _streaming = false;
    _aborted = false;
    _pending_resolved = false;
    _finish_emitted = false;
    _close_emitted = false;
    _deferred_send;
    _finalizing_writable = false;
    _piped_sources;
    _middleware_cursor;
    _wrapped_request = null;
    _upgrade_socket = null;
    _raw_response = null;

    /**
     * Returns the custom HTTP underlying status code of the response.
     * @private
     * @type {Number=}
     */
    _status_code;

    /**
     * Returns the custom HTTP underlying status code message of the response.
     * @private
     * @type {String=}
     */
    _status_message;

    /**
     * Contains underlying headers for the response.
     * @private
     * @type {Record<string, string|string[]}
     */
    _headers = {};

    /**
     * Contains underlying cookies for the response.
     * @private
     * @type {Record<string, string>}
     */
    _cookies;

    /**
     * Underlying lazy initialized writable body stream.
     * @private
     */
    _writable = null;

    /**
     * Whether this response needs to cork before sending.
     * @private
     */
    _cork = false;

    /**
     * Alias of aborted property as they both represent the same request state in terms of inaccessibility.
     * @returns {Boolean}
     */
    completed = false;

    /**
     * Returns whether response has been initiated by writing the HTTP status code and headers.
     * Note! No changes can be made to the HTTP status code or headers after a response has been initiated.
     * @returns {Boolean}
     */
    initiated = false;

    /**
     * Creates a new HyperExpress response instance that wraps a uWS.HttpResponse instance.
     *
     * @param {import('uWebSockets.js').HttpResponse} raw_response
     */
    constructor(raw_response) {
        this._raw_response = raw_response;

        // uWS requires an abort handler before the response can outlive its synchronous callback
        raw_response.onAborted(() => {
            const error = new Error('HyperExpress: Request was aborted before its lifecycle completed.');
            error.code = 'ERR_REQUEST_ABORTED';
            this._complete_response({ aborted: true, error });
        });
    }

    /**
     * Emits lifecycle events without allowing user listeners to throw through a native callback.
     * @private
     * @param {String} event
     */
    _emit_lifecycle(event) {
        if (!this._writable) return;
        if (event === 'finish') {
            if (this._finish_emitted || this._writable.writableFinished) return;
            this._finish_emitted = true;
        } else if (event === 'close') {
            if (this._close_emitted) return;
            this._close_emitted = true;
        }

        try {
            this.emit(event, this._wrapped_request, this);
        } catch (error) {
            setImmediate(() => this.route.handle_error(this._wrapped_request, this, error));
        }
    }

    /**
     * Finalizes request accounting and response events exactly once.
     * @private
     * @param {Object=} options
     * @param {Boolean=} options.aborted
     * @param {Error=} options.error
     * @param {Boolean=} options.emit_finish
     * @param {Boolean=} options.emit_close
     * @returns {Boolean}
     */
    _complete_response(options) {
        if (this.completed) return false;

        const aborted = options?.aborted === true;
        const error = options?.error;
        const emit_finish = options?.emit_finish ?? !aborted;
        const emit_close = options?.emit_close ?? true;

        this.completed = true;
        this._aborted = aborted;
        this._wrapped_request._mark_ended();

        if (error) this._wrapped_request._body_parser_stop(error);

        if (!this._pending_resolved) {
            this._pending_resolved = true;
            this.route.app._resolve_pending_request();
        }

        if (aborted) this._emit_lifecycle('abort');
        if (emit_finish) this._emit_lifecycle('finish');
        if (emit_close) {
            // Error completion must tear down the Node Writable so ordinary readable.pipe(response)
            // pipelines unpipe and release their source resources.
            if (error && this._writable) {
                if (!this._writable.destroyed) this._writable.destroy();
            } else {
                this._emit_lifecycle('close');
            }
        }
        return true;
    }

    /* HyperExpress Methods */

    /**
     * Tracks middleware cursor position over a request's lifetime.
     * This is so we can detect any double middleware iterations and throw an error.
     * @private
     * @param {Number} position - Cursor position
     */
    _track_middleware_cursor(position) {
        // Middleware cursors must advance monotonically to prevent duplicate next() calls
        if (this._middleware_cursor === undefined || position > this._middleware_cursor)
            return (this._middleware_cursor = position);

        this.throw(
            new Error(
                'ERR_DOUBLE_MIDDLEWARE_EXEUCTION_DETECTED: Please ensure you are not calling the next() iterator inside of an ASYNC middleware. You must only call next() ONCE per middleware inside of SYNCHRONOUS middlewares only!'
            )
        );
    }

    /* Response Methods/Operators */

    /**
     * Alias of `uWS.HttpResponse.cork()` which allows for manual corking of the response.
     * This is required by `uWebSockets.js` to maximize network performance with batched writes.
     *
     * @param {Function} handler
     * @returns {Response} Response (Chainable)
     */
    atomic(handler) {
        if (!this.completed)
            this._raw_response.cork(() => {
                try {
                    const output = handler();
                    if (output != null && typeof output.then === 'function')
                        Promise.resolve(output).then(
                            (value) => {
                                if (value instanceof Error) this.throw(value);
                            },
                            (error) => this.throw(error)
                        );
                } catch (error) {
                    this.throw(error);
                }
            });
        return this;
    }

    /**
     * This method is used to set a custom response code.
     *
     * @param {Number} code Example: response.status(403)
     * @param {String=} message Example: response.status(403, 'Forbidden')
     * @returns {Response} Response (Chainable)
     */
    status(code, message) {
        // Defer status serialization until response initiation
        this._status_code = code;
        this._status_message = message;
        return this;
    }

    /**
     * This method is used to set the response content type header based on the provided mime type. Example: type('json')
     *
     * @param {String} mime_type Mime type
     * @returns {Response} Response (Chainable)
     */
    type(mime_type) {
        if (mime_type[0] === '.') mime_type = mime_type.substring(1);

        this.header('content-type', mime_types.contentType(mime_type) || 'text/plain');
        return this;
    }

    /**
     * This method can be used to write a response header and supports chaining.
     *
     * @param {String} name Header Name
     * @param {String|String[]} value Header Value
     * @param {Boolean=} overwrite If true, overwrites existing header value with same name
     * @returns {Response} Response (Chainable)
     */
    header(name, value, overwrite) {
        name = name.toLowerCase();
        const has_header = Object.prototype.hasOwnProperty.call(this._headers, name);

        if (overwrite) {
            this._headers[name] = value;
        } else if (has_header) {
            if (Array.isArray(this._headers[name])) {
                if (Array.isArray(value)) {
                    this._headers[name] = this._headers[name].concat(value);
                } else {
                    this._headers[name].push(value);
                }
            } else {
                // Preserve repeated header values rather than overwriting the first
                this._headers[name] = [this._headers[name], value];
            }
        } else {
            this._headers[name] = value;
        }

        return this;
    }

    /**
     * @typedef {Object} CookieOptions
     * @property {String} domain
     * @property {String} path
     * @property {Number} maxAge
     * @property {Boolean} secure
     * @property {Boolean} httpOnly
     * @property {Boolean|'none'|'lax'|'strict'} sameSite
     * @property {String} secret
     */

    /**
     * This method is used to write a cookie to incoming request.
     * To delete a cookie, set the value to null.
     *
     * @param {String} name Cookie Name
     * @param {String|null} value Cookie Value
     * @param {Number=} expiry In milliseconds
     * @param {CookieOptions=} options Cookie Options
     * @param {Boolean=} sign_cookie Enables/Disables Cookie Signing
     * @returns {Response} Response (Chainable)
     */
    cookie(name, value, expiry, options, sign_cookie = true) {
        // Copy caller options before applying derived expiry and signing values
        options = options
            ? { ...options }
            : {
                  secure: true,
                  sameSite: 'none',
                  path: '/',
              };

        const deleting = value === null;
        if (deleting) {
            value = '';
            options.maxAge = 0;
            sign_cookie = false;
        }

        if (typeof expiry == 'number') {
            options.expires = options.expires ?? new Date(Date.now() + expiry);
            options.maxAge = options.maxAge ?? Math.round(expiry / 1000);
        }

        if (sign_cookie && typeof options.secret == 'string') {
            value = signature.sign(String(value), options.secret);
            options.encode = String; // Preserve the signature separator and base64 characters
        }
        delete options.secret;

        if (this._cookies == undefined) this._cookies = Object.create(null);

        // Same-name cookies only replace an existing cookie with the same domain/path scope.
        const scope = `${name}\0${String(options.domain || '').toLowerCase()}\0${options.path || ''}`;
        this._cookies[scope] = cookie.serialize(name, value, options);
        return this;
    }

    /**
     * This method is used to upgrade an incoming upgrade HTTP request to a Websocket connection.
     * @param {Object=} context Store information about the websocket connection
     */
    upgrade(context) {
        if (this.completed) return;

        // Only requests created by an upgrade route carry the required native socket context
        if (this._upgrade_socket == null)
            return this.throw(
                new Error(
                    'HyperExpress: You cannot upgrade a request that does not come from an upgrade handler. No upgrade socket was found.'
                )
            );

        // Resume any body pause before transferring socket ownership to uWS
        this._wrapped_request.resume();

        // Async upgrades must re-enter a corked uWS callback
        if (this._cork && !this._corked) {
            this._corked = true;
            return this.atomic(() => this.upgrade(context));
        }

        const headers = this._wrapped_request.headers;
        this._raw_response.upgrade(
            {
                context,
            },
            headers['sec-websocket-key'],
            headers['sec-websocket-protocol'],
            headers['sec-websocket-extensions'],
            this._upgrade_socket
        );

        this._complete_response({ emit_finish: false, emit_close: false });
        return this;
    }

    /**
     * Initiates response process by writing HTTP status code and then writing the appropriate headers.
     * @private
     * @returns {Boolean}
     */
    _initiate_response() {
        if (this.initiated) return false;

        // Allow final status, header and cookie mutations before locking response metadata
        if (this._writable) this.emit('prepare', this._wrapped_request, this);

        this.initiated = true;

        // Resume any body pause so uWS can finish receiving the request
        this._wrapped_request.resume();

        if (this._status_code || this._status_message)
            this._raw_response.writeStatus(
                this._status_code + ' ' + (this._status_message || status_codes[this._status_code])
            );

        for (const name in this._headers) {
            // Content-Length is deferred until send() determines body-suppression semantics
            if (name == 'content-length') continue;

            const values = this._headers[name];
            if (Array.isArray(values)) {
                for (const value of values) {
                    this._raw_response.writeHeader(name, value);
                }
            } else {
                this._raw_response.writeHeader(name, values);
            }
        }

        if (this._cookies) {
            for (const name in this._cookies) {
                this._raw_response.writeHeader('set-cookie', this._cookies[name]);
            }
        }

        return true;
    }

    _drain_handler = null;
    /**
     * Binds a drain handler which gets called with a byte offset that can be used to try a failed chunk write.
     * You MUST perform a write call inside the handler for uWS chunking to work properly.
     * You MUST return a boolean value indicating if the write was successful or not.
     * Note! This method can only provie drain events to a single handler at any given time which means If you call this method again with a different handler, it will stop providing drain events to the previous handler.
     *
     * @param {function(number):boolean} handler Synchronous callback only
     */
    drain(handler) {
        // Bind one native writable callback while allowing the active drain handler to change
        const is_first_time = this._drain_handler === null;

        this._drain_handler = handler;

        if (is_first_time)
            this._raw_response.onWritable((offset) => {
                try {
                    // A removed or completed handler has no pending native write to retry.
                    if (this.completed || typeof this._drain_handler !== 'function') return true;

                    const output = this._drain_handler(offset);
                    if (typeof output === 'boolean') return output;

                    this.throw(
                        new Error(
                            'HyperExpress: Response.drain(handler) -> handler must return a boolean value stating if the write was successful or not.'
                        )
                    );
                    return true;
                } catch (error) {
                    this.throw(error);
                    return true;
                }
            });

        return this;
    }

    /**
     * Begins chunked response writing and flushes the current status and headers immediately.
     * @returns {Response} Response (Chainable)
     */
    begin_write() {
        if (!this.completed) {
            if (this._cork && !this._corked) {
                this._corked = true;
                return this.atomic(() => this.begin_write());
            }

            this._streaming = true;
            this._initiate_response();
            this._raw_response.beginWrite();
        }
        return this;
    }

    /**
     * Writes the provided chunk to the client over uWS with backpressure handling if a callback is provided.
     *
     * @private
     * @param {String|Buffer|ArrayBuffer} chunk
     * @param {String} encoding
     * @param {Function} callback
     */
    _write(chunk, encoding, callback) {
        // Normalize _writev entry objects into the regular _write signature
        if (chunk.chunk && chunk.encoding) {
            const temp = chunk;
            chunk = temp.chunk;
            encoding = temp.encoding;

            // Preserve the iterator callback supplied by _writev when present
            if (!callback) callback = temp.callback;
        }

        if (!this.completed) {
            this._streaming = true;

            this._stream_chunk(chunk).then(callback).catch(callback);
        } else {
            callback();
        }
    }

    /**
     * Writes multiples chunks for the response to the client over uWS with backpressure handling if a callback is provided.
     *
     * @private
     * @param {Array<Buffer>} chunks
     * @param {Function} callback
     * @param {number} index
     */
    _writev(chunks, callback, index = 0) {
        this._write(chunks[index], null, (error) => {
            if (error) return callback(error);

            // Honor each entry callback before advancing the batch
            if (typeof chunks[index].callback == 'function') chunks[index].callback();

            if (index < chunks.length - 1) {
                this._writev(chunks, callback, index + 1);
            } else {
                callback();
            }
        });
    }

    /**
     * This method is used to end the current request and send response with specified body and headers.
     *
     * @param {String|Buffer|ArrayBuffer=} body Optional
     * @param {Boolean=} close_connection
     * @returns {Response}
     */
    send(body, close_connection) {
        if (!this.completed) {
            // Finish the Node writable through its _final hook so finish always precedes close.
            if (
                this._writable &&
                this._streaming &&
                !this._finalizing_writable &&
                !this._writable.writableEnded
            ) {
                if (body instanceof ArrayBuffer) body = Buffer.from(body);
                else if (ArrayBuffer.isView(body) && !Buffer.isBuffer(body))
                    body = Buffer.from(body.buffer, body.byteOffset, body.byteLength);
                this._writable.end(body);
                return this;
            }

            // Queue send() behind pending writable data so body order remains deterministic
            if (this._writable && this._writable.writableLength) {
                if (body !== undefined) this._writable.write(body);
                this._writable.end();
                return this;
            }

            // Async handlers must re-enter a corked uWS callback before writing
            if (this._cork && !this._corked) {
                this._corked = true;
                return this.atomic(() => this.send(body, close_connection));
            }

            this._initiate_response();

            if (!this._wrapped_request.received) {
                // uWS must finish receiving the request body before the response can be sent safely
                this._wrapped_request._body_parser_stop();

                if (!this._deferred_send) {
                    this._deferred_send = { body, close_connection };
                    this._wrapped_request.once('received', () => {
                        const deferred = this._deferred_send;
                        this._deferred_send = undefined;
                        if (deferred && !this.completed)
                            this.atomic(() => this.send(deferred.body, deferred.close_connection));
                    });
                }
                return this;
            }

            const custom_length = this._headers['content-length'];
            const content_length = Array.isArray(custom_length)
                ? custom_length[custom_length.length - 1]
                : custom_length;
            const status_code = this._status_code || 200;
            const is_head = this._wrapped_request.method === 'HEAD';
            const status_forbids_body =
                (status_code >= 100 && status_code < 200) || status_code === 204 || status_code === 304;

            // HEAD and specific status codes must never include response body bytes
            if (is_head || status_forbids_body) {
                let reported_length;
                if (content_length !== undefined && (is_head || status_code === 304)) {
                    reported_length = Number(content_length);
                } else if (is_head && body !== undefined) {
                    reported_length = Buffer.byteLength(body);
                }
                // Preserve the native optional-argument distinction. Passing explicit
                // undefined values is coerced to a zero length by some uWS binaries,
                // which would incorrectly add Content-Length: 0 to 204 responses.
                if (reported_length === undefined && close_connection === undefined) {
                    this._raw_response.endWithoutBody();
                } else {
                    this._raw_response.endWithoutBody(reported_length, close_connection);
                }

                // Preserve an explicitly declared length when no body bytes are supplied
            } else if (body === undefined && !this._streaming && content_length !== undefined) {
                this._raw_response.endWithoutBody(Number(content_length), close_connection);
            } else {
                this._raw_response.end(body, close_connection);
            }

            if (this._finalizing_writable) {
                this._complete_response({ emit_finish: false, emit_close: false });
            } else {
                this._complete_response();
            }
        }

        return this;
    }

    /**
     * Writes a given chunk to the client over uWS with the appropriate writing method.
     * Note! This method uses `uWS.tryEnd()` when a `total_size` is provided.
     * Note! This method uses `uWS.write()` when a `total_size` is not provided.
     *
     * @private
     * @param {Buffer} chunk
     * @param {Number=} total_size
     * @returns {Array<Boolean>} [sent, finished]
     */
    _uws_write_chunk(chunk, total_size) {
        // Known-size streams use tryEnd; unbounded streams use chunked write
        let sent, finished;
        if (total_size !== undefined) {
            const [ok, done] = this._raw_response.tryEnd(chunk, total_size);
            sent = ok;
            finished = done;
        } else {
            sent = this._raw_response.write(chunk);
            finished = false;
        }

        return [sent, finished];
    }

    /**
     * Stream an individual chunk to the client with backpressure handling.
     * Delivers with chunked transfer and without content-length header when no total_size is specified.
     * Delivers with chunk writes and content-length header when a total_size is specified.
     * Calls the `callback` once the chunk has been fully sent to the client.
     *
     * @private
     * @param {Buffer} chunk
     * @param {Number=} total_size
     * @returns {Promise}
     */
    _stream_chunk(chunk, total_size) {
        if (this.completed) return Promise.resolve();

        if (typeof chunk === 'string') chunk = Buffer.from(chunk);
        else if (chunk instanceof ArrayBuffer) chunk = Buffer.from(chunk);
        else if (ArrayBuffer.isView(chunk) && !Buffer.isBuffer(chunk))
            chunk = Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength);

        return new Promise((resolve, reject) => {
            let settled = false;
            const on_close = () => settle();
            const settle = (error) => {
                if (settled) return;
                settled = true;
                this.removeListener('close', on_close);
                if (error) reject(error);
                else resolve();
            };

            this.once('close', on_close);

            this.atomic(() => {
                try {
                    if (this.completed) return settle();

                    this._initiate_response();

                    // getWriteOffset is the body offset before this chunk's first tryEnd call.
                    const write_offset = this.write_offset;
                    const [sent, finished] = this._uws_write_chunk(chunk, total_size);
                    if (finished) {
                        this._complete_response();
                        return settle();
                    }
                    if (sent) return settle();

                    this.drain((offset) => {
                        try {
                            if (this.completed) {
                                settle();
                                return true;
                            }

                            // Chunked write owns its buffer already; its callback only waits for drain.
                            if (total_size === undefined) {
                                settle();
                                return true;
                            }

                            const consumed = Math.max(0, Math.min(chunk.byteLength, offset - write_offset));
                            const remaining = chunk.subarray(consumed);
                            const [flushed, done] = this._uws_write_chunk(remaining, total_size);
                            if (done) this._complete_response();
                            if (flushed || done) settle();
                            return flushed || done;
                        } catch (error) {
                            settle(error);
                            return true;
                        }
                    });
                } catch (error) {
                    settle(error);
                }
            });
        });
    }

    /**
     * This method is used to serve a readable stream as response body and send response.
     * By default, this method will use chunked encoding transfer to stream data.
     * If your use-case requires a content-length header, you must specify the total payload size.
     *
     * @param {stream.Readable} readable A Readable stream which will be consumed as response body
     * @param {Number=} total_size Total size of the Readable stream source in bytes (Optional)
     * @returns {Promise} a Promise which resolves once the stream has been fully consumed and response has been sent
     */
    async stream(readable, total_size) {
        if (!(readable instanceof stream.Readable)) {
            const error = new TypeError(
                'HyperExpress: Response.stream(readable, total_size) -> readable must be a Readable stream.'
            );
            this.throw(error);
            throw error;
        }
        if (
            total_size !== undefined &&
            (!Number.isSafeInteger(total_size) || total_size < 0)
        ) {
            const error = new RangeError(
                'HyperExpress: Response.stream(readable, total_size) -> total_size must be a non-negative safe integer.'
            );
            this.throw(error);
            throw error;
        }
        if (this.completed) return this;

        // Closing or completing the response must always settle the source side as well.
        this.once('close', () => {
            if (!readable.destroyed) readable.destroy();
        });

        try {
            if (total_size === 0) {
                this._initiate_response();
                this._raw_response.endWithoutBody(0);
                this._complete_response();
                return this;
            }

            let streamed_bytes = 0;
            for await (let chunk of readable) {
                if (this.completed) break;
                if (typeof chunk === 'string') chunk = Buffer.from(chunk);
                else if (chunk instanceof ArrayBuffer) chunk = Buffer.from(chunk);
                else if (ArrayBuffer.isView(chunk) && !Buffer.isBuffer(chunk))
                    chunk = Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength);

                streamed_bytes += chunk.byteLength;
                if (total_size !== undefined && streamed_bytes > total_size)
                    throw new Error(
                        `HyperExpress: Response stream exceeded its declared ${total_size} byte size.`
                    );

                await this._stream_chunk(chunk, total_size);
            }

            if (!this.completed) {
                if (total_size !== undefined) {
                    if (streamed_bytes === total_size)
                        await this._stream_chunk(Buffer.alloc(0), total_size);

                    if (!this.completed)
                        throw new Error(
                            `HyperExpress: Response stream closed after ${streamed_bytes} of ${total_size} declared bytes.`
                        );
                } else {
                    this.send();
                }
            }
            return this;
        } catch (error) {
            // Completion intentionally destroys the source and may surface as premature close
            // from the async iterator even though the native response finished successfully.
            if (this.completed) return this;
            if (!this.completed) this.close();
            throw error;
        }
    }

    /**
     * Instantly aborts/closes current request without writing a status response code.
     * Use this to instantly abort a request where a proper response with an HTTP status code is not necessary.
     */
    close() {
        if (!this.completed) {
            const error = new Error('HyperExpress: Request was closed before its lifecycle completed.');
            error.code = 'ERR_REQUEST_CLOSED';
            this._complete_response({ error, emit_finish: false });
            this._raw_response.close();
        }
        return this;
    }

    /**
     * This method is used to redirect an incoming request to a different url.
     *
     * @param {String} url Redirect URL
     * @returns {Response|Boolean} Response (Chainable) or false if already completed
     */
    redirect(url) {
        if (!this.completed) return this.status(302).header('location', url).send();
        return false;
    }

    /**
     * This method is an alias of send() method except it accepts an object and automatically stringifies the passed payload object.
     *
     * @param {Object} body JSON body
     * @returns {Response} Response (Chainable)
     */
    json(body) {
        return this.header('content-type', 'application/json; charset=utf-8', true).send(
            JSON.stringify(body)
        );
    }

    /**
     * This method is an alias of send() method except it accepts an object
     * and automatically stringifies the passed payload object with a callback name.
     * Note! This method uses 'callback' query parameter by default but you can specify 'name' to use something else.
     *
     * @param {Object} body
     * @param {String=} name
     * @returns {Response} Response (Chainable)
     */
    jsonp(body, name) {
        const query_parameters = this._wrapped_request.query_parameters;
        const callback = query_parameters['callback'] ?? name;

        // Only JavaScript identifier paths are valid callbacks. Invalid or absent callback
        // values fall back to regular JSON instead of becoming executable source text.
        if (
            typeof callback !== 'string' ||
            !/^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*$/.test(callback)
        )
            return this.json(body);

        const payload = JSON.stringify(body)
            .replace(/</g, '\\u003c')
            .replace(/\u2028/g, '\\u2028')
            .replace(/\u2029/g, '\\u2029');
        return this.header('content-type', 'application/javascript; charset=utf-8', true).send(
            `${callback}(${payload})`
        );
    }

    /**
     * This method is an alias of send() method except it automatically sets
     * html as the response content type and sends provided html response body.
     *
     * @param {String} body
     * @returns {Response} Response (Chainable)
     */
    html(body) {
        return this.header('content-type', 'text/html; charset=utf-8', true).send(body);
    }

    /**
     * @private
     * Sends file content with appropriate content-type header based on file extension from LiveFile.
     *
     * @param {LiveFile} live_file
     * @param {function(Object):void} callback
     * @returns {Promise<Response>}
     */
    async _send_file(live_file, callback) {
        if (!live_file.is_ready) await live_file.ready();

        this.type(live_file.extension);

        this.send(live_file.buffer);

        // Expose the server-owned cache asynchronously so callers can expire entries.
        if (callback) setImmediate(() => callback(this.app._file_pool));

        return this;
    }

    /**
     * This method is an alias of send() method except it sends the file at specified path.
     * This method automatically writes the appropriate content-type header if one has not been specified yet.
     * This method also maintains its own cache pool in memory allowing for fast performance.
     * Avoid using this method to a send a large file as it will be kept in memory.
     *
     * @param {String} path
     * @param {function(Object):void=} callback Executed after file has been served with the parameter being the cache pool.
     * @returns {Promise<Response>}
     */
    file(path, callback) {
        const cache_key = Path.resolve(path);
        const file_pool = this.app._file_pool;
        if (file_pool[cache_key])
            return this._send_file(file_pool[cache_key], callback).catch((error) => this.throw(error));

        const live_file = new LiveFile({
            path: cache_key,
        });
        file_pool[cache_key] = live_file;

        // Remove unavailable files from cache so a future request can retry loading them
        live_file.on('error', () => {
            if (file_pool[cache_key] === live_file) delete file_pool[cache_key];
        });

        return this._send_file(live_file, callback).catch((error) => this.throw(error));
    }

    /**
     * Writes appropriate headers to signify that file at path has been attached.
     *
     * @param {String} path
     * @param {String=} name
     * @returns {Response}
     */
    attachment(path, name) {
        if (path == undefined) return this.header('Content-Disposition', 'attachment');

        const requested_name = name == null ? path : name;
        const final_name = String(requested_name).split(/[\\/]/).pop();
        const safe_name = final_name.replace(/[\u0000-\u001f\u007f"\\]/g, '_') || 'download';
        const extension = Path.extname(safe_name).slice(1);
        this.header('content-disposition', `attachment; filename="${safe_name}"`);
        if (extension) this.type(extension);
        return this;
    }

    /**
     * Writes appropriate attachment headers and sends file content for download on user browser.
     * This method combined Response.attachment() and Response.file() under the hood, so be sure to follow the same guidelines for usage.
     *
     * @param {String} path
     * @param {String=} filename
     * @returns {Promise<Response>}
     */
    download(path, filename) {
        return this.attachment(path, filename).file(path);
    }

    #thrown = false;
    /**
     * This method allows you to throw an error which will be caught by the global error handler.
     *
     * @param {Error} error
     * @returns {Response}
     */
    throw(error) {
        // Body limit failures are lifecycle control flow, not application errors. Preserve the
        // 413 response even when an awaiting route parser observes the rejected body promise.
        if (error instanceof Error && error.code === 'ERR_BODY_LIMIT') {
            if (!this.completed) this.status(413).send();
            return this;
        }

        // Only the first lifecycle error reaches the global handler
        if (this.#thrown) return this;
        this.#thrown = true;

        // Normalize non-Error throws for a consistent handler contract
        if (!(error instanceof Error)) error = new Error(`ERR_CAUGHT_NON_ERROR_TYPE: ${error}`);

        this.route.handle_error(this._wrapped_request, this, error);
        return this;
    }

    /* HyperExpress Properties */

    /**
     * Returns the request locals for this request.
     * @returns {Object.<string, any>}
     */
    get locals() {
        if (!this._locals) this._locals = {};
        return this._locals;
    }

    /**
     * Returns the underlying raw uWS.Response object.
     * Note! Utilizing any of uWS.Response's methods after response has been sent will result in an invalid discarded access error.
     * @returns {import('uWebSockets.js').Response}
     */
    get raw() {
        return this._raw_response;
    }

    /**
     * Returns the HyperExpress.Server instance this Response object originated from.
     *
     * @returns {import('../Server.js')}
     */
    get app() {
        return this.route.app;
    }

    /**
     * Returns current state of request in regards to whether the source is still connected.
     * @returns {Boolean}
     */
    get aborted() {
        return this.completed;
    }

    /**
     * Upgrade socket context for upgrade requests.
     * @returns {import('uWebSockets.js').ux_socket_context}
     */
    get upgrade_socket() {
        return this._upgrade_socket;
    }

    /**
     * Returns a "Server-Sent Events" connection object to allow for SSE functionality.
     * This property will only be available for GET requests as per the SSE specification.
     *
     * @returns {SSEventStream=}
     */
    get sse() {
        // SSE is valid only for GET and shares this response's lifecycle state
        if (this._wrapped_request.method === 'GET') {
            if (this._sse === undefined) {
                this._sse = new SSEventStream();
                this._sse._response = this;
            }

            return this._sse;
        }
    }

    /**
     * Returns the current response body content write offset in bytes.
     * Use in conjunction with the drain() offset handler to retry writing failed chunks.
     * Note! This method will return `-1` after the Response has been completed and the connection has been closed.
     * @returns {Number}
     */
    get write_offset() {
        return this.completed ? -1 : this._raw_response.getWriteOffset();
    }

    /**
     * Throws a descriptive error when an unsupported ExpressJS property/method is invoked.
     * @private
     * @param {String} name
     */
    _throw_unsupported(name) {
        throw new Error(
            `ERR_INCOMPATIBLE_CALL: One of your middlewares or route logic tried to call Response.${name} which is unsupported with HyperExpress.`
        );
    }
}

// Store the descriptors of the original HyperExpress.Response class
const descriptors = Object.getOwnPropertyDescriptors(Response.prototype);

// Inherit the compatibility classes
inherit_prototype({
    from: [NodeResponse.prototype, ExpressResponse.prototype],
    to: Response.prototype,
    method: (type, name, original) => {
        const passthrough = function () {
            return original.apply(this, arguments);
        };
        return passthrough;
    },
});

// Inherit the stream.Writable prototype and lazy initialize the stream on first call to any inherited method
inherit_prototype({
    from: stream.Writable.prototype,
    to: Response.prototype,
    override: (name) => '_super_' + name, // Prefix all overrides with _super_
    method: (type, name, original) => {
        const passthrough = function () {
            // Create the Node writable only when an inherited stream API is first used
            if (this._writable === null) {
                this._writable = new stream.Writable(this.route.streaming.writable);
                this._piped_sources = new Map();

                // Preserve the Response lifecycle as the native write implementation context
                this._writable._write = descriptors['_write'].value.bind(this);
                this._writable._writev = descriptors['_writev'].value.bind(this);
                this._writable._final = (callback) => {
                    this._finalizing_writable = true;
                    try {
                        this.send();
                        callback();
                    } catch (error) {
                        callback(error);
                    } finally {
                        this._finalizing_writable = false;
                    }
                };

                // Node's pipe() unpipes a source when its destination closes, but does not destroy
                // the source. Track piped sources so aborted responses cannot leak file handles or
                // leave producers paused forever. Source failures are contained by the route handler.
                this._writable.on('pipe', (source) => {
                    const on_error = (error) => {
                        this._piped_sources.delete(source);
                        if (!this.completed) {
                            this.throw(error);
                            if (!this.completed) this.close();
                        }
                    };
                    this._piped_sources.set(source, on_error);
                    source.once('error', on_error);
                });
                this._writable.on('unpipe', (source) => {
                    const on_error = this._piped_sources.get(source);
                    if (on_error) source.removeListener('error', on_error);
                    this._piped_sources.delete(source);
                });

                // Node emits finish and then close after _final's callback. Internal listeners
                // only mirror state; user listeners receive the native Writable ordering once.
                this._writable.once('finish', () => {
                    this._finish_emitted = true;
                });
                this._writable.once('close', () => {
                    this._close_emitted = true;
                    for (const [source, on_error] of this._piped_sources) {
                        source.removeListener('error', on_error);
                        if (!source.destroyed) source.destroy();
                    }
                    this._piped_sources.clear();
                });
            }

            return original.apply(this._writable, arguments);
        };

        return passthrough;
    },
});

module.exports = Response;
