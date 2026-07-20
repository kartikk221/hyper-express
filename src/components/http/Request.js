'use strict';
const util = require('util');
const cookie = require('cookie');
const stream = require('stream');
const busboy = require('busboy');
const querystring = require('querystring');
const signature = require('cookie-signature');
const UTF8_DECODER = new util.TextDecoder('utf-8');

const MultipartField = require('../plugins/MultipartField.js');
const NodeRequest = require('../compatibility/NodeRequest.js');
const ExpressRequest = require('../compatibility/ExpressRequest.js');
const {
    inherit_prototype,
    array_buffer_to_string,
    copy_array_buffer_to_uint8array,
} = require('../../shared/operators.js');

class Request {
    _locals;
    _paused = false;
    _request_ended = false;
    _raw_request = null;
    _raw_response = null;
    _method = '';
    _url = '';
    _path = '';
    _query = '';
    _remote_ip;
    _remote_proxy_ip;
    _remote_port;
    _remote_proxy_port;
    _socket_ip;
    _socket_port;
    _cookies;
    _path_parameters;
    _query_parameters;

    /**
     * The route that this request is being handled by.
     */
    route = null;

    /**
     * Underlying lazy initialized readable body stream.
     * @private
     */
    _readable = null;

    /**
     * Returns whether all expected incoming request body chunks have been received.
     * @returns {Boolean}
     */
    received = true; // Assume there is no body data to stream

    /**
     * Returns request headers from incoming request.
     * @returns {Object.<string, string>}
     */
    headers = Object.create(null);

    /**
     * Creates a new HyperExpress request instance that wraps a uWS.HttpRequest instance.
     *
     * @param {import('../router/Route.js')} route
     * @param {import('uWebSockets.js').HttpRequest} raw_request
     */
    constructor(route, raw_request) {
        this.route = route;
        this._raw_request = raw_request;

        // Cache required values because uWS deallocates HttpRequest after this synchronous callback
        this._query = raw_request.getQuery();
        this._path = route.path || raw_request.getUrl();
        this._method = route.method !== 'ANY' ? route.method : raw_request.getMethod();

        raw_request.forEach((key, value) => (this.headers[key] = value));

        const num_path_parameters = route.path_parameters_key.length;
        if (num_path_parameters) {
            this._path_parameters = Object.create(null);
            for (let i = 0; i < num_path_parameters; i++) {
                const parts = route.path_parameters_key[i];
                this._path_parameters[parts[0]] = raw_request.getParameter(parts[1]);
            }
        }
    }

    /* HyperExpress Methods */

    /**
     * Returns the raw uWS.HttpRequest instance.
     * Note! This property is unsafe and should not be used unless you have no asynchronous code or you are accessing from the first top level synchronous middleware before any asynchronous code.
     * @returns {import('uWebSockets.js').HttpRequest}
     */
    get raw() {
        return this._raw_request;
    }

    /**
     * Marks the wrapped native request inaccessible after its response lifecycle completes.
     * @private
     * @returns {Boolean} Whether this call transitioned the lifecycle.
     */
    _mark_ended() {
        if (this._request_ended) return false;
        this._request_ended = true;
        return true;
    }

    /**
     * Captures connection metadata while uWS.HttpResponse is still valid. uWebSockets.js
     * invalidates the response after end, abort, close, tryEnd completion, or upgrade, so
     * none of these values may be resolved lazily from the native object.
     * @private
     */
    _capture_connection_metadata() {
        if (this._socket_ip !== undefined) return false;
        if (this._request_ended)
            throw new Error(
                'HyperExpress.Request connection metadata cannot be captured after the Request/Response has ended.'
            );

        this._socket_ip = array_buffer_to_string(this._raw_response.getRemoteAddressAsText());
        this._socket_port = this._raw_response.getRemotePort();
        this._remote_proxy_ip = array_buffer_to_string(
            this._raw_response.getProxiedRemoteAddressAsText()
        );
        this._remote_proxy_port = this._raw_response.getProxiedRemotePort();

        const x_forwarded_for = this.get('X-Forwarded-For');
        const trust_proxy = this.route.app._options.trust_proxy;
        const forwarded_ip = x_forwarded_for?.split(',')[0].trim();
        this._remote_ip = trust_proxy && forwarded_ip ? forwarded_ip : this._socket_ip;
        this._remote_port = this._socket_port;
        return true;
    }

