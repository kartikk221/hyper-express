const cookie = require('cookie');
const signature = require('cookie-signature');
const status_codes = require('../../constants/status_codes.json');
const mime_types = require('mime-types');
const { Readable, Writable } = require('stream');

const LiveFile = require('../plugins/LiveFile.js');
const FilePool = {};

class Response {
    #wrapped_request;
    #middleware_cursor;
    #raw_response;
    #master_context;
    #upgrade_socket;
    #status_code;
    #headers;
    #initiated = false;
    #completed = false;
    #type_written = false;
    #hooks;
    #writable;

    constructor(wrapped_request, raw_response, socket, master_context) {
        this.#wrapped_request = wrapped_request;
        this.#raw_response = raw_response;
        this.#upgrade_socket = socket || null;
        this.#master_context = master_context;
        this._bind_abort_handler();
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
            reference.#wrapped_request._abort_buffer();
            reference._call_hooks('abort');
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
        this.throw_error(
            new Error(
                'HyperExpress: Double middleware execution detected! You have a bug where one of your middlewares is calling both the next() callback and also resolving from a Promise/async callback. You must only use one of these not both.'
            )
        );
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
            throw new Error(
                'HyperExpress: atomic(handler) -> handler must be a Javascript function'
            );

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
        if (this.initiated)
            throw new Error(
                'HyperExpress.Response.status(code) -> HTTP Status Code cannot be changed once a response has been initiated.'
            );

        // Match status code Number to a status message and call uWS.Response.writeStatus
        this.#status_code = code + ' ' + status_codes[code];
        return this;
    }

