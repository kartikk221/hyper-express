const Server = require('../Server.js'); // lgtm [js/unused-local-variable]
const cookie = require('cookie');
const signature = require('cookie-signature');
const status_codes = require('../../constants/status_codes.json');
const mime_types = require('mime-types');
const { Readable, Writable } = require('stream');

const SSEventStream = require('../plugins/SSEventStream.js');
const LiveFile = require('../plugins/LiveFile.js');
const FilePool = {};

class Response extends Writable {
    locals = {};
    #streaming = false;
    #initiated = false;
    #completed = false;
    #type_written = false;
    #wrapped_request;
    #middleware_cursor;
    #raw_response;
    #master_context;
    #upgrade_socket;
    #status_code;
    #headers;
    #cookies;
    #sse;

    constructor(stream_options = {}, wrapped_request, raw_response, socket, master_context) {
        // Initialize the writable stream for this response
        super(stream_options);

        // Store the provided parameter properties for later use
        this.#wrapped_request = wrapped_request;
        this.#raw_response = raw_response;
        this.#upgrade_socket = socket || null;
        this.#master_context = master_context;

        // Bind the abort handler as required by uWebsockets.js
        this._bind_abort_handler();

        // Bind a finish/close handler which will end the response once writable has closed
        super.once('finish', () => (this.#streaming ? this.send() : undefined));
    }

    /**
     * @private
     * INTERNAL METHOD! This method is an internal method and should NOT be called manually.
     * This method binds an abort handler which will update completed field to lock appropriate operations in Response
     */
    _bind_abort_handler() {
        const reference = this;
        this.#raw_response.onAborted(() => {
            reference.#completed = true;
            reference.#wrapped_request._stop_streaming();
            reference.emit('abort', this.#wrapped_request, this);
            reference.emit('close', this.#wrapped_request, this);
        });
    }

    /**
     * Tracks middleware cursor position over a request's lifetime.
     * This is so we can detect any double middleware iterations and throw an error.
     * @private
     * @param {Number} position - Cursor position
     */
    _track_middleware_cursor(position) {
        // Initialize cursor on first invocation
        if (this.#middleware_cursor == undefined) return (this.#middleware_cursor = position);

        // Check if position is greater than last cursor and update
        if (position > this.#middleware_cursor) return (this.#middleware_cursor = position);

        // If position is not greater than last cursor then we likely have a double middleware execution
        this.throw(
            new Error(
                'HyperExpress: Double middleware execution detected! You have a bug where one of your middlewares is calling both the next() callback and also resolving from a Promise/async middleware. You must only use one of these not both.'
            )
        );
    }

    /**
     * Resume the associated request if it is paused.
     * @private
     */
    _resume_if_paused() {
        // Unpause the request if it is paused
        if (this.#wrapped_request.paused) this.#wrapped_request.resume();
    }

    /* Response Methods/Operators */

    /**
     * This method can be used to improve Network IO performance by executing
     * all network operations in a singular atomic structure.
     *
     * @param {Function} handler
     */
    atomic(handler) {
        if (typeof handler !== 'function')
            throw new Error('HyperExpress: atomic(handler) -> handler must be a Javascript function');

        this._resume_if_paused();
        return this.#raw_response.cork(handler);
    }

    /**
     * This method is used to set a custom response code.
     *
     * @param {Number} code Example: response.status(403)
     * @returns {Response} Response (Chainable)
     */
    status(code) {
        // Throw expection if a status change is attempted after response has been initiated
        if (this.initiated) {
            throw new Error(
                'HyperExpress.Response.status(code) -> HTTP Status Code cannot be changed once a response has been initiated.'
            );
        }

        // Set the numeric status code. Status text is appended before writing status to uws
        this.#status_code = code;
        return this;
    }

    /**
     * This method is used to set the response content type header based on the provided mime type. Example: type('json')
     *
     * @param {String} mime_type Mime type
     * @returns {Response} Response (Chainable)
     */
    type(mime_type) {
        // Remove leading dot from mime type if present
        if (mime_type.startsWith('.')) mime_type = mime_type.substring(1);

        // Determine proper mime type and send response
        let mime_header = mime_types.lookup(mime_type) || 'text/plain';
        if (!this.#completed) {
            this.#type_written = true;
            this.header('content-type', mime_header);
        }
        return this;
    }

    /**
     * This method can be used to write a response header and supports chaining.
     *
     * @param {String} name Header Name
     * @param {String|Array<String>} value Header Value
     * @returns {Response} Response (Chainable)
     */
    header(name, value) {
        // Throw expection if a header write is attempted after response has been initiated
        if (this.initiated)
            throw new Error(
                'HyperExpress.Response.header(name, value) -> Headers cannot be written after a response has already been initiated.'
            );

        // Call self for all specified values in values array
        if (Array.isArray(value)) {
            value.forEach((item) => this.header(name, item));
            return this;
        }

        // Initialize headers container
        if (this.#headers == undefined) this.#headers = {};

        // Initialize header values as an array to allow for multiple values
        if (this.#headers[name] == undefined) this.#headers[name] = [];

        // Ensure that the value is always a string type
        if (typeof value !== 'string')
            throw new Error('HyperExpress: header(name, value) -> value candidates must always be of type string');

        // Push current header value onto values array
        this.#headers[name].push(value);
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
     * @param {String} value Cookie Value
     * @param {Number} expiry In milliseconds
     * @param {CookieOptions} options Cookie Options
     * @param {Boolean} sign_cookie Enables/Disables Cookie Signing
     * @returns {Response} Response (Chainable)
     */
    cookie(
        name,
        value,
        expiry,
        options = {
            secure: true,
            sameSite: 'none',
            path: '/',
        },
        sign_cookie = true
    ) {
        // Determine if this is a delete operation and recursively call self with appropriate options
        if (name && value === null)
            return this.cookie(name, '', null, {
                maxAge: 0,
            });

        // Convert expiry to a valid Date object or delete expiry altogether
        if (typeof expiry == 'number') options.expires = new Date(Date.now() + expiry);

        // Sign cookie value if signing is enabled and a valid secret is provided
        if (sign_cookie && typeof options.secret == 'string') {
            options.encode = false; // Turn off encoding to prevent loss of signature structure
            value = signature.sign(value, options.secret);
        }

        // Initialize cookies holder and store cookie value
        if (this.#cookies == undefined) this.#cookies = {};
        this.#cookies[name] = value;

        // Serialize the cookie options and write the 'Set-Cookie' header
        return this.header('set-cookie', cookie.serialize(name, value, options));
    }

    /**
     * This method is used to upgrade an incoming upgrade HTTP request to a Websocket connection.
     * @param {Object=} context Store information about the websocket connection
     */
    upgrade(context) {
        if (!this.#completed) {
            // Ensure a upgrade_socket exists before upgrading ensuring only upgrade handler requests are handled
            if (this.#upgrade_socket == null)
                throw new Error(
                    'You cannot upgrade a request that does not come from an upgrade handler. No upgrade socket was found.'
                );

            // Ensure our request is not paused for whatever reason
            this._resume_if_paused();

            // Call uWS.Response.upgrade() method with user data, protocol headers and uWS upgrade socket
            const headers = this.#wrapped_request.headers;
            this.#raw_response.upgrade(
                {
                    context,
                },
                headers['sec-websocket-key'],
                headers['sec-websocket-protocol'],
                headers['sec-websocket-extensions'],
                this.#upgrade_socket
            );

            // Mark request as complete so no more operations can be performed
            this.#completed = true;
        }
    }

    /**
     * @private
     * Initiates response process by writing HTTP status code and then writing the appropriate headers.
     */
    _initiate_response() {
        // Ensure response can only be initiated once to prevent multiple invocations
        if (this.initiated) return;

        // Emit the 'prepare' event to allow for any last minute response modifications
        this.emit('prepare', this.#wrapped_request, this);

        // Mark the instance as initiated signifying that no more status/header based operations can be performed
        this.#initiated = true;

        // Ensure we are not in a paused state as uWS requires us to be a in a flowing state to be able to write status and headers
        this._resume_if_paused();

        // Write the appropriate status code to the response along with mapped status code message
        if (this.#status_code)
            this.#raw_response.writeStatus(this.#status_code + ' ' + status_codes[this.#status_code]);

        // Iterate through all headers and write them to uWS
        if (this.#headers)
            Object.keys(this.#headers).forEach((name) =>
                this.#headers[name].forEach((value) => this.#raw_response.writeHeader(name, value))
            );
    }

    /**
     * Binds a drain handler which gets called with a byte offset that can be used to try a failed chunk write.
     * You MUST perform a write call inside the handler for uWS chunking to work properly.
     *
     * @param {function(number):void} handler Synchronous callback only
     */
    drain(handler) {
        // Ensure handler is a function type
        if (typeof handler !== 'function')
            throw new Error('HyperExpress.Response.drain(handler) -> handler must be a Function.');

        // Bind a writable handler with a fallback return value to true as uWS expects a Boolean
        this.#raw_response.onWritable((offset) => handler(offset) || true);
    }

    /**
     * Writes the provided chunk to the client over uWS with backpressure handling if a callback is provided.
     *
     * @private
     * @param {String|Buffer|ArrayBuffer} chunk
     * @param {String=} encoding
     * @param {Function=} callback
     * @returns {Boolean} 'false' signifies that the chunk was not sent due to built up backpressure.
     */
    _write(chunk, encoding, callback) {
        // Ensure the client is still connected and request is pending
        if (!this.#completed) {
            // Mark this response as streaming
            this.#streaming = true;

            // Ensure response has been initiated before writing any chunks
            this._initiate_response();

            // Attempt to write the chunk to the client
            const last_offset = this.#raw_response.getWriteOffset();
            const written = this.#raw_response.write(chunk);

            if (written) {
                // If chunk write was a success, we can move onto consuming the next chunk
                if (callback) callback();

                // Return true here to signify that this chunk was written successfully
                return true;
            } else if (callback) {
                // Wait for backpressure to be drained before attempting to write the chunk again
                const reference = this;
                return this.drain((offset) => {
                    // Retry the sliced chunk based on the drained offset - last offset
                    const sliced = chunk.slice(offset - last_offset);
                    const retried = reference.#raw_response.write(sliced);

                    // Only call the callback to consume more chunks we are able to successfully retry this chunk
                    if (retried) callback();

                    // We must return a boolean to indicate whether the chunk was successfully written or not to uWS
                    return retried;
                });
            }
        }

        // Trigger callback with an error if a write() is performed after response has completed
        if (callback) callback(new Error('Response is already completed/aborted'));

        return false;
    }

    /**
     * Writes multiples chunks for the response to the client over uWS with backpressure handling if a callback is provided.
     *
     * @private
     * @param {Array<Buffer>} chunks
     * @param {Function} callback
     */
    _writev(chunks, callback) {
        // Serve the first chunk in the array
        const reference = this;
        this._write(chunks[0], null, (error) => {
            // Pass the error to the callback if one was provided
            if (error) return callback(error);

            // Determine if we have more chunks after the first chunk we just served
            if (chunks.length > 1) {
                // Recursively serve the remaining chunks
                reference._writev(chunks.slice(1), callback);
            } else {
                // Trigger the callback as all chunks have been served
                callback();
            }
        });
    }

    /**
     * This method is used to end the current request and send response with specified body and headers.
     *
     * @param {String|Buffer|ArrayBuffer} body Optional
     * @param {Boolean=} close_connection
     * @returns {Boolean} 'false' signifies that the body was not sent due to built up backpressure or closed connection.
     */
    send(body, close_connection = true) {
        // Ensure response connection is still active
        if (!this.#completed) {
            // Initiate response to write status code and headers
            this._initiate_response();

            // Stop downloading further body chunks as we are done with the response
            this.#wrapped_request._stop_streaming();

            // Mark request as completed and end request using uWS.Response.end()
            const sent = this.#raw_response.end(body, close_connection);

            // Emit the 'finish' event to signify that the response has been sent without streaming
            if (!this.#streaming) this.emit('finish', this.#wrapped_request, this);

            // Call any bound hooks for type 'complete' if no backpressure was built up
            if (sent && !this.#completed) {
                // Mark request as completed if we were able to send response properly
                this.#completed = true;

                // Emit the 'close' event to signify that the response has been completed
                this.emit('close', this.#wrapped_request, this);
            }

            return sent;
        }

        return false;
    }

    /**
     * @private
     * Streams individual chunk from a stream.
     * Delivers with chunked transfer without content-length header when no total_size is specified.
     * Delivers with backpressure handling and content-length header when a total_size is specified.
     *
     * @param {Readable} stream
     * @param {Buffer} chunk
     * @param {Number=} total_size
     */
    _stream_chunk(stream, chunk, total_size) {
        // Ensure the client is still connected and request is pending
        if (!this.#completed) {
            // Attempt to stream the chunk using appropriate uWS.Response chunk serving method
            // This will depend on whether a total_size is specified or not
            let sent, finished;
            let last_offset = this.#raw_response.getWriteOffset();
            if (total_size) {
                // Attempt to stream the current chunk using uWS.tryEnd with a total size
                const [ok, done] = this.#raw_response.tryEnd(chunk, total_size);
                sent = ok;
                finished = done;
            } else {
                // Attempt to stream the current chunk uWS.write()
                sent = this.#raw_response.write(chunk);

                // Since we are streaming without a total size, we are not finished
                finished = false;
            }

            if (finished) {
                // If streaming has finished, we can destroy the readable stream just to be safe
                if (!stream.destroyed) stream.destroy();
            } else if (!sent) {
                // Pause the readable stream to prevent any further data from being read
                stream.pause();

                // Bind a drain handler which gets called with a byte offset that can be used to try a failed chunk write
                const reference = this;
                this.drain((offset) => {
                    // Retry writing the sliced chunk based on the drained offset - last offset
                    const sliced = chunk.slice(offset - last_offset);
                    if (total_size) {
                        // Attempt to stream the current chunk using uWS.tryEnd with a total size
                        const [ok, done] = reference.#raw_response.tryEnd(sliced, total_size);
                        sent = ok;
                        finished = done;
                    } else {
                        // Attempt to stream the current chunk uWS.write()
                        sent = reference.#raw_response.write(sliced);

                        // Since we are streaming without a total size, we are not finished
                        finished = false;
                    }

                    // Resume stream once this chunk has been successfully retried
                    if (sent) stream.resume();

                    // We must return a boolean to indicate whether the chunk was successfully written or not to uWS
                    return sent;
                });
            }
        }
    }

    /**
     * This method is used to serve a readable stream as response body and send response.
     * By default, this method will use chunked encoding transfer to stream data.
     * If your use-case requires a content-length header, you must specify the total payload size.
     *
     * @param {Readable} readable A Readable stream which will be consumed as response body
     * @param {Number=} total_size Total size of the Readable stream source in bytes (Optional)
     */
    stream(readable, total_size) {
        // Ensure readable is an instance of a stream.Readable
        if (!(readable instanceof Readable))
            throw new Error('Response.stream(readable, total_size) -> readable must be a Readable stream.');

        // Bind an 'abort' event handler which will destroy the consumed stream if request is aborted
        this.on('abort', () => {
            if (!readable.destroyed) readable.destroy();
        });

        // Initiate response as we will begin writing body chunks
        this._initiate_response();

        // Bind a listener for the 'data' event to consume chunks
        readable.on('data', (chunk) => this._stream_chunk(readable, chunk, total_size));

        // Bind listeners to end request on stream closure if no total size was specified and thus we delivered with chunked transfer
        if (total_size === undefined) {
            const end_request = () => this.send();
            readable.once('end', end_request);
        }
    }

    /**
     * Instantly aborts/closes current request without writing a status response code.
     * Use this only in extreme situations to abort a request where a proper response is not neccessary.
     */
    close() {
        if (!this.#completed) {
            this.#completed = true;
            this._resume_if_paused();
            this.#wrapped_request._stop_streaming();
            this.#raw_response.close();
        }
    }

    /**
     * This method is used to redirect an incoming request to a different url.
     *
     * @param {String} url Redirect URL
     * @returns {Boolean} Boolean
     */
    redirect(url) {
        if (!this.#completed) return this.status(302).header('location', url).send();
        return false;
    }

    /**
     * This method is an alias of send() method except it accepts an object and automatically stringifies the passed payload object.
     *
     * @param {Object} body JSON body
     * @returns {Boolean} Boolean
     */
    json(body) {
        return this.type('json').send(JSON.stringify(body));
    }

    /**
     * This method is an alias of send() method except it accepts an object
     * and automatically stringifies the passed payload object with a callback name.
     * Note! This method uses 'callback' query parameter by default but you can specify 'name' to use something else.
     *
     * @param {Object} body
     * @param {String=} name
     * @returns {Boolean} Boolean
     */
    jsonp(body, name) {
        let query_parameters = this.#wrapped_request.query_parameters;
        let method_name = query_parameters['callback'] || name;
        return this.type('js').send(`${method_name}(${JSON.stringify(body)})`);
    }

    /**
     * This method is an alias of send() method except it automatically sets
     * html as the response content type and sends provided html response body.
     *
     * @param {String} body
     * @returns {Boolean} Boolean
     */
    html(body) {
        return this.type('html').send(body);
    }

    /**
     * @private
     * Sends file content with appropriate content-type header based on file extension from LiveFile.
     *
     * @param {LiveFile} live_file
     * @param {function(Object):void} callback
     */
    async _send_file(live_file, callback) {
        // Wait for LiveFile to be ready before serving
        if (!live_file.is_ready) await live_file.ready();

        // Write appropriate extension type if one has not been written yet
        if (!this.#type_written) this.type(live_file.extension);

        // Send response with file buffer as body
        this.send(live_file.buffer);

        // Execute callback with cache pool, so user can expire as they wish.
        if (callback) setImmediate(() => callback(FilePool));
    }

    /**
     * This method is an alias of send() method except it sends the file at specified path.
     * This method automatically writes the appropriate content-type header if one has not been specified yet.
     * This method also maintains its own cache pool in memory allowing for fast performance.
     * Avoid using this method to a send a large file as it will be kept in memory.
     *
     * @param {String} path
     * @param {function(Object):void=} callback Executed after file has been served with the parameter being the cache pool.
     */
    file(path, callback) {
        // Send file from local cache pool if available
        if (FilePool[path]) return this._send_file(FilePool[path], callback);

        // Create new LiveFile instance in local cache pool for new file path
        FilePool[path] = new LiveFile({
            path,
        });

        // Assign error handler to live file
        FilePool[path].on('error', (error) => this.throw(error));

        // Serve file as response
        this._send_file(FilePool[path], callback);
    }

    /**
     * Writes approriate headers to signify that file at path has been attached.
     *
     * @param {String} path
     * @param {String=} name
     * @returns {Response}
     */
    attachment(path, name) {
        // Attach a blank content-disposition header when no filename is defined
        if (path == undefined) return this.header('Content-Disposition', 'attachment');

        // Parses path in to file name and extension to write appropriate attachment headers
        let chunks = path.split('/');
        let final_name = name || chunks[chunks.length - 1];
        let name_chunks = final_name.split('.');
        let extension = name_chunks[name_chunks.length - 1];
        return this.header('Content-Disposition', `attachment; filename="${final_name}"`).type(extension);
    }

    /**
     * Writes appropriate attachment headers and sends file content for download on user browser.
     * This method combined Response.attachment() and Response.file() under the hood, so be sure to follow the same guidelines for usage.
     *
     * @param {String} path
     * @param {String=} filename
     */
    download(path, filename) {
        return this.attachment(path, filename).file(path);
    }

    /**
     * This method allows you to throw an error which will be caught by the global error handler (If one was setup with the Server instance).
     *
     * @param {Error} error
     */
    throw(error) {
        // Ensure error is an instance of Error
        if (error instanceof Error) return this.#master_context.handlers.on_error(this.#wrapped_request, this, error);

        // If error is not an instance of Error, throw a warning error
        throw new Error('HyperExpress: Response.throw() expects an instance of an Error.');
    }

    /* Response Getters */

    /**
     * Returns the underlying raw uWS.Response object.
     * @returns {uWebsockets.Response}
     */
    get raw() {
        return this.#raw_response;
    }

    /**
     * Returns the HyperExpress.Server instance this Response object originated from.
     *
     * @returns {Server}
     */
    get app() {
        return this.#master_context;
    }

    /**
     * Returns whether response has been initiated by writing the HTTP status code and headers.
     * Note! No changes can be made to the HTTP status code or headers after a response has been initiated.
     * @returns {Boolean}
     */
    get initiated() {
        return this.#initiated;
    }

    /**
     * Returns current state of request in regards to whether the source is still connected.
     * @returns {Boolean}
     */
    get aborted() {
        return this.#completed;
    }

    /**
     * Alias of aborted property as they both represent the same request state in terms of inaccessibility.
     * @returns {Boolean}
     */
    get completed() {
        return this.#completed;
    }

    /**
     * Upgrade socket context for upgrade requests.
     * @returns {uWebsockets.ux_socket_context}
     */
    get upgrade_socket() {
        return this.#upgrade_socket;
    }

    /**
     * Returns a "Server-Sent Events" connection object to allow for SSE functionality.
     * This property will only be available for GET requests as per the SSE specification.
     *
     * @returns {SSEventStream=}
     */
    get sse() {
        // Return a new SSE instance if one has not been created yet
        if (this.#wrapped_request.method === 'GET') {
            // Create new SSE instance if one has not been created yet
            if (this.#sse === undefined) this.#sse = new SSEventStream(this);
            return this.#sse;
        }
    }

    /* ExpressJS compatibility properties & methods */

    /**
     * Throws a descriptive error when an unsupported ExpressJS property/method is invocated.
     * @private
     * @param {String} name
     */
    _throw_unsupported(name) {
        throw new Error(
            `One of your middlewares or logic tried to call Response.${name} which is unsupported with HyperExpress.`
        );
    }

    /**
     * ExpressJS: Alias of Response.completed
     */
    get headersSent() {
        return this.#completed;
    }

    /**
     * ExpressJS: Alias of Response.status_code to expose response status code
     */
    get statusCode() {
        return this.#completed ? this.#status_code : undefined;
    }

    /**
     * ExpressJS: Alias of Response.status_code to expose setter response status code
     */
    set statusCode(code) {
        this.status(code);
    }

    /**
     * ExpressJS: Alias of header() method
     * @param {String} name
     * @param {String|Array} values
     */
    append(name, values) {
        return this.header(name, values);
    }

    /**
     * ExpressJS: Alias of Response.append()
     */
    setHeader(name, values) {
        return this.append(name, values);
    }

    /**
     * ExpressJS: Writes multiple headers in form of an object
     * @param {Object} headers
     */
    writeHeaders(headers) {
        Object.keys(headers).forEach((name) => this.header(name, headers[name]));
    }

    /**
     * ExpressJS: Alias of Response.writeHeaders
     * @param {Object} headers
     */
    setHeaders(headers) {
        this.writeHeaders(headers);
    }

    /**
     * ExpressJS: Writes multiple header values for a single name
     * @param {String} name
     * @param {Array} values
     */
    writeHeaderValues(name, values) {
        values.forEach((value) => this.header(name, value));
    }

    /**
     * ExpressJS: Returns pending header from this response
     * @param {String} name
     * @returns {String|Array|undefined}
     */
    getHeader(name) {
        return this.#headers ? this.#headers[name] : undefined;
    }

    /**
     * ExpressJS: Returns all pending headers from this response
     * @returns {Object|undefined}
     */
    getHeaders() {
        const headers = {};
        Object.keys(this.#headers).forEach((key) => {
            headers[key] = this.#headers[key].join(',');
        });
        return headers;
    }

    /**
     * ExpressJS: Removes header from this response
     * @param {String} name
     */
    removeHeader(name) {
        if (this.#headers) delete this.#headers[name];
    }

    /**
     * ExpressJS: Alias of Response.cookie()
     * @param {String} name
     * @param {String} value
     * @param {Object} options
     */
    setCookie(name, value, options) {
        return this.cookie(name, value, null, options);
    }

    /**
     * ExpressJS: checks if a cookie exists
     * @param {String} name
     * @returns {Boolean}
     */
    hasCookie(name) {
        return this.#cookies && this.#cookies[name] !== undefined;
    }

    /**
     * ExpressJS: Alias of Response.cookie(name, null) method.
     * @param {String} name
     */
    removeCookie(name) {
        return this.cookie(name, null);
    }

    /**
     * ExpressJS: Alias of Response.cookie(name, null) method.
     * @param {String} name
     */
    clearCookie(name) {
        return this.cookie(name, null);
    }

    /**
     * ExpressJS: Alias of Response.send()
     */
    end(data) {
        return this.send(data);
    }

    /**
     * Unsupported method
     */
    format() {
        this._throw_unsupported('format()');
    }

    /**
     * ExpressJS: Returns the HTTP response header specified by field. The match is case-insensitive.
     * @param {String} name
     * @returns {String|Array}
     */
    get(name) {
        if (this.#headers) {
            let values = this.#headers[name];
            if (values) return values.length == 0 ? values[0] : values;
        }
    }

    /**
     * ExpressJS: Joins the links provided as properties of the parameter to populate the response’s Link HTTP header field.
     * @param {Object} links
     * @returns {String}
     */
    links(links) {
        if (typeof links !== 'object' || links == null)
            throw new Error('Response.links(links) -> links must be an Object');

        // Build chunks of links and combine into header spec
        let chunks = [];
        Object.keys(links).forEach((rel) => {
            let url = links[rel];
            chunks.push(`<${url}>; rel="${rel}"`);
        });
        return chunks.join(', ');
    }

    /**
     * ExpressJS: Sets the response Location HTTP header to the specified path parameter.
     * @param {String} path
     */
    location(path) {
        return this.header('location', path);
    }

    /**
     * Unsupported method
     */
    render() {
        this._throw_unsupported('render()');
    }

    /**
     * ExpressJS: Alias of Response.file()
     * @param {String} path
     */
    sendFile(path) {
        return this.file(path);
    }

    /**
     * ExpressJS: Alias of Response.status()
     * @param {Number} status_code
     */
    sendStatus(status_code) {
        return this.status(status_code);
    }

    /**
     * ExpressJS: Sets the response’s HTTP header field to value. To set multiple fields at once, pass an object as the parameter.
     * @param {String|Object} object
     * @param {(String|Array)=} value
     */
    set(field, value) {
        if (typeof field == 'object') {
            const reference = this;
            Object.keys(field).forEach((name) => {
                let value = field[name];
                reference.header(field, value);
            });
        } else {
            this.header(field, value);
        }
    }

    /**
     * ExpressJS: Adds the field to the Vary response header, if it is not there already.
     * @param {String} name
     */
    vary(name) {
        return this.header('Vary', name);
    }
}

module.exports = Response;
