'use strict';
const cookie = require('cookie');
const stream = require('stream');
const emitter = require('events');
const busboy = require('busboy');
const signature = require('cookie-signature');
const querystring = require('querystring');

const MultipartField = require('../plugins/MultipartField.js');
const NodeRequest = require('../compatibility/NodeRequest.js');
const ExpressRequest = require('../compatibility/ExpressRequest.js');
const { inherit_prototype, array_buffer_to_string } = require('../../shared/operators.js');

class Request {
    #locals;
    #paused = false;
    #request_ended = false;
    #stream_flushing = false;
    #stream_raw_chunks = false;
    #raw_request = null;
    #raw_response = null;
    #method;
    #url;
    #path;
    #query;
    #remote_ip;
    #remote_proxy_ip;
    #cookies;
    #path_parameters;
    #query_parameters;
    #body_limit_bytes;
    #body_expected_bytes;
    #body_received_bytes;
    #body_buffer;
    #body_text;
    #body_json;
    #body_urlencoded;
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
     * @param {import('uWebSockets.js').HttpResponse} raw_response
     */
    constructor(route, raw_request, raw_response) {
        // Store references to uWS objects and the master context
        this.route = route;
        this.#raw_request = raw_request;
        this.#raw_response = raw_response;

        // Perform request pre-parsing for common access data
        // This is required as uWS.Request is forbidden for access after initial execution
        this.#path = raw_request.getUrl();
        this.#query = raw_request.getQuery();
        this.#method = route.method === 'ANY' ? raw_request.getMethod() : route.method;

        // Parse headers into a key-value object
        raw_request.forEach((key, value) => (this.headers[key] = value));

        // Parse path parameters from request path if we have a path parameters parsing key
        if (route.path_parameters_key.length) {
            // Iterate over each expected path parameter key value pair and parse the value from uWS.HttpRequest.getParameter()
            this.#path_parameters = {};
            route.path_parameters_key.forEach(
                ([key, index]) => (this.#path_parameters[key] = raw_request.getParameter(index))
            );
        }
    }

    /* HyperExpress Methods */

    /**
     * Pauses the current request and flow of incoming body data.
     * @returns {Request}
     */
    pause() {
        // Ensure there is content being streamed before pausing
        // Ensure that the stream is currently not paused before pausing
        if (!this.#paused && !this._stream_forbidden() && !this.isPaused()) {
            this.#paused = true;
            this.#raw_response.pause();
            return this._super_pause();
        }
        return this;
    }

    /**
     * Resumes the current request and flow of incoming body data.
     * @returns {Request}
     */
    resume() {
        // Ensure there is content being streamed before resuming
        // Ensure that the stream is currently paused before resuming
        if (this.#paused && !this._stream_forbidden() && this.isPaused()) {
            this.#paused = false;
            this.#raw_response.resume();
            return this._super_resume();
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
        // Pipe the arguments to the request body stream
        this._super_pipe(destination, options);

        // Resume the request body stream as it will be in a paused state by default
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

    /**
     * Handles ending of the Response if limit is reached.
     *
     * @private
     * @param {import('./Response.js')} response
     * @param {Boolean} flushed
     */
    _on_limit_response(response, flushed) {
        // Determine if the response has not been initiated yet
        if (!response.initiated) {
            // Abort the request instantly as user has specified usage of fast abort
            if (this.route.app._options.fast_abort) {
                response.close();
            } else if (flushed) {
                // Send a 413 response if the incoming data has been flushed
                response.status(413).send();
            }
        }
    }

    /**
     * Returns whether body streaming is forbidden for this request.
     *
     * @private
     * @returns {Boolean}
     */
    _stream_forbidden() {
        return this.#request_ended || this.#stream_flushing;
    }

    /**
     * Returns whether the incoming body stream has exceeded the allowed limit in received data bytes.
     *
     * @private
     * @returns {Boolean}
     */
    _stream_limit_exhausted() {
        return this.#body_limit_bytes && this.#body_received_bytes > this.#body_limit_bytes;
    }

    /**
     * Streams the incoming request body with a limit of the provided bytes.
     * NOTE: This method will be a no-op if there is no expected body based on the content-length header.
     * NOTE: This method will mark this request to emit the 'limit' event when the bytes limit is reached.
     * NOTE: This method can be called multiple times to update the bytes limit during the streaming process.
     *
     * @private
     * @param {import('./Response.js')} response
     * @param {Number} bytes
     * @returns {Boolean} Returns whether this request will be providing viable body data.
     */
    _stream_with_limit(response, bytes) {
        // Ensure body streaming is not forbidden for this request
        if (!this._stream_forbidden()) {
            // Set the body limit in bytes
            this.#body_limit_bytes = bytes;

            // Initialize the expected body size if it hasn't been yet
            if (this.#body_expected_bytes === undefined) {
                const content_length = +this.headers['content-length'];
                this.#body_expected_bytes = isNaN(content_length) || content_length < 1 ? 0 : content_length;
            }

            // Determine if we have some expected body bytes to stream
            if (this.#body_expected_bytes > 0) {
                // Initialize the body flushed to false as we are expecting some data
                this.received = false;

                // Determine if the expected body bytes is greater than the specified body limit in bytes
                if (this.#body_expected_bytes > this.#body_limit_bytes) {
                    // Mark the incoming body data to be flushed
                    this.#stream_flushing = true;
                    if (this._readable) this.emit('limit', this.#body_received_bytes, this.received);
                    this._on_limit_response(response, this.received);
                    this._stop_streaming();
                }

                // Begin streaming incoming body chunks if we have not initialized a body received bytes counter yet
                if (this.#body_received_bytes == undefined && !this.readableEnded) {
                    // Initialize the body received bytes counter
                    this.#body_received_bytes = 0;

                    // Overwrite the underlying readable _read handler to resume the request when more chunks are requested
                    this._readable._read = () => this.resume();

                    // Bind a uWS.Response.onData() handler which will provide incoming raw body chunks from uWS
                    this.#raw_response.onData((array_buffer, is_last) => {
                        // Determine if this is the last chunk from uWS
                        if (is_last) {
                            // Mark the request body as flushed
                            this.received = true;

                            // Emit a final 'limit' event if we have crossed the body limit in bytes or the stream flushing
                            if (this._stream_limit_exhausted() || this.#stream_flushing) {
                                // Emit the 'limit' event with the body flushed flag
                                this.emit('limit', this.#body_received_bytes, this.received);
                                this._on_limit_response(response, this.received);
                                this._stop_streaming();
                            } else {
                                // Emit a 'received' event that indicates the request body has been fully received
                                this.emit('received', this.#body_received_bytes);
                            }
                        }

                        // Determine if streaming is still allowed for this request
                        if (!this._stream_forbidden()) {
                            // Determine if we have direct consumers from the 'data' event
                            const raw_listeners = this.listenerCount('data');

                            // Convert the incoming temporary ArrayBuffer to a Buffer
                            let buffer;
                            if (raw_listeners > 0 && this.#stream_raw_chunks) {
                                // Store a direct Buffer reference as we have some consumer requesting raw chunks
                                buffer = Buffer.from(array_buffer);
                            } else {
                                // Store a copy of the array_buffer as we have no immediate consumer yet
                                // If we do not copy, this chunk will be lost in stream queue as it will be deallocated by uWS
                                buffer = Buffer.concat([Buffer.from(array_buffer)]);
                            }

                            // Increment the body received bytes counter
                            this.#body_received_bytes += buffer.byteLength;

                            // Push the incoming chunk into readable stream for consumption
                            // Pause the uWS request if our stream is backed up
                            if (!this.push(buffer)) this.pause();

                            // Determine if this is the last chunk from uWS
                            if (is_last) {
                                // Push a null chunk signaling an EOF to the stream to end
                                this.push(null);

                                // Determine if we have crossed the body limit in bytes
                            } else if (this._stream_limit_exhausted()) {
                                // Emit the 'limit' event with the body flushed flag
                                this.emit('limit', this.#body_received_bytes, this.received);
                                this._on_limit_response(response, this.received);
                                this._stop_streaming();
                            }
                        }
                    });
                }
            }
        }

        // Return whether an active stream is processing incoming body data
        return !this.#stream_flushing;
    }

    /**
     * Marks the request to flush any remaining body data from the client.
     * @private
     */
    _stream_flush() {
        // Ensure the request stream is not already foridden
        if (this._stream_forbidden()) return;

        // Mark this request stream to be flushed
        this.#stream_flushing = true;

        // Resume the request and body stream stream if paused
        this.resume();
    }

    /**
     * Marks the request to end the body stream.
     * @private
     * @returns {Request}
     */
    _stop_streaming() {
        // Push an EOF chunk to the body stream signifying the end of the stream
        if (this._readable && !this.readableEnded) this.push(null);

        // Mark the stream as ended so all incoming chunks will be ignored from uWS.HttpResponse.onData() handler
        this.#request_ended = true;
        return this;
    }

    #buffer_promise;

    /**
     * Initiates body buffer download process by consuming the request readable stream.
     *
     * @private
     * @param {Number} content_length
     * @returns {Promise}
     */
    _download_buffer(content_length) {
        // Return pending buffer promise if in flight already
        if (this.#buffer_promise) return this.#buffer_promise;

        // Resolve an empty buffer instantly if we have no readable body stream
        if (this.readableEnded) {
            this.#body_buffer = Buffer.from('');
            return Promise.resolve(this.#body_buffer);
        }

        // Mark this instance to provide raw buffers through readable stream
        this.#stream_raw_chunks = true;

        // Initiate a buffer promise with chunk retrieval process
        const reference = this;
        this.#buffer_promise = new Promise((resolve) => {
            // Allocate an empty body buffer to store all incoming chunks depending on buffering scheme
            const use_fast_buffers = reference.route.app._options.fast_buffers;
            const body = {
                cursor: 0,
                buffer: Buffer[use_fast_buffers ? 'allocUnsafe' : 'alloc'](content_length),
            };

            // Drain any previously buffered data from the readable request stream
            if (reference.readableLength > 0) {
                // Copy the buffered chunk from stream into our body buffer
                const chunk = reference.read(reference.readableLength);
                chunk.copy(body.buffer, body.cursor, 0, chunk.byteLength);

                // Increment the cursor by the byteLength to remember our write position
                body.cursor += chunk.byteLength;
            }

            // Resolve our body buffer if we have no more future chunks to read
            if (reference.readableEnded) return resolve(body.buffer);

            // Begin consuming future chunks from the readable request stream
            let downloaded = false;
            reference.on('data', (chunk) => {
                // Copy the temporary chunk from uWS into our body buffer
                chunk.copy(body.buffer, body.cursor, 0, chunk.byteLength);

                // Increment the cursor by the byteLength to remember our write position
                body.cursor += chunk.byteLength;
            });

            // Resolve an empty buffer if we hit the body limit in bytes
            reference.once('limit', (received_bytes, flushed) => {
                // Ensure a buffer has not been downloaded yet
                if (flushed && !downloaded) {
                    // Mark the buffer as downloaded
                    downloaded = true;

                    // Cache and resolve an empty buffer
                    reference.#body_buffer = Buffer.from('');
                    resolve(reference.#body_buffer);
                }
            });

            // Resolve the filled body buffer once the readable stream has finished
            reference.once('end', () => {
                // Ensure a buffer has not been downloaded yet
                if (!reference._stream_limit_exhausted() && !downloaded) {
                    // Mark the buffer as downloaded
                    downloaded = true;

                    // Resolve the body buffer
                    resolve(body.buffer);
                }
            });

            // We must directly resume the readable stream to make it begin accepting data
            this._super_resume();
        });

        // Bind a then handler for caching the downloaded buffer
        this.#buffer_promise.then((buffer) => (this.#body_buffer = buffer));

        // Return the buffer promise
        return this.#buffer_promise;
    }

    /**
     * Downloads and returns request body as a Buffer.
     * @returns {Promise<Buffer>}
     */
    buffer() {
        // Check cache and return if body has already been parsed
        if (this.#body_buffer) return Promise.resolve(this.#body_buffer);

        // Resolve empty if invalid content-length header detected
        const content_length = +this.headers['content-length'];
        if (isNaN(content_length) || content_length < 1) {
            this.#body_buffer = Buffer.from('');
            return Promise.resolve(this.#body_buffer);
        }

        // Initiate buffer download
        return this._download_buffer(content_length);
    }

    /**
     * Downloads and parses the request body as a String.
     * @returns {Promise<string>}
     */
    async text() {
        // Resolve from cache if available
        if (this.#body_text) return this.#body_text;

        // Retrieve body buffer, convert to string, cache and resolve
        this.#body_text = (this.#body_buffer || (await this.buffer())).toString();
        return this.#body_text;
    }

    /**
     * Parses JSON from provided string.
     * Resolves default_value or throws exception on failure.
     *
     * @private
     * @param {String} string
     * @param {Any} default_value
     * @returns {Any}
     */
    _parse_json(string, default_value) {
        // Unsafely parse JSON as we do not have a default_value
        if (default_value == undefined) return JSON.parse(string);

        // Safely parse JSON as we have a default_value
        let json;
        try {
            json = JSON.parse(string);
        } catch (error) {
            return default_value;
        }
        return json;
    }

    /**
     * Downloads and parses the request body as a JSON object.
     * Passing default_value as undefined will lead to the function throwing an exception if invalid JSON is received.
     *
     * @param {Any} default_value Default: {}
     * @returns {Promise}
     */
    async json(default_value = {}) {
        // Return from cache if available
        if (this.#body_json) return this.#body_json;

        // Retrieve body as text, safely parse json, cache and resolve
        let text = this.#body_text || (await this.text());
        this.#body_json = this._parse_json(text, default_value);
        return this.#body_json;
    }

    /**
     * Parses and resolves an Object of urlencoded values from body.
     * @returns {Promise}
     */
    async urlencoded() {
        // Return from cache if available
        if (this.#body_urlencoded) return this.#body_urlencoded;

        // Retrieve text body, parse as a query string, cache and resolve
        this.#body_urlencoded = querystring.parse(this.#body_text || (await this.text()));

        // Return the cached urlencoded body
        return this.#body_urlencoded;
    }

    #multipart_promise;

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
        // Do not handle fields if streaming is forbidden
        if (this._stream_forbidden()) return;

        // Create a MultipartField instance with the incoming information
        const field = new MultipartField(name, value, info);

        // Check if a field is being handled by the user across a different exeuction
        if (this.#multipart_promise instanceof Promise) {
            // Pause the request to prevent more fields from being received
            this.pause();

            // Wait for this field to be handled
            await this.#multipart_promise;

            // Resume the request to accept more fields
            this.resume();
        }

        // Determine if the handler is a synchronous function and returns a promise
        const output = handler(field);
        if (output instanceof Promise) {
            // Store the promise, so concurrent multipart fields can wait for it
            this.#multipart_promise = output;

            // Hold the current exectution context until the promise resolves
            await this.#multipart_promise;

            // Clear the promise reference
            this.#multipart_promise = null;
        }

        // Flush this field's file stream if it has not been consumed by the user in the handler execution
        // This is neccessary as defined in the Busboy documentation to prevent holding up the processing
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
        // Migrate options to handler if no options object is provided by user
        if (typeof options == 'function') {
            handler = options;
            options = {};
        }

        // Make a shallow copy of the options object
        options = Object.assign({}, options);

        // Inject the request headers into the busboy options if not provided
        if (!options.headers) options.headers = this.headers;

        // Ensure the provided handler is a function type
        if (typeof handler !== 'function')
            throw new Error('HyperExpress: Request.multipart(handler) -> handler must be a Function.');

        // Resolve instantly if we have no readable body stream
        if (this.readableEnded) return Promise.resolve();

        // Resolve instantly if we do not have a valid multipart content type header
        const content_type = this.headers['content-type'];
        if (!/^(multipart\/.+);(.*)$/i.test(content_type)) return Promise.resolve();

        // Return a promise which will be resolved after all incoming multipart data has been processed
        const reference = this;
        return new Promise((resolve, reject) => {
            // Create a Busboy instance which will perform
            const uploader = busboy(options);

            // Create a function to finish the uploading process
            let finished = false;
            const finish = (error) => {
                // Ensure we are not already finished
                if (finished) return;
                finished = true;

                // Determine if the caught error should be silenced
                let silent_error = false;
                if (error instanceof Error) {
                    // Silence the BusBoy "Unexpected end of form" error
                    // This usually happens when the client abruptly closes the connection
                    if (error.message == 'Unexpected end of form') silent_error = true;
                }

                // Resolve/Reject the promise depending on whether an error occurred
                if (error && !silent_error) {
                    // Reject the promise if an error occurred
                    reject(error);
                } else {
                    // Resolve the promise if no error occurred
                    resolve();
                }

                // Stop streaming the request body
                reference._stop_streaming();

                // Destroy the uploader instance
                uploader.destroy();
            };

            // Bind an 'error' event handler to emit errors
            uploader.once('error', finish);

            // Bind limit event handlers to reject as error code constants
            uploader.once('partsLimit', () => finish('PARTS_LIMIT_REACHED'));
            uploader.once('filesLimit', () => finish('FILES_LIMIT_REACHED'));
            uploader.once('fieldsLimit', () => finish('FIELDS_LIMIT_REACHED'));

            // Define a function to handle incoming multipart data
            const on_field = (name, value, info) => {
                // Catch and pipe any errors from the value readable stream to the finish function
                if (value instanceof stream.Readable) value.once('error', finish);

                // Call the user defined handler with the incoming multipart field
                // Catch and pipe any errors to the finish function
                reference._on_multipart_field(handler, name, value, info).catch(finish);
            };

            // Bind a 'field' event handler to process each incoming field
            uploader.on('field', on_field);

            // Bind a 'file' event handler to process each incoming file
            uploader.on('file', on_field);

            // Bind a 'finish' event handler to resolve the upload promise
            uploader.once('close', () => {
                // Wait for any pending multipart handler exeuction to complete
                if (reference.#multipart_promise) {
                    // Wait for the pending promise to resolve
                    // Use an anonymous callback for the .then() to prevent finish() from receving a resolved value which would lead to an error finish
                    reference.#multipart_promise.then(() => finish()).catch(finish);
                } else {
                    finish();
                }
            });

            // Pipe the readable request stream into the busboy uploader
            reference.pipe(uploader);
        });
    }

    /* HyperExpress Properties */

    /**
     * Returns underlying uWS.Request reference.
     * Note! Utilizing any of uWS.Request's methods after initial synchronous call will throw a forbidden access error.
     * @returns {import('uWebSockets.js').HttpRequest}
     */
    get raw() {
        return this.#raw_request;
    }

    /**
     * Returns the request locals for this request.
     * @returns {Object.<string, any>}
     */
    get locals() {
        // Initialize locals object if it does not exist
        if (!this.#locals) this.#locals = {};
        return this.#locals;
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
        return this.isPaused();
    }

    /**
     * Returns HTTP request method for incoming request in uppercase.
     * @returns {String}
     */
    get method() {
        // Enforce uppercase for the returned method value
        const uppercase = this.#method.toUpperCase();

        // For some reason, uWebsockets.js populates DELETE requests as DEL hence this translation
        return uppercase === 'DEL' ? 'DELETE' : uppercase;
    }

    /**
     * Returns full request url for incoming request (path + query).
     * @returns {String}
     */
    get url() {
        // Return from cache if available
        if (this.#url) return this.#url;

        // Parse the incoming request url
        this.#url = this.#path + (this.#query ? '?' + this.#query : '');

        // Return the url
        return this.#url;
    }

    /**
     * Returns path for incoming request.
     * @returns {String}
     */
    get path() {
        return this.#path;
    }

    /**
     * Returns query for incoming request without the '?'.
     * @returns {String}
     */
    get path_query() {
        return this.#query;
    }

    /**
     * Returns request cookies from incoming request.
     * @returns {Object.<string, string>}
     */
    get cookies() {
        // Return from cache if already parsed once
        if (this.#cookies) return this.#cookies;

        // Parse cookies from Cookie header and cache results
        const header = this.headers['cookie'];
        this.#cookies = header ? cookie.parse(header) : {};

        // Return the cookies
        return this.#cookies;
    }

    /**
     * Returns path parameters from incoming request.
     * @returns {Object.<string, string>}
     */
    get path_parameters() {
        return this.#path_parameters;
    }

    /**
     * Returns query parameters from incoming request.
     * @returns {Object.<string, string>}
     */
    get query_parameters() {
        // Return from cache if already parsed once
        if (this.#query_parameters) return this.#query_parameters;

        // Parse query using querystring and cache results
        this.#query_parameters = querystring.parse(this.#query);
        return this.#query_parameters;
    }

    /**
     * Returns remote IP address in string format from incoming request.
     * Note! You cannot call this method after the response has been sent or ended.
     * @returns {String}
     */
    get ip() {
        // Resolve IP from cache if already resolved
        if (this.#remote_ip) return this.#remote_ip;

        // Ensure request has not ended yet
        if (this.#request_ended)
            throw new Error('HyperExpress.Request.ip cannot be consumed after the Request/Response has ended.');

        // Determine if we can trust intermediary proxy servers and have a x-forwarded-for header
        const x_forwarded_for = this.get('X-Forwarded-For');
        const trust_proxy = this.route.app._options.trust_proxy;
        if (trust_proxy && x_forwarded_for) {
            // The first IP in the x-forwarded-for header is the client IP if we trust proxies
            this.#remote_ip = x_forwarded_for.split(',')[0];
        } else {
            // Use the uWS detected connection IP address as a fallback
            this.#remote_ip = array_buffer_to_string(this.#raw_response.getRemoteAddressAsText());
        }

        // Return Remote IP
        return this.#remote_ip;
    }

    /**
     * Returns remote proxy IP address in string format from incoming request.
     * Note! You cannot call this method after the response has been sent or ended.
     * @returns {String}
     */
    get proxy_ip() {
        // Resolve IP from cache if already resolved
        if (this.#remote_proxy_ip) return this.#remote_proxy_ip;

        // Ensure request has not ended yet
        if (this.#request_ended)
            throw new Error('HyperExpress.Request.proxy_ip cannot be consumed after the Request/Response has ended.');

        // Parse and cache remote proxy IP from uWS
        this.#remote_proxy_ip = array_buffer_to_string(this.#raw_response.getProxiedRemoteAddressAsText());

        // Return Remote Proxy IP
        return this.#remote_proxy_ip;
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
        // Return an anonymous function which calls the original function with Request scope
        return function () {
            // Call the original function with the Request scope
            return original.apply(this, arguments);
        };
    },
});

// Inherit the stream.Readable and EventEmitter prototypes
// Lazy initialize the stream.Readable instance on each call to any of the inherited methods
inherit_prototype({
    from: [stream.Readable.prototype, emitter.prototype],
    to: Request.prototype,
    override: (name) => '_super_' + name, // Prefix all overrides with _super_
    method: (type, name, original) => {
        // Initialize a pass through method
        const passthrough = function () {
            // Lazy initialize the readable stream on local scope
            if (this._readable === null) this._readable = new stream.Readable(this.route.streaming.readable);

            // Return the original function with the readable stream as the context
            return original.apply(this._readable, arguments);
        };

        return passthrough;
    },
});

module.exports = Request;
