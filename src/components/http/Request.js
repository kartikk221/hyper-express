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
     * Returns path parameters from incoming request.
     * @returns {Object.<string, string>}
     */
    path_parameters = {};

    /**
     * Creates a new HyperExpress request instance that wraps a uWS.HttpRequest instance.
     *
     * @param {import('../router/Route.js')} route
     * @param {import('uWebSockets.js').HttpRequest} raw_request
     */
    constructor(route, raw_request) {
        // Store reference to the route of this request and the raw uWS.HttpResponse instance for certain operations
        this.route = route;
        this._raw_request = raw_request;

        // Cache request properties from uWS.HttpRequest as it is stack allocated and will be deallocated after this function returns
        this._query = raw_request.getQuery();
        this._path = route.path || raw_request.getUrl();
        this._method = route.method !== 'ANY' ? route.method : raw_request.getMethod();

        // Cache request headers from uWS.HttpRequest as it is stack allocated and will be deallocated after this function returns
        raw_request.forEach((key, value) => (this.headers[key] = value));

        // Cache the path parameters from the route pattern if any as uWS.HttpRequest will be deallocated after this function returns
        const num_path_parameters = route.path_parameters_key.length;
        if (num_path_parameters) {
            for (let i = 0; i < num_path_parameters; i++) {
                const parts = route.path_parameters_key[i];
                this.path_parameters[parts[0]] = raw_request.getParameter(parts[1]);
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
        // Ensure there is content being streamed before pausing
        // Ensure that the stream is currently not paused before pausing
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
        // Ensure there is content being streamed before resuming
        // Ensure that the stream is currently paused before resuming
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

    /* Body Parsing */
    _body_parser_mode = 0; // 0 = none (awaiting mode), 1 = buffering (internal use), 2 = streaming (external use)
    _body_limit_bytes = 0;
    _body_received_bytes = 0;
    _body_expected_bytes = -1; // We initialize this to -1 as we will use this to ensure the uWS.HttpResponse.onData() is only called once
    _body_parser_flushing = false;
    _body_parser_buffered; // This will hold the buffered chunks until the user decides to internally or externally consume the body data
    _body_parser_passthrough; // This will be a passthrough chunk acceptor callback used by internal body parsers

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
        // Parse the content length into a number to ensure we have some body data to parse
        // Even though it can be NaN, the > 0 check will handle this case and ignore NaN
        const content_length = Number(this.headers['content-length']);
        if (content_length > 0) {
            // Determine if this is a first run meaning we have not began parsing the body yet
            const is_first_run = this._body_expected_bytes === -1;

            // Update the limit and expected body bytes as these will be used to check if we are within the limit
            this._body_limit_bytes = limit_bytes;
            this._body_expected_bytes = content_length;

            // Determine if this is a first time body parser run
            if (is_first_run) {
                // Set the request body to not received as we have some body data to parse
                this.received = false;

                // Ensure future runs do not trigger the handling process
                this._body_received_bytes = 0;

                // Initialize the array which will buffer the incoming chunks until a different parser mode is requested aka. user does something with the data
                this._body_parser_buffered = [];

                // Bind the uWS.HttpResponse.onData() event handler to begin accepting incoming body data
                this._raw_response.onData((chunk, is_last) => this._body_parser_on_chunk(response, chunk, is_last));
            }

            // Enforce the limit as we may have a different limit than the previous run
            this._body_parser_enforce_limit(response);
        }

        // Return whether the body parser is actively parsing the incoming body data
        return !this._body_parser_flushing;
    }

    /**
     * Stops the body parser from accepting any more incoming body data.
     * @private
     */
    _body_parser_stop() {
        // Return if we have no expected body length or already flushing the body
        if (this._body_expected_bytes === -1 || this._body_parser_flushing) return;

        // Mark the body parser as flushing to prevent any more incoming body data from being accepted
        this._body_parser_flushing = true;

        // Determine if we have a readable stream
        if (this._readable) {
            // Push an empty chunk to indicate the end of the stream
            this.push(null);

            // Resume the readable stream to ensure in case it was paused to flush the buffered chunks
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
        // Determine if we have more incoming bytes than the limit allows for
        const incoming_bytes = Math.max(this._body_received_bytes, this._body_expected_bytes);
        if (incoming_bytes > this._body_limit_bytes) {
            // Stop the body parser from accepting any more incoming body data
            this._body_parser_stop();

            // Determine if we have not began sending a response yet and hence must send a response as soon as we can
            if (!response.initiated) {
                // If the server is instructed to do fast aborts, we will close the request immediately
                if (this.route.app._options.fast_abort) {
                    response.close();
                } else if (this.received) {
                    // Otherwise, we will send a HTTP 413 Payload Too Large response once the request body has been fully flushed aka. received
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
        // If this chunk has no length and is not the last chunk, we will ignore it
        if (!chunk.byteLength && !is_last) return;

        // Increment the received bytes counter by the byteLength of the incoming chunk
        this._body_received_bytes += chunk.byteLength;

        // Determine if the body parser is active / not flushing
        if (!this._body_parser_flushing) {
            // Enforce the body parser limit as the number of incoming bytes may have exceeded the limit
            const limited = this._body_parser_enforce_limit(response);
            if (!limited) {
                // Process this chunk depending on the current body parser mode
                switch (this._body_parser_mode) {
                    // Awaiting mode - Awaiting the user to do something with the incoming body data
                    case 0:
                        // Buffer a COPIED Uint8Array chunk from the uWS volatile ArrayBuffer chunk
                        this._body_parser_buffered.push(copy_array_buffer_to_uint8array(chunk));

                        // If we have exceeded the Server.options.max_body_buffer number of buffered bytes, then pause the request to prevent more buffering
                        if (this._body_received_bytes > this.app._options.max_body_buffer) this.pause();
                        break;
                    // Buffering mode - Internal use only
                    case 1:
                        // Pass through the uWS volatile ArrayBuffer chunk to the passthrough callback as a volatile Uint8Array chunk
                        this._body_parser_passthrough(new Uint8Array(chunk), is_last);
                        break;
                    // Streaming mode - External use only
                    case 2:
                        // Attempt to push a COPIED Uint8Array chunk from the uWS volatile ArrayBuffer chunk to the readable stream
                        // Pause the request if we have reached the highWaterMark to prevent backpressure
                        if (!this.push(copy_array_buffer_to_uint8array(chunk))) this.pause();

                        // If this is the last chunk, push a null chunk to indicate the end of the stream
                        if (is_last) this.push(null);
                        break;
                }
            }
        }

        // Determine if this is the last chunk of the incoming body data to perform final closing operations
        if (is_last) {
            // Mark the request as fully received as we have flushed all incoming body data
            this.received = true;

            // Emit the 'received' event that indicates how many bytes were received in total from the incoming body
            if (this._readable) this.emit('received', this._body_received_bytes);

            // Enforce the body parser limit one last time in case the request is waiting for the body to be flushed before sending a response
            if (this._body_parser_flushing) this._body_parser_enforce_limit(response);
        }
    }

    /**
     * Flushes the buffered chunks to the appropriate body parser mode.
     * @private
     */
    _body_parser_flush_buffered() {
        // Determine if we have any buffered chunks
        if (this._body_parser_buffered) {
            // Determine the body parser mode to flush the buffered chunks to
            switch (this._body_parser_mode) {
                // Buffering mode - Internal use only
                case 1:
                    // Iterate over the buffered chunks and pass them to the passthrough callback
                    for (let i = 0; i < this._body_parser_buffered.length; i++) {
                        this._body_parser_passthrough(
                            this._body_parser_buffered[i],
                            i === this._body_parser_buffered.length - 1 ? this.received : false
                        );
                    }
                    break;
                // Streaming mode - External use only
                case 2:
                    // Iterate over the buffered chunks and push them to the readable stream
                    for (const chunk of this._body_parser_buffered) {
                        // Convert Uint8Array into a Buffer chunk
                        const buffer = Buffer.from(chunk);

                        // Push the buffer to the readable stream
                        // We will ignore the return value as we are not handling backpressure here
                        this.push(buffer);
                    }

                    // If the request has been received at this point already, we must also push a null chunk to indicate the end of the stream
                    if (this.received) this.push(null);
                    break;
            }
        }

        // Deallocate the buffered chunks array as they are no longer needed
        this._body_parser_buffered = null;

        // Resume the request in case we had paused the request due to having reached the max_body_buffer for this request
        this.resume();
    }

    /**
     * This method is called when the underlying Readable stream is initialized and begins expecting incoming data.
     * @private
     */
    _body_parser_stream_init() {
        // Set the body parser mode to stream mode
        this._body_parser_mode = 2;

        // Overwrite the underlying readable _read handler to resume the request when more chunks are requested
        // This will properly handle backpressure and prevent the request from being paused forever
        this._readable._read = () => this.resume();

        // Flush the buffered chunks to the readable stream if we have any
        this._body_parser_flush_buffered();
    }

    _data_promise;
    /**
     * Returns a single Uint8Array buffer which contains all incoming body data.
     * @private
     * @returns {Promise<Uint8Array>}
     */
    _body_parser_get_received_data() {
        // Return the current promise if it exists
        if (this._data_promise) return this._data_promise;

        // If we have no expected body length, we will return an empty buffer
        if (this._body_expected_bytes <= 0) return Promise.resolve(new Uint8Array(0));

        // Create a new promise which will be resolved once all incoming body data has been received
        this._data_promise = new Promise((resolve) => {
            // Initialize the body Uint8Array buffer based on the expected body length
            const buffer = new Uint8Array(this._body_expected_bytes);

            // Set the body parser mode to buffering mode
            this._body_parser_mode = 1;

            // Define a passthrough callback which will be called for each incoming chunk
            let offset = 0;
            this._body_parser_passthrough = (chunk, is_last) => {
                // Write the chunk into the body buffer at the current offset
                buffer.set(chunk, offset);

                // Increment the offset by the byteLength of the incoming chunk
                offset += chunk.byteLength;

                // If this is the last chunk, call the callback with the body buffer
                if (is_last) resolve(buffer);
            };

            // Flush the buffered chunks to the passthrough callback if we have any
            this._body_parser_flush_buffered();
        });

        // Return the data promise
        return this._data_promise;
    }

    _body_buffer;
    _buffer_promise;
    /**
     * Returns the incoming request body as a Buffer.
     * @returns {Promise<Buffer>}
     */
    buffer() {
        // Check cache and return if body has already been parsed
        if (this._body_buffer) return Promise.resolve(this._body_buffer);

        // We have no expected body length, hence we will return an empty buffer
        if (this._body_expected_bytes <= 0) {
            this._body_buffer = Buffer.from('');
            return Promise.resolve(this._body_buffer);
        }

        // Initialize the buffer promise if it does not exist
        this._buffer_promise = new Promise((resolve) =>
            this._body_parser_get_received_data().then((raw) => {
                // Convert the Uint8Array buffer into a Buffer
                this._body_buffer = Buffer.from(raw);

                // Resolve the buffer promise with the body buffer
                resolve(this._body_buffer);
            })
        );

        // Return the buffer promise
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
        // Resolve from cache if available
        if (this._body_text) return Promise.resolve(this._body_text);

        // If we have no expected body length, we will return an empty string
        if (this._body_expected_bytes <= 0) {
            this._body_text = '';
            return Promise.resolve(this._body_text);
        }

        // Initialize the text promise if it does not exist
        this._text_promise = new Promise((resolve) =>
            this._body_parser_get_received_data().then((raw) => {
                // Decode the Uint8Array buffer into a String
                this._body_text = this._uint8_to_string(raw);

                // Resolve the text promise with the body text
                resolve(this._body_text);
            })
        );

        // Return the text promise
        return this._text_promise;
    }

    _body_json;
    _json_promise;
    /**
     * Downloads and parses the request body as a JSON object.
     * Passing default_value as undefined will lead to the function throwing an exception if invalid JSON is received.
     *
     * @param {Any=} default_value Default: {}
     * @returns {Promise<Record>}
     */
    json(default_value = {}) {
        // Return from cache if available
        if (this._body_json) return Promise.resolve(this._body_json);

        // If we have no expected body length, we will return the default value
        if (this._body_expected_bytes <= 0) {
            this._body_json = default_value;
            return Promise.resolve(this._body_json);
        }

        // Initialize the json promise if it does not exist
        this._json_promise = new Promise((resolve) =>
            this._body_parser_get_received_data().then((raw) => {
                // Decode the Uint8Array buffer into a String
                const text = this._uint8_to_string(raw);
                try {
                    // Parse the text as JSON
                    this._body_json = JSON.parse(text);
                } catch (error) {
                    if (default_value) {
                        // Use the default value if provided
                        this._body_json = default_value;
                    } else {
                        throw error;
                    }
                }

                // Resolve the json promise with the body json
                resolve(this._body_json);
            })
        );

        // Return the json promise
        return this._json_promise;
    }

    _body_urlencoded;
    _urlencoded_promise;
    /**
     * Parses and resolves an Object of urlencoded values from body.
     * @returns {Promise<Record>}
     */
    urlencoded() {
        // Return from cache if available
        if (this._body_urlencoded) return Promise.resolve(this._body_urlencoded);

        // If we have no expected body length, we will return an empty object
        if (this._body_expected_bytes <= 0) {
            this._body_urlencoded = {};
            return Promise.resolve(this._body_urlencoded);
        }

        // Initialize the urlencoded promise if it does not exist
        this._urlencoded_promise = new Promise((resolve) =>
            this._body_parser_get_received_data().then((raw) => {
                // Decode the Uint8Array buffer into a String
                const text = this._uint8_to_string(raw);

                // Parse the text as urlencoded
                this._body_urlencoded = querystring.parse(text);

                // Resolve the urlencoded promise with the body urlencoded
                resolve(this._body_urlencoded);
            })
        );

        // Return the urlencoded promise
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
        // Create a MultipartField instance with the incoming information
        const field = new MultipartField(name, value, info);

        // Check if a field is being handled by the user across a different exeuction
        if (this._multipart_promise instanceof Promise) {
            // Pause the request to prevent more fields from being received
            this.pause();

            // Wait for this field to be handled
            await this._multipart_promise;

            // Resume the request to accept more fields
            this.resume();
        }

        // Determine if the handler is a synchronous function and returns a promise
        const output = handler(field);
        if (output instanceof Promise) {
            // Store the promise, so concurrent multipart fields can wait for it
            this._multipart_promise = output;

            // Hold the current exectution context until the promise resolves
            await this._multipart_promise;

            // Clear the promise reference
            this._multipart_promise = null;
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

                // Stop the body parser from accepting any more incoming body data
                reference._body_parser_stop();

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
                if (reference._multipart_promise) {
                    // Wait for the pending promise to resolve
                    // Use an anonymous callback for the .then() to prevent finish() from receving a resolved value which would lead to an error finish
                    reference._multipart_promise.then(() => finish()).catch(finish);
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
     * Returns the request locals for this request.
     * @returns {Object.<string, any>}
     */
    get locals() {
        // Initialize locals object if it does not exist
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
        // Enforce uppercase for the returned method value
        const uppercase = this._method.toUpperCase();

        // For some reason, uWebsockets.js populates DELETE requests as DEL hence this translation
        return uppercase === 'DEL' ? 'DELETE' : uppercase;
    }

    /**
     * Returns full request url for incoming request (path + query).
     * @returns {String}
     */
    get url() {
        // Return from cache if available
        if (this._url) return this._url;

        // Parse the incoming request url
        this._url = this._path + (this._query ? '?' + this._query : '');

        // Return the url
        return this._url;
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
        // Return from cache if already parsed once
        if (this._cookies) return this._cookies;

        // Parse cookies from Cookie header and cache results
        const header = this.headers['cookie'];
        this._cookies = header ? cookie.parse(header) : {};

        // Return the cookies
        return this._cookies;
    }

    /**
     * Returns query parameters from incoming request.
     * @returns {Object.<string, string>}
     */
    get query_parameters() {
        // Return from cache if already parsed once
        if (this._query_parameters) return this._query_parameters;

        // Parse query using querystring and cache results
        this._query_parameters = querystring.parse(this._query);
        return this._query_parameters;
    }

    /**
     * Returns remote IP address in string format from incoming request.
     * Note! You cannot call this method after the response has been sent or ended.
     * @returns {String}
     */
    get ip() {
        // Resolve IP from cache if already resolved
        if (this._remote_ip) return this._remote_ip;

        // Ensure request has not ended yet
        if (this._request_ended)
            throw new Error('HyperExpress.Request.ip cannot be consumed after the Request/Response has ended.');

        // Determine if we can trust intermediary proxy servers and have a x-forwarded-for header
        const x_forwarded_for = this.get('X-Forwarded-For');
        const trust_proxy = this.route.app._options.trust_proxy;
        if (trust_proxy && x_forwarded_for) {
            // The first IP in the x-forwarded-for header is the client IP if we trust proxies
            this._remote_ip = x_forwarded_for.split(',')[0];
        } else {
            // Use the uWS detected connection IP address as a fallback
            this._remote_ip = array_buffer_to_string(this._raw_response.getRemoteAddressAsText());
        }

        // Return Remote IP
        return this._remote_ip;
    }

    /**
     * Returns remote proxy IP address in string format from incoming request.
     * Note! You cannot call this method after the response has been sent or ended.
     * @returns {String}
     */
    get proxy_ip() {
        // Resolve IP from cache if already resolved
        if (this._remote_proxy_ip) return this._remote_proxy_ip;

        // Ensure request has not ended yet
        if (this._request_ended)
            throw new Error('HyperExpress.Request.proxy_ip cannot be consumed after the Request/Response has ended.');

        // Parse and cache remote proxy IP from uWS
        this._remote_proxy_ip = array_buffer_to_string(this._raw_response.getProxiedRemoteAddressAsText());

        // Return Remote Proxy IP
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
        // Return an anonymous function which calls the original function with Request scope
        return function () {
            // Call the original function with the Request scope
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
        // Initialize a pass through method
        const passthrough = function () {
            // Determine if the underlying readable stream has not been initialized yet
            if (this._readable === null) {
                // Initialize the readable stream with the route's streaming configuration
                this._readable = new stream.Readable(this.route.streaming.readable);

                // Trigger the readable stream initialization event
                this._body_parser_stream_init();
            }

            // Return the original function with the readable stream as the context
            return original.apply(this._readable, arguments);
        };

        return passthrough;
    },
});

module.exports = Request;