    /**
     * Pauses only native body intake while leaving Node's Readable demand machinery active.
     * @private
     * @returns {Boolean} Whether native intake transitioned to paused.
     */
    _pause_native() {
        if (this._request_ended || this._paused) return false;
        this._paused = true;
        this._raw_response.pause();
        return true;
    }

    /**
     * Pauses the current request and flow of incoming body data.
     * @returns {Request}
     */
    pause() {
        // Explicit user pauses affect both native intake and the public Readable facade.
        this._pause_native();
        if (this._readable) return this._super_pause();
        return this;
    }

    /**
     * Resumes the current request and flow of incoming body data.
     * @returns {Request}
     */
    resume() {
        // Mirror resume state so uWS receives each transition only once
        if (this._paused) {
            this._paused = false;
            if (!this._request_ended && !this.received) this._raw_response.resume();
            if (this._readable) this._super_resume();
        }
        return this;
    }

    /**
     * Pipes the request body stream data to the provided destination stream with the provided set of options.
     *
     * @param {stream.Writable} destination
     * @param {stream.WritableOptions} options
     * @returns {Request}
     */
    pipe(destination, options) {
        // Piping consumes the body, so resume after binding the destination
        this._super_pipe(destination, options);
        this._super_resume();
        return this;
    }

    /**
     * Securely signs a value with provided secret and returns the signed value.
     *
     * @param {String} string
     * @param {String} secret
     * @returns {String} String OR undefined
     */
    sign(string, secret) {
        return signature.sign(string, secret);
    }

    /**
     * Securely unsigns a value with provided secret and returns its original value upon successful verification.
     *
     * @param {String} signed_value
     * @param {String} secret
     * @returns {String=} String OR undefined
     */
    unsign(signed_value, secret) {
        let unsigned_value = signature.unsign(signed_value, secret);
        if (unsigned_value !== false) return unsigned_value;
    }

    /* Body Parsing */
    _body_parser_mode = 0; // 0 = awaiting a consumer, 1 = internal buffering, 2 = public streaming
    _body_limit_bytes = 0;
    _body_received_bytes = 0;
    _body_expected_bytes = -1; // -1 means native body reception has not been initialized
    _body_parser_flushing = false;
    _body_chunked_transfer = false;
    _body_parser_buffered;
    _body_parser_passthrough;
    _body_parser_failure;
    _body_parser_reject;

    /**
     * Begins parsing incoming request data and binds the sole native body consumer.
     * @private
     * @param {import('./Response.js')} response
     * @param {Number} limit_bytes
     * @returns {Boolean}
     */
    _body_parser_run(response, limit_bytes) {
        const is_first_run = this._body_expected_bytes === -1;
        const content_length = Number(this.headers['content-length']);
        const transfer_encoding = this.headers['transfer-encoding'];
        const has_transfer_encoding =
            typeof transfer_encoding === 'string' && transfer_encoding.toLowerCase() !== 'identity';
        const declared_length =
            Number.isSafeInteger(content_length) && content_length > 0 ? content_length : 0;

        this._body_limit_bytes = limit_bytes;

        if (is_first_run) {
            this._body_chunked_transfer = has_transfer_encoding;
            this._body_expected_bytes = has_transfer_encoding ? 0 : declared_length;

            if (declared_length > 0 || has_transfer_encoding) {
                this.received = false;
                this._body_parser_buffered = [];

                // A second consumer such as collectBody would race buffered, streaming, and
                // multipart consumers, so onDataV2 remains the single native receiver.
                this._raw_response.onDataV2((chunk, max_remaining_body_length) => {
                    try {
                        this._body_parser_on_chunk(response, chunk, max_remaining_body_length);
                    } catch (error) {
                        // Node Readable listeners run synchronously from push(). Contain their
                        // exceptions so none can unwind through uWS's native body callback.
                        const received = max_remaining_body_length === 0n;
                        if (received) this.received = true;
                        this._body_parser_stop(error);
                        response.throw(error);
                        if (received) {
                            try {
                                this.emit('received', this._body_received_bytes);
                            } catch (secondary_error) {
                                response.throw(secondary_error);
                            }
                        }
                    }
                });
            }
        }

        if (!this.received) this._body_parser_enforce_limit(response);
        return !this._body_parser_flushing;
    }