    /**
     * This method is used to set the response content type header
     * based on the provided mime type. Example: type('json')
     *
     * @param {String} mime_type Mime type
     * @returns {Response} Response (Chainable)
     */
    type(mime_type) {
        // Remove leading extension . if specified
        if (mime_type.startsWith('.')) mime_type = mime_type.substr(1);

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
     * @param {String|Array} value Header Value
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

    #cookies;
    /**
     * This method is used to write a cookie to incoming request.
     * Note! This method utilized .header() therefore it must be called
     * after setting a custom status code.
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
        // Convert expiry to a valid Date object or delete expiry altogether
        if (typeof expiry == 'number') {
            options.expires = new Date(Date.now() + expiry);
        }

        // Sign cookie value if signing is enabled and a valid secret is provided
        if (sign_cookie && typeof options.secret == 'string') {
            value = signature.sign(value, options.secret);
            options.encode = false; // Turn off encoding to prevent loss of signature structure
        }

        // Initialize cookies holder and store cookie value
        if (this.#cookies == undefined) this.#cookies = {};
        this.#cookies[name] = value;

        // Serialize cookie options -> set-cookie header and write header
        let header = cookie.serialize(name, value, options);
        this.header('set-cookie', header);
        return this;
    }

    /**
     * This method is used to delete cookies on sender's browser.
     * An appropriate set-cookie header is written with maxAge as 0.
     *
     * @param {String} name Cookie Name
     * @returns {Response} Response
     */
    delete_cookie(name) {
        // null expiry and maxAge 0 will cause browser to unset cookie
        return this.cookie(name, '', null, {
            maxAge: 0,
        });
    }

    /**
     * @private
     * Executes all registered hooks (callbacks) for specified type.
     *
     * @param {String} type
     */
    _call_hooks(type) {
        if (this.#hooks && this.#hooks[type])
            this.#hooks[type].forEach((hook) => hook(this.#wrapped_request, this));
    }

    /**
     * Binds a hook (synchronous callback) that gets executed based on specified type.
     * See documentation for supported hook types.
     *
     * @param {String} type
     * @param {function(Request, Response):void} handler
     * @returns {Response} Chainable
     */
    hook(type, handler) {
        // Initialize hooks if they haven't been yet
        if (this.#hooks == undefined) this.#hooks = {};

        // Initialize hooks array on first invocation
        if (this.#hooks[type] == undefined) this.#hooks[type] = [];

        // Store hook into individual location
        this.#hooks[type].push(handler);
        return this;
    }

    /**
     * Removes a hook (synchronous callback) that gets executed based on specified type.
     * See documentation for supported hook types.
     *
     * @param {String} type
     * @param {function(Request, Response):void} handler
     * @returns {Response} Chainable
     */
    unhook(type, handler) {
        if (!this.#hooks || !this.#hooks[type]) return this;

        const index = this.#hooks[type].findIndex(h => h === handler);
        if (index !== -1) this.#hooks[type].splice(index, 1)

        return this;
    }

    /**
     * This method is used to upgrade an incoming upgrade HTTP request to a Websocket connection.
     *
     * @param {Object} context Store information about the websocket connection
     */
    upgrade(context) {
        if (!this.#completed) {
            // Ensure a upgrade_socket exists before upgrading ensuring only upgrade handler requests are handled
            if (this.#upgrade_socket == null)
                throw new Error(
                    'You cannot upgrade a request that does not come from an upgrade handler. No upgrade socket was found.'
                );

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
        this.#initiated = true;

        // Write custom HTTP status if specified
        if (this.#status_code) this.#raw_response.writeStatus(this.#status_code);

        // Write headers if specified
        if (this.#headers)
            Object.keys(this.#headers).forEach((name) =>
                this.#headers[name].forEach((value) => this.#raw_response.writeHeader(name, value))
            );
    }

    #last_write_result;
    #last_write_offset;
    #drained_write_offset;

    /**
     * Binds a drain handler which gets called with a byte offset that can be used to try a failed chunk write.
     * You MUST perform a write call inside the handler for uWS chunking to work properly.
     *
     * @param {Function} handler Synchronous callback only
     */
    drain(handler) {
        // Ensure handler is a function type
        if (typeof handler !== 'function')
            throw new Error('HyperExpress.Response.drain(handler) -> handler must be a Function.');

        // Create a onWritable listener with provided handler
        const reference = this;
        this.#raw_response.onWritable((offset) => {
            // Store the drained write offset so we write a sliced chunk in the future with write()
            reference.#drained_write_offset = offset;

            // Execute user handler so they perform a write call
            handler();

            // Return the last write result as the user should have executed a write call in the handler above
            // This boolean return is required by the uWS.Response.onWritable method. See documentation.
            return reference.#last_write_result;
        });
    }

    /**
     * This method can be used to write the body in chunks.
     * Note! You must still call the send() method to send the response and complete the request.
     *
     * @param {String|Buffer|ArrayBuffer} chunk
     * @param {String=} encoding
     * @param {Function=} callback
     * @returns {Boolean} 'false' signifies that the chunk was not sent due to built up backpressure.
     */
    write(chunk, encoding, callback) {
        // Ensure response has not been completed
        if (!this.#completed) {
            // Ensure response has been initiated before writing chunk
            this._initiate_response();

            // Store the last write offest, so we can use this as a base value for getting sliced chunk for retries
            this.#last_write_offset = this.#raw_response.getWriteOffset();

            // See if we have a drained write offset which we must account for by slicing the passed chunk
            if (this.#drained_write_offset) {
                // Write a partially sliced chunk accounting for drained write offset
                this.#last_write_result = this.#raw_response.write(
                    chunk.slice(this.#drained_write_offset - this.#last_write_offset)
                );

                // Unset the drained write offset if we had a successful partial chunk write
                if (this.#last_write_result) this.#drained_write_offset = undefined;
            } else {
                // Write the full chunk from the parameter as we have no backpressure yet
                this.#last_write_result = this.#raw_response.write(chunk);
            }

            // Determine if a callback is provided and we should do internal backpressure retries
            if (callback) {
                // If write was successful, simply call the callback alerting consumer to write more chunks
                if (this.#last_write_result) {
                    callback();
                } else {
                    // Wait for backpressure to drain and retry writing of this chunk
                    this.drain(() => this.write(chunk, encoding, callback));
                }
            }

            // Return the write result boolean for synchronous consumer
            return this.#last_write_result;
        }

        // Trigger callback with an error if a write() is performed after response has completed
        if (callback) callback(new Error('Response is already completed/aborted'));

        return false;
    }

    /**
     * This method is used to end the current request and send response with specified body and headers.
     *
     * @param {String|Buffer|ArrayBuffer} body Optional
     * @returns {Boolean} 'false' signifies that the result was not sent due to built up backpressure.
     */
    send(body, close_connection) {
        if (!this.#completed) {
            // Abort body download buffer just to be safe for large incoming requests
            this.#wrapped_request._abort_buffer();

            // Call any bound hooks for type 'send'
            this._call_hooks('send');

            // Initiate response to write status code and headers
            this._initiate_response();

            // Mark request as completed and end request using uWS.Response.end()
            const result = this.#raw_response.end(body, close_connection);

            // Call any bound hooks for type 'complete' if no backpressure was built up
            if (result) {
                // Mark request as completed if we were able to send response properly
                this.#completed = true;
                this._call_hooks('complete');
            }

            return result;
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
     * @returns {Boolean} whether the chunk was sent or not due to backpressure
     */
    _stream_chunk(stream, chunk, total_size) {
        // Break execution if request is completed or aborted
        if (this.#completed) return;

        // Attempt to stream the chunk using appropriate uWS.Response chunk serving method
        let sent, finished;
        let last_offset = this.#raw_response.getWriteOffset();
        if (total_size) {
            // Attempt to stream the current chunk using uWS.tryEnd with a total_size for content-length header
            const [ok, done] = this.#raw_response.tryEnd(chunk, total_size);
            sent = ok;
            finished = done;
        } else {
            // Attempt to stream the current chunk uWS.write()
            sent = this.#raw_response.write(chunk);

            // Mark finished as false as this response must be ended with an empty send() call
            finished = false;
        }

        // If streaming has finished, then destroy our readable stream
        if (finished) {
            stream.destroy();
        } else if (!sent) {
            // Pause the readable stream as we could not fully send this chunk
            stream.pause();

            // Bind a uWS handler which waits for this response to be writable again
            const reference = this;
            this.#raw_response.onWritable((offset) => {
                // Retry streaming the remaining slice of the failed chunk
                const remaining = chunk.slice(offset - last_offset);
                return reference._stream_chunk(stream, remaining, total_size);
            });
        } else if (stream.isPaused()) {
            // Resume stream if it has been paused from a previously failed chunk
            stream.resume();
        }

        return sent;
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
            throw new Error(
                'Response.stream(readable, total_size) -> readable must be a Readable stream.'
            );

        // Bind a abort hook which will destroy the read stream if request is aborted
        this.hook('abort', () => {
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
        FilePool[path].on('error', (error) => this.throw_error(error));

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
        return this.header('Content-Disposition', `attachment; filename="${final_name}"`).type(
            extension
        );
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
     * This method allows you to throw an error which will be caught by the global error handler.
     *
     * @param {Error} error Error Class
     */
    throw_error(error) {
        this.#master_context.handlers.on_error(this.#wrapped_request, this, error);
    }

    /**
     * Compatibility function for attaching to events using `on()`.
     * @param {string} event event name
     * @param {Function} callback callback function
     */
    on(event, callback) {
        if (['close', 'finish'].includes(event)) {
            this.hook('complete', callback);
        } else {
            throw new Error(`Unknown event: ${event}`)
        }
    }

    /**
     * Compatibility function for attaching to events using `once()`.
     * @param {string} event event name
     * @param {Function} callback callback function
     */
    once(event, callback) {
        if (['close', 'finish'].includes(event)) {
            const cb = (...args) => {
                this.unhook('complete', cb);
                callback(...args)
            };
            this.hook('complete', cb);
        } else {
            throw new Error(`Unknown event: ${event}`)
        }
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
     * Returns a Writable stream associated with this response to be used for piping streams.
     * @returns {Writable}
     */
    get writable() {
        // Return from cache if one already exists
        if (this.#writable) return this.#writable;

        // Create a new writable stream object which writes with Response.write()
        this.#writable = new Writable({
            write: (chunk, encoding, callback) => this.write(chunk, encoding, callback),
        });

        // Bind a finish/close handler which will end the response once writable has closed
        this.#writable.once('finish', () => this.send());

        return this.#writable;
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
     * Unsupported property
     */
    get app() {
        this._throw_unsupported('app()');
    }

    /**
     * ExpressJS: Alias of Response.completed
     */
    get headersSent() {
        return this.#completed;
    }

    /**
     * ExpressJS: Alias of Response.status_code
     */
    get statusCode() {
        return this.#completed ? this.#status_code : undefined
    }

    locals = {};

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
     * ExpressJS: Alias of Response.delete_cookie()
     * @param {String} name
     */
    removeCookie(name) {
        return this.delete_cookie(name);
    }

    /**
     * ExpressJS: Alias of Response.delete_cookie() method.
     * @param {String} name
     */
    clearCookie(name) {
        return this.delete_cookie(name);
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
