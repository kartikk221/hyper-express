'use strict';
const util = require('util');
const cookie = require('cookie');
const stream = require('stream');
const busboy = require('busboy');
const querystring = require('querystring');
const signature = require('cookie-signature');

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
    _remote_ip = '';
    _remote_proxy_ip = '';
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
    headers = {};

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
            this._path_parameters = {};
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
     * Pauses the current request and flow of incoming body data.
     * @returns {Request}
     */
    pause() {
        // Mirror pause state so uWS receives each transition only once
        if (!this._paused) {
            this._paused = true;
            this._raw_response.pause();
            if (this._readable) return this._super_pause();
        }
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
            this._raw_response.resume();
            if (this._readable) return this._super_resume();
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
        return this._super_resume();
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
    _body_parser_mode = 0; // 0 = none (awaiting mode), 1 = buffering (internal use), 2 = streaming (external use)
    _body_limit_bytes = 0;
    _body_received_bytes = 0;
    _body_expected_bytes = -1; // Sentinel ensuring uWS.onData() is bound only once
    _body_parser_flushing = false;
    _body_chunked_transfer = false;
    _body_parser_buffered; // Stable chunks retained until the caller selects a parser API
    _body_parser_passthrough; // Internal collector for buffered body parser APIs

    /**
     * Begins parsing the incoming request body data within the provided limit in bytes.
     * NOTE: This method will be a no-op if there is no expected body based on the content-length header.
     * NOTE: This method can be called multiple times to update the bytes limit during the parsing process process.
     *
     * @private
     * @param {import('./Response.js')} response
     * @param {Number} bytes
     * @returns {Boolean} Returns whether this request is within the bytes limit and should be handled further.
     */
    _body_parser_run(response, limit_bytes) {
        // Start parsing for a declared body length or an unknown-length chunked transfer
        const content_length = Number(this.headers['content-length']);
        const is_chunked_transfer = this.headers['transfer-encoding'] === 'chunked';
        if (content_length > 0 || is_chunked_transfer) {
            const is_first_run = this._body_expected_bytes === -1;

            // Reapply limits because callers may request a stricter parser limit later
            this._body_limit_bytes = limit_bytes;
            this._body_expected_bytes = is_chunked_transfer ? 0 : content_length; // 0 represents unknown chunked length

            // Distinguish unknown-length chunked bodies from truly empty bodies
            this._body_chunked_transfer = is_chunked_transfer;

            if (is_first_run) {
                this.received = false;
                this._body_received_bytes = 0;

                // Buffer stable copies until the caller selects buffering or streaming mode
                this._body_parser_buffered = [];

                // Bind the uWS body callback exactly once on the first parser run
                this._raw_response.onData((chunk, is_last) => this._body_parser_on_chunk(response, chunk, is_last));
            }

            this._body_parser_enforce_limit(response);
        }

        // A flushing parser prevents the route lifecycle from starting
        return !this._body_parser_flushing;
    }

    /**
     * Stops the body parser from accepting any more incoming body data.
     * @private
     */
    _body_parser_stop() {
        if (this._body_expected_bytes === -1 || this._body_parser_flushing) return;

        // Reject future chunks while allowing uWS to finish receiving the request body
        this._body_parser_flushing = true;

        if (this._readable) {
            this.push(null);

            // Prevent a paused readable from blocking the remaining network body
            this.resume();
        }
    }

    /**
     * Checks if the body parser so far is within the bytes limit and triggers the limit handling if reached.
     *
     * @private
     * @param {import('./Response.js')} response
     * @returns {Boolean} Returns `true` when the body limit has been reached.
     */
    _body_parser_enforce_limit(response) {
        // Enforce declared and observed lengths to cover fixed and chunked bodies
        const incoming_bytes = Math.max(this._body_received_bytes, this._body_expected_bytes);
        if (incoming_bytes > this._body_limit_bytes) {
            this._body_parser_stop();

            if (!response.initiated) {
                // Fast aborts close immediately; otherwise defer 413 until the incoming body is flushed
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
     * Processes incoming raw body data chunks from the uWS HttpResponse.
     *
     * @private
     * @param {import('./Response.js')} response
     * @param {ArrayBuffer} chunk
     * @param {Boolean} is_last
     */
    _body_parser_on_chunk(response, chunk, is_last) {
        // Ignore empty intermediate callbacks while still honoring the final callback
        if (!chunk.byteLength && !is_last) return;

        this._body_received_bytes += chunk.byteLength;

        if (!this._body_parser_flushing) {
            const limited = this._body_parser_enforce_limit(response);
            if (!limited) {
                switch (this._body_parser_mode) {
                    // Awaiting mode buffers stable copies until a consumer selects a parser API
                    case 0:
                        this._body_parser_buffered.push(copy_array_buffer_to_uint8array(chunk));

                        // Bound eager buffering until a consumer begins reading
                        if (this._body_received_bytes > this.app._options.max_body_buffer) this.pause();
                        break;
                    // Buffering mode feeds an internal parser callback
                    case 1:
                        this._body_parser_passthrough(
                            // Chunked consumers retain chunks until completion, so copy the volatile uWS buffer
                            this._body_chunked_transfer
                                ? copy_array_buffer_to_uint8array(chunk)
                                : new Uint8Array(chunk),
                            is_last
                        );
                        break;
                    // Streaming mode pushes stable copies into the public readable stream
                    case 2:
                        // Pause uWS when the Node stream reaches its highWaterMark
                        if (!this.push(copy_array_buffer_to_uint8array(chunk))) this.pause();

                        if (is_last) this.push(null);
                        break;
                }
            }
        }

        // Mark the body complete and notify responses waiting for uWS to flush its input
        if (is_last) {
            this.received = true;

            if (this._readable) this.emit('received', this._body_received_bytes);

            // A deferred 413 response can now be sent safely
            if (this._body_parser_flushing) this._body_parser_enforce_limit(response);
        }
    }

    /**
     * Flushes the buffered chunks to the appropriate body parser mode.
     * @private
     */
    _body_parser_flush_buffered() {
        if (this._body_parser_buffered) {
            switch (this._body_parser_mode) {
                // Buffering mode replays chunks through the internal parser callback
                case 1:
                    for (let i = 0; i < this._body_parser_buffered.length; i++) {
                        this._body_parser_passthrough(
                            this._body_parser_buffered[i],
                            i === this._body_parser_buffered.length - 1 ? this.received : false
                        );
                    }
                    break;
                // Streaming mode replays chunks through the public readable stream
                case 2:
                    for (const chunk of this._body_parser_buffered) {
                        const buffer = Buffer.from(chunk);

                        // Buffered chunks already reside in memory, so replay without applying backpressure to uWS
                        this.push(buffer);
                    }

                    // End immediately if uWS completed before the readable stream was initialized
                    if (this.received) this.push(null);
                    break;
            }
        }

        // Release buffered references now that the selected consumer owns the chunks
        this._body_parser_buffered = null;

        // Resume uWS input in case max_body_buffer caused the awaiting parser to pause it
        this.resume();
    }

    /**
     * This method is called when the underlying Readable stream is initialized and begins expecting incoming data.
     * @private
     */
    _body_parser_stream_init() {
        this._body_parser_mode = 2;

        // Resume uWS only when the Node stream requests more data
        this._readable._read = () => this.resume();

        this._body_parser_flush_buffered();
    }

    _received_data_promise;
    /**
     * Returns a single Uint8Array buffer which contains all incoming body data.
     * @private
     * @returns {Promise<Uint8Array>}
     */
    _body_parser_get_received_data() {
        if (this._received_data_promise) return this._received_data_promise;

        // A non-chunked request without a positive declared length has no body to collect
        if (!this._body_chunked_transfer && this._body_expected_bytes <= 0) return Promise.resolve(new Uint8Array(0));

        this._received_data_promise = new Promise((resolve) => {
            if (this._body_chunked_transfer) {
                // Unknown-length bodies retain stable chunk copies and concatenate once at completion
                const chunks = [];

                this._body_parser_passthrough = (chunk, is_last) => {
                    chunks.push(chunk);

                    if (is_last) {
                        let offset = 0;
                        const buffer = new Uint8Array(this._body_received_bytes);
                        for (const chunk of chunks) {
                            buffer.set(chunk, offset);
                            offset += chunk.byteLength;
                        }

                        resolve(buffer);
                    }
                };
            } else {
                // Fixed-length bodies copy volatile chunks directly into one preallocated stable buffer
                const buffer = new Uint8Array(this._body_expected_bytes);

                let offset = 0;
                this._body_parser_passthrough = (chunk, is_last) => {
                    buffer.set(chunk, offset);
                    offset += chunk.byteLength;

                    if (is_last) resolve(buffer);
                };
            }

            // Route existing and future chunks through the selected collector
            this._body_parser_mode = 1;
            this._body_parser_flush_buffered();
        });

        return this._received_data_promise;
    }

    _body_buffer;
    _buffer_promise;
    /**
     * Returns the incoming request body as a Buffer.
     * @returns {Promise<Buffer>}
     */
    buffer() {
        // Reuse the parsed representation across callers
        if (this._body_buffer) return Promise.resolve(this._body_buffer);

        this._buffer_promise = new Promise((resolve) =>
            this._body_parser_get_received_data().then((raw) => {
                this._body_buffer = Buffer.from(raw);
                resolve(this._body_buffer);
            })
        );

        return this._buffer_promise;
    }

    /**
     * Decodes the incoming request body as a String.
     * @private
     * @param {Uint8Array} uint8
     * @param {string} encoding
     * @returns {string}
     */
    _uint8_to_string(uint8, encoding = 'utf-8') {
        const decoder = new util.TextDecoder(encoding);
        return decoder.decode(uint8);
    }

    _body_text;
    _text_promise;
    /**
     * Downloads and parses the request body as a String.
     * @returns {Promise<string>}
     */
    text() {
        // Reuse the parsed representation across callers
        if (this._body_text) return Promise.resolve(this._body_text);

        this._text_promise = new Promise((resolve) =>
            this._body_parser_get_received_data().then((raw) => {
                this._body_text = this._uint8_to_string(raw);
                resolve(this._body_text);
            })
        );

        return this._text_promise;
    }

    _body_json;
    _json_promise;
    /**
     * Downloads and parses the request body as a JSON object.
     * Passing default_value as null will lead to the function throwing an exception if invalid JSON is received.
     *
     * @param {Any=} default_value Default: {}
     * @returns {Promise<Record>}
     */
    json(default_value = {}) {
        // Reuse the parsed representation across callers
        if (this._body_json) return Promise.resolve(this._body_json);

        this._json_promise = new Promise((resolve, reject) =>
            this._body_parser_get_received_data().then((raw) => {
                const text = this._uint8_to_string(raw);
                try {
                    this._body_json = JSON.parse(text);
                } catch (error) {
                    if (default_value) {
                        this._body_json = default_value;
                    } else {
                        reject(error);
                    }
                }

                resolve(this._body_json);
            })
        );

        return this._json_promise;
    }

    _body_urlencoded;
    _urlencoded_promise;
    /**
     * Parses and resolves an Object of urlencoded values from body.
     * @returns {Promise<Record>}
     */
    urlencoded() {
        // Reuse the parsed representation across callers
        if (this._body_urlencoded) return Promise.resolve(this._body_urlencoded);

        this._urlencoded_promise = new Promise((resolve) =>
            this._body_parser_get_received_data().then((raw) => {
                const text = this._uint8_to_string(raw);
                this._body_urlencoded = querystring.parse(text);
                resolve(this._body_urlencoded);
            })
        );

        return this._urlencoded_promise;
    }

    _multipart_promise;
    /**
     * Handles incoming multipart fields from uploader and calls user specified handler with MultipartField.
     *
     * @private
     * @param {Function} handler
     * @param {String} name
     * @param {String|stream.Readable} value
     * @param {Object} info
     */
    async _on_multipart_field(handler, name, value, info) {
        const field = new MultipartField(name, value, info);

        // Serialize async field handlers and pause network input while one is pending
        if (this._multipart_promise instanceof Promise) {
            this.pause();
            if (this._multipart_promise) await this._multipart_promise;
            this.resume();
        }

        const output = handler(field);
        if (output instanceof Promise) {
            this._multipart_promise = output;
            if (this._multipart_promise) await this._multipart_promise;
            this._multipart_promise = null;
        }

        // Busboy requires unconsumed file streams to be drained before parsing can finish
        if (field.file && !field.file.stream.readableEnded) field.file.stream.resume();
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
     * @returns {Promise<MultipartLimitReject|Error>} A promise which is resolved once all multipart fields have been processed
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
        if (this.readableEnded) return Promise.resolve();

        const content_type = this.headers['content-type'];
        if (!/^(multipart\/.+);(.*)$/i.test(content_type)) return Promise.resolve();

        const reference = this;
        return new Promise((resolve, reject) => {
            const uploader = busboy(options);

            // Funnel every completion and error path through one cleanup routine
            let finished = false;
            const finish = async (error) => {
                if (finished) return;
                finished = true;

                let silent_error = false;
                if (error instanceof Error) {
                    // Client disconnects commonly surface as Busboy's incomplete-form error
                    if (error.message == 'Unexpected end of form') silent_error = true;
                }

                if (error && !silent_error) {
                    reject(error);
                } else {
                    // Do not resolve until the final asynchronous field handler completes
                    if (reference._multipart_promise) await reference._multipart_promise;
                    resolve();
                }

                // Stop body intake and release Busboy after every handler has settled
                reference._body_parser_stop();
                uploader.destroy();
            };

            uploader.once('error', finish);

            // Preserve limit failures as the public string error constants
            uploader.once('partsLimit', () => finish('PARTS_LIMIT_REACHED'));
            uploader.once('filesLimit', () => finish('FILES_LIMIT_REACHED'));
            uploader.once('fieldsLimit', () => finish('FIELDS_LIMIT_REACHED'));

            const on_field = (name, value, info) => {
                // Funnel file stream and user handler failures through shared cleanup
                if (value instanceof stream.Readable) value.once('error', finish);

                reference._on_multipart_field(handler, name, value, info).catch(finish);
            };

            uploader.on('field', on_field);
            uploader.on('file', on_field);

            uploader.once('close', () => {
                if (reference._multipart_promise) {
                    // Avoid forwarding the handler's resolved value as a finish error
                    reference._multipart_promise.then(() => finish()).catch(finish);
                } else {
                    finish();
                }
            });

            reference.pipe(uploader);
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
     * Note! You cannot call this method after the response has been sent or ended.
     * @returns {String}
     */
    get ip() {
        if (this._remote_ip) return this._remote_ip;

        // uWS address buffers are unavailable after the request lifecycle ends
        if (this._request_ended)
            throw new Error('HyperExpress.Request.ip cannot be consumed after the Request/Response has ended.');

        const x_forwarded_for = this.get('X-Forwarded-For');
        const trust_proxy = this.route.app._options.trust_proxy;
        if (trust_proxy && x_forwarded_for) {
            // The first forwarded address represents the client when proxies are trusted
            this._remote_ip = x_forwarded_for.split(',')[0];
        } else {
            this._remote_ip = array_buffer_to_string(this._raw_response.getRemoteAddressAsText());
        }

        return this._remote_ip;
    }

    /**
     * Returns remote proxy IP address in string format from incoming request.
     * Note! You cannot call this method after the response has been sent or ended.
     * @returns {String}
     */
    get proxy_ip() {
        if (this._remote_proxy_ip) return this._remote_proxy_ip;

        // uWS address buffers are unavailable after the request lifecycle ends
        if (this._request_ended)
            throw new Error('HyperExpress.Request.proxy_ip cannot be consumed after the Request/Response has ended.');

        this._remote_proxy_ip = array_buffer_to_string(this._raw_response.getProxiedRemoteAddressAsText());
        return this._remote_proxy_ip;
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