    /**
     * Stops forwarding native body data to consumers while allowing uWS to finish intake.
     * @private
     * @param {*=} error
     */
    _body_parser_stop(error) {
        if (error && !this._body_parser_failure) {
            this._body_parser_failure = error;

            if (this._body_parser_reject) {
                const reject = this._body_parser_reject;
                this._body_parser_reject = undefined;
                reject(error);
            }
        }

        if (this._body_expected_bytes === -1 || this._body_parser_flushing) return;
        this._body_parser_flushing = true;

        if (this._readable && !this._readable.readableEnded && !this._readable.destroyed) {
            if (error instanceof Error && this._readable.listenerCount('error')) {
                this._readable.destroy(error);
            } else {
                this.push(null);
            }
        }

        // Paused incomplete input must be drained, but native resume is unsafe after completion.
        if (!this.received && this._paused) this.resume();
    }

    /**
     * Enforces both the declared/hinted size and bytes observed so far.
     * @private
     * @param {import('./Response.js')} response
     * @returns {Boolean}
     */
    _body_parser_enforce_limit(response) {
        const incoming_bytes = Math.max(this._body_received_bytes, this._body_expected_bytes);
        if (incoming_bytes > this._body_limit_bytes) {
            const error = new RangeError(
                `HyperExpress: Request body exceeded the ${this._body_limit_bytes} byte limit.`
            );
            error.code = 'ERR_BODY_LIMIT';
            this._body_parser_stop(error);

            if (!response.initiated) {
                if (this.route.app._options.fast_abort) {
                    response.close();
                } else if (this.received) {
                    response.status(413).send();
                }
            }
            return true;
        }
        return false;
    }

    /**
     * Processes a native onDataV2 callback.
     * @private
     * @param {import('./Response.js')} response
     * @param {ArrayBuffer} chunk
     * @param {bigint} max_remaining_body_length
     */
    _body_parser_on_chunk(response, chunk, max_remaining_body_length) {
        const is_last = max_remaining_body_length === 0n;
        if (!chunk.byteLength && !is_last) return;

        this._body_received_bytes += chunk.byteLength;

        // uWS reports UINT64_MAX for chunked bodies until their final callback. Fixed bodies
        // receive an exact remaining-length hint that can safely drive allocation and limits.
        if (max_remaining_body_length !== 0xffffffffffffffffn) {
            const maximum_total = BigInt(this._body_received_bytes) + max_remaining_body_length;
            if (maximum_total <= BigInt(Number.MAX_SAFE_INTEGER))
                this._body_expected_bytes = Math.max(
                    this._body_expected_bytes,
                    Number(maximum_total)
                );
        }

        if (!this._body_parser_flushing && !this._body_parser_enforce_limit(response)) {
            switch (this._body_parser_mode) {
                case 0:
                    // onDataV2 buffers are volatile until the terminal callback, so retain copies.
                    this._body_parser_buffered.push(copy_array_buffer_to_uint8array(chunk));
                    if (!is_last && this._body_received_bytes > this.app._options.max_body_buffer)
                        this._pause_native();
                    break;
                case 1:
                    this._body_parser_passthrough(new Uint8Array(chunk), is_last);
                    break;
                case 2:
                    // Spurious callbacks can arrive after pause; every one still belongs to the body.
                    if (!this.push(copy_array_buffer_to_uint8array(chunk)) && !is_last)
                        this._pause_native();
                    if (is_last) this.push(null);
                    break;
            }
        }

        if (is_last) {
            this.received = true;
            if (this._readable) this.emit('received', this._body_received_bytes);

            // Complete a deferred non-fast 413 only after uWS has consumed the request body.
            if (this._body_parser_flushing) this._body_parser_enforce_limit(response);
        }
    }

    /** @private */
    _body_parser_flush_buffered() {
        if (this._body_parser_buffered) {
            switch (this._body_parser_mode) {
                case 1:
                    for (let i = 0; i < this._body_parser_buffered.length; i++) {
                        this._body_parser_passthrough(
                            this._body_parser_buffered[i],
                            i === this._body_parser_buffered.length - 1 ? this.received : false
                        );
                    }
                    break;
                case 2:
                    for (const chunk of this._body_parser_buffered) this.push(Buffer.from(chunk));
                    if (this.received) this.push(null);
                    break;
            }
        }

        this._body_parser_buffered = null;
        // resume() only calls native resume while the body is incomplete.
        this.resume();
    }

    /** @private */
    _body_parser_stream_init() {
        this._body_parser_mode = 2;
        this._readable._read = () => this.resume();
        this._body_parser_flush_buffered();
    }

    _received_data_promise;
    /**
     * Returns all received body data in one stable Uint8Array.
     * @private
     * @returns {Promise<Uint8Array>}
     */
    _body_parser_get_received_data() {
        if (this._received_data_promise) return this._received_data_promise;

        if (this._body_parser_failure) {
            this._received_data_promise = Promise.reject(this._body_parser_failure);
            return this._received_data_promise;
        }

        if (!this._body_chunked_transfer && this._body_expected_bytes <= 0) {
            this._received_data_promise = Promise.resolve(new Uint8Array(0));
            return this._received_data_promise;
        }

        this._received_data_promise = new Promise((resolve, reject) => {
            this._body_parser_reject = reject;

            let buffer =
                this._body_expected_bytes > 0
                    ? new Uint8Array(this._body_expected_bytes)
                    : undefined;
            let offset = 0;
            let chunks = buffer ? null : [];

            this._body_parser_passthrough = (chunk, is_last) => {
                if (this._body_parser_failure) return;

                const view = chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk);
                if (buffer) {
                    const required_size = offset + view.byteLength;
                    if (required_size > buffer.byteLength) {
                        const expanded = new Uint8Array(
                            Math.max(required_size, this._body_expected_bytes)
                        );
                        expanded.set(buffer.subarray(0, offset));
                        buffer = expanded;
                    }
                    buffer.set(view, offset);
                } else if (view.byteLength) {
                    chunks.push(Uint8Array.from(view));
                }
                offset += view.byteLength;

                if (is_last) {
                    if (!buffer) {
                        buffer = new Uint8Array(offset);
                        let chunk_offset = 0;
                        for (const buffered_chunk of chunks) {
                            buffer.set(buffered_chunk, chunk_offset);
                            chunk_offset += buffered_chunk.byteLength;
                        }
                        chunks = null;
                    }

                    this._body_parser_reject = undefined;
                    resolve(buffer.subarray(0, offset));
                }
            };

            this._body_parser_mode = 1;
            this._body_parser_flush_buffered();
        });
        return this._received_data_promise;
    }

    _body_buffer;
    _buffer_promise;

    /** @private */
    async _parse_buffer() {
        const raw = await this._body_parser_get_received_data();
        this._body_buffer = Buffer.from(raw);
        this._buffer_promise = undefined;
        return this._body_buffer;
    }

    /**
     * Returns the incoming request body as a Buffer.
     * @returns {Promise<Buffer>}
     */
    buffer() {
        if (this._body_buffer !== undefined) return Promise.resolve(this._body_buffer);
        if (!this._buffer_promise) this._buffer_promise = this._parse_buffer();
        return this._buffer_promise;
    }

    /**
     * @private
     * @param {Uint8Array} uint8
     * @returns {string}
     */
    _uint8_to_string(uint8) {
        return UTF8_DECODER.decode(uint8);
    }

    _body_text;
    _text_promise;

    /** @private */
    async _parse_text() {
        const raw = await this._body_parser_get_received_data();
        this._body_text = this._uint8_to_string(raw);
        this._text_promise = undefined;
        return this._body_text;
    }

    /**
     * Downloads and parses the request body as a String.
     * @returns {Promise<string>}
     */
    text() {
        if (this._body_text !== undefined) return Promise.resolve(this._body_text);
        if (!this._text_promise) this._text_promise = this._parse_text();
        return this._text_promise;
    }

    _body_json;
    _json_promise;

    /** @private */
    async _parse_json(default_value) {
        const raw = await this._body_parser_get_received_data();
        try {
            this._body_json = JSON.parse(this._uint8_to_string(raw));
        } catch (error) {
            if (default_value) {
                this._body_json = default_value;
            } else {
                throw error;
            }
        }

        this._json_promise = undefined;
        return this._body_json;
    }

    /**
     * Downloads and parses the request body as JSON.
     * A falsey default_value causes invalid JSON to reject rather than use a fallback.
     *
     * @param {Any=} default_value Default: {}
     * @returns {Promise<Record>}
     */
    json(default_value = {}) {
        if (this._body_json !== undefined) return Promise.resolve(this._body_json);
        if (!this._json_promise) this._json_promise = this._parse_json(default_value);
        return this._json_promise;
    }

    _body_urlencoded;
    _urlencoded_promise;

    /** @private */
    async _parse_urlencoded() {
        const raw = await this._body_parser_get_received_data();
        this._body_urlencoded = querystring.parse(this._uint8_to_string(raw));
        this._urlencoded_promise = undefined;
        return this._body_urlencoded;
    }

    /**
     * Parses the incoming body as URL-encoded values.
     * @returns {Promise<Record>}
     */
    urlencoded() {
        if (this._body_urlencoded !== undefined) return Promise.resolve(this._body_urlencoded);
        if (!this._urlencoded_promise) this._urlencoded_promise = this._parse_urlencoded();
        return this._urlencoded_promise;
    }

    /**
     * @typedef {function(MultipartField):void} SyncMultipartHandler
     */

    /**
     * @typedef {function(MultipartField):Promise<void>} AsyncMultipartHandler
     */

    /**
     * @typedef {('PARTS_LIMIT_REACHED'|'FILES_LIMIT_REACHED'|'FIELDS_LIMIT_REACHED')} MultipartLimitReject
     */

    /**
     * Downloads and parses incoming body as a multipart form.
     * This allows for easy consumption of fields, values and files.
     *
     * @param {busboy.BusboyConfig|SyncMultipartHandler|AsyncMultipartHandler} options
     * @param {(SyncMultipartHandler|AsyncMultipartHandler)=} handler
     * @returns {Promise<void>} Resolves after all multipart handlers and file streams settle.
     */
    multipart(options, handler) {
        // Normalize the multipart(handler) overload
        if (typeof options == 'function') {
            handler = options;
            options = {};
        }

        // Avoid mutating caller-owned Busboy options
        options = Object.assign({}, options);

        if (!options.headers) options.headers = this.headers;

        if (typeof handler !== 'function')
            throw new Error('HyperExpress: Request.multipart(handler) -> handler must be a Function.');

        // Skip parsing when there is no body or multipart content type
        if (this.received && this._body_received_bytes === 0) return Promise.resolve();

        const content_type = this.headers['content-type'];
        if (typeof content_type !== 'string' || !/^(multipart\/.+);(.*)$/i.test(content_type))
            return Promise.resolve();

        const reference = this;
        return new Promise((resolve, reject) => {
            const uploader = busboy(options);

            let settled = false;
            let queue = Promise.resolve();

            const finish = (error) => {
                if (settled) return;
                settled = true;

                if (error) {
                    reference._body_parser_stop(error);
                    if (!uploader.destroyed) uploader.destroy();
                    reject(error);
                } else {
                    // Success deliberately performs no native pause/resume after body completion.
                    resolve();
                }
            };

            uploader.once('error', finish);

            // Preserve limit failures as the public string error constants
            uploader.once('partsLimit', () => finish('PARTS_LIMIT_REACHED'));
            uploader.once('filesLimit', () => finish('FILES_LIMIT_REACHED'));
            uploader.once('fieldsLimit', () => finish('FIELDS_LIMIT_REACHED'));

            const on_field = (name, value, info) => {
                if (value instanceof stream.Readable) value.once('error', finish);

                // Serialize all handlers and assimilate arbitrary thenables.
                queue = queue.then(async () => {
                    if (settled) return;

                    const field = new MultipartField(name, value, info);
                    await Promise.resolve(handler(field));

                    if (field.file && !field.file.stream.readableEnded) {
                        await new Promise((resolve_file, reject_file) => {
                            const file_stream = field.file.stream;
                            const cleanup = () => {
                                file_stream.off('end', on_end);
                                file_stream.off('close', on_close);
                                file_stream.off('error', on_error);
                            };
                            const on_end = () => {
                                cleanup();
                                resolve_file();
                            };
                            const on_close = () => {
                                cleanup();
                                if (file_stream.readableEnded) resolve_file();
                                else reject_file(new Error('HyperExpress: Multipart file stream closed early.'));
                            };
                            const on_error = (error) => {
                                cleanup();
                                reject_file(error);
                            };

                            file_stream.once('end', on_end);
                            file_stream.once('close', on_close);
                            file_stream.once('error', on_error);
                            file_stream.resume();
                        });
                    }
                });
                queue.catch(finish);
            };

            uploader.on('field', on_field);
            uploader.on('file', on_field);

            uploader.once('close', () => queue.then(() => finish()).catch(finish));

            reference.pipe(uploader);
            reference.once('error', finish);
        });
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
     * Returns the HyperExpress.Server instance this Request object originated from.
     * @returns {import('../Server.js')}
     */
    get app() {
        return this.route.app;
    }

    /**
     * Returns whether this request is in a paused state and thus not consuming any body chunks.
     * @returns {Boolean}
     */
    get paused() {
        return this._paused;
    }

    /**
     * Returns HTTP request method for incoming request in uppercase.
     * @returns {String}
     */
    get method() {
        const uppercase = this._method.toUpperCase();

        // uWS exposes DELETE as DEL
        return uppercase === 'DEL' ? 'DELETE' : uppercase;
    }

    /**
     * Returns full request url for incoming request (path + query).
     * @returns {String}
     */
    get url() {
        if (this._url) return this._url;

        this._url = this._path + (this._query ? '?' + this._query : '');
        return this._url;
    }

    /**
     * Sets full request url for incoming request (path + query).
     * @param {String} value
     */
    set url(value) {
        const query_index = value.indexOf('?');
        this._path = query_index === -1 ? value : value.substring(0, query_index);
        this._query = query_index === -1 ? '' : value.substring(query_index + 1);

        // Invalidate values derived from the previous URL
        this._url = value;
        this._query_parameters = undefined;
    }

    /**
     * Returns path for incoming request.
     * @returns {String}
     */
    get path() {
        return this._path;
    }

    /**
     * Returns query for incoming request without the '?'.
     * @returns {String}
     */
    get path_query() {
        return this._query;
    }

    /**
     * Returns request cookies from incoming request.
     * @returns {Object.<string, string>}
     */
    get cookies() {
        if (this._cookies) return this._cookies;

        const header = this.headers['cookie'];
        this._cookies = header ? cookie.parse(header) : {};

        return this._cookies;
    }

    /**
     * Returns path parameters from incoming request.
     * @returns {Object.<string, string>}
     */
    get path_parameters() {
        return this._path_parameters || {};
    }

    /**
     * Returns query parameters from incoming request.
     * @returns {Object.<string, string>}
     */
    get query_parameters() {
        if (this._query_parameters) return this._query_parameters;

        this._query_parameters = querystring.parse(this._query);
        return this._query_parameters;
    }

    /**
     * Sets query parameters for incoming request.
     * @param {Object.<string, string>} value
     */
    set query_parameters(value) {
        this._query_parameters = value;
    }

    /**
     * Returns remote IP address in string format from incoming request.
     * @returns {String}
     */
    get ip() {
        if (this._remote_ip === undefined) this._capture_connection_metadata();
        return this._remote_ip;
    }

    /**
     * Returns remote proxy IP address in string format from incoming request.
     * @returns {String}
     */
    get proxy_ip() {
        if (this._remote_proxy_ip === undefined) this._capture_connection_metadata();
        return this._remote_proxy_ip;
    }

    /**
     * Returns the remote TCP port for the incoming request.
     * @returns {Number}
     */
    get port() {
        if (this._remote_port === undefined) this._capture_connection_metadata();
        return this._remote_port;
    }

    /**
     * Returns the remote TCP port reported by a PROXY Protocol v2 compatible proxy.
     * @returns {Number}
     */
    get proxy_port() {
        if (this._remote_proxy_port === undefined) this._capture_connection_metadata();
        return this._remote_proxy_port;
    }

    /**
     * Throws an ERR_INCOMPATIBLE_CALL error with the provided property/method name.
     * @private
     */
    _throw_unsupported(name) {
        throw new Error(
            `ERR_INCOMPATIBLE_CALL: One of your middlewares or route logic tried to call Request.${name} which is unsupported with HyperExpress.`
        );
    }
}

// Inherit the compatibility classes
inherit_prototype({
    from: [NodeRequest.prototype, ExpressRequest.prototype],
    to: Request.prototype,
    method: (type, name, original) => {
        return function () {
            return original.apply(this, arguments);
        };
    },
});

// Inherit the stream.Readable prototype and lazy initialize the stream on first call to inherited methods
inherit_prototype({
    from: stream.Readable.prototype,
    to: Request.prototype,
    override: (name) => '_super_' + name, // Prefix all overrides with _super_
    method: (type, name, original) => {
        const passthrough = function () {
            // Create the Node readable only when an inherited stream API is first used
            if (this._readable === null) {
                this._readable = new stream.Readable(this.route.streaming.readable);

                this._body_parser_stream_init();
            }

            return original.apply(this._readable, arguments);
        };

        return passthrough;
    },
});

module.exports = Request;
