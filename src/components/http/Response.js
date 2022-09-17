'use strict';
const cookie = require('cookie');
const signature = require('cookie-signature');
const status_codes = require('http').STATUS_CODES;
const mime_types = require('mime-types');
const stream = require('stream');
const emitter = require('events');

const NodeResponse = require('../compatibility/NodeResponse.js');
const ExpressResponse = require('../compatibility/ExpressResponse.js');
const { inherit_prototype } = require('../../shared/operators.js');

const FilePool = {};
const LiveFile = require('../plugins/LiveFile.js');
const SSEventStream = require('../plugins/SSEventStream.js');

class Response {
    #locals;
    #streaming = false;
    #initiated = false;
    #middleware_cursor;
    #wrapped_request;
    #raw_response;
    #upgrade_socket;
    #sse;
    route = null;

    /**
     * Returns the HTTP underlying status code of the response.
     * @private
     */
    _status_code;

    /**
     * Contains underlying headers for the response.
     * @private
     */
    _headers = {};

    /**
     * Contains underlying cookies for the response.
     * @private
     */
    _cookies;

    /**
     * Underlying lazy initialized writable body stream.
     * @private
     */
    _writable = null;

    /**
     * Alias of aborted property as they both represent the same request state in terms of inaccessibility.
     * @returns {Boolean}
     */
    completed = false;

    /**
     * Creates a new HyperExpress response instance that wraps a uWS.HttpResponse instance.
     *
     * @param {import('../router/Route.js')} route
     * @param {import('./Request.js')} wrapped_request
     * @param {import('uWebSockets.js').HttpResponse} raw_response
     * @param {import('uWebSockets.js').us_socket_context_t=} socket
     */
    constructor(route, wrapped_request, raw_response, socket = null) {
        // Store the provided references for later use
        this.route = route;
        this.#upgrade_socket = socket;
        this.#wrapped_request = wrapped_request;
        this.#raw_response = raw_response;

        // Bind the abort handler as required by uWebsockets.js for each uWS.HttpResponse to allow for async processing
        raw_response.onAborted(() => {
            // Mark this response as completed since the client has disconnected
            this.completed = true;

            // Stop streaming any further data from the client that may still be flowing to provide discarded access errors on the Request
            this.#wrapped_request._stop_streaming();

            // Ensure we have a writable/emitter instance to emit over
            if (this._writable) {
                // Emit an 'abort' event to signify that the client aborted the request
                this.emit('abort', this.#wrapped_request, this);

                // Emit an 'close' event to signify that the client has disconnected
                this.emit('close', this.#wrapped_request, this);
            }
        });
    }

    /* HyperExpress Methods */

    /**
     * Tracks middleware cursor position over a request's lifetime.
     * This is so we can detect any double middleware iterations and throw an error.
     * @private
     * @param {Number} position - Cursor position
     */
    _track_middleware_cursor(position) {
        // Track and ensure each middleware cursor value is greater than previously tracked value for sequential progression
        if (this.#middleware_cursor === undefined || position > this.#middleware_cursor)
            return (this.#middleware_cursor = position);

        // If position is not greater than last cursor then we likely have a double middleware execution
        this.throw(
            new Error(
                'ERR_DOUBLE_MIDDLEWARE_EXEUCTION_DETECTED: Please ensure you are not calling the next() iterator inside of an ASYNC middleware. You must only call next() ONCE per middleware inside of SYNCHRONOUS middlewares only!'
            )
        );
    }

    /**
     * Resume the associated request if it is paused.
     * @private
     */
    _resume_if_paused() {
        // Unpause the request if it is paused
        // Only do this if we have a readable stream which can be paused
        if (this.#wrapped_request._readable && this.#wrapped_request.isPaused()) this.#wrapped_request.resume();
    }

    /* Response Methods/Operators */

    /**
     * This method can be used to improve Network IO performance by executing
     * all network operations in a singular atomic structure.
     *
     * @param {Function} handler
     * @returns {Response} Response (Chainable)
     */
    atomic(handler) {
        if (typeof handler !== 'function')
            this.throw(new Error('HyperExpress: atomic(handler) -> handler must be a Javascript function'));

        // Cork the provided handler
        this.#raw_response.cork(handler);
        return this;
    }

    /**
     * This method is used to set a custom response code.
     *
     * @param {Number} code Example: response.status(403)
     * @returns {Response} Response (Chainable)
     */
    status(code) {
        // Set the numeric status code. Status text is appended before writing status to uws
        this._status_code = code;
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
        this.header('content-type', mime_types.lookup(mime_type) || 'text/plain');
        return this;
    }

    /**
     * This method can be used to write a response header and supports chaining.
     *
     * @param {String} name Header Name
     * @param {String|Array<String>} value Header Value
     * @param {Boolean=} overwrite If true, overwrites existing header value with same name
     * @returns {Response} Response (Chainable)
     */
    header(name, value, overwrite = true) {
        // Enforce header names to be lowercase
        name = name.toLowerCase();

        // Determine if this operation is an overwrite or append
        if (overwrite) {
            // Overwrite the header value in Array format
            this._headers[name] = Array.isArray(value) ? value : [value];
        } else if (Array.isArray(value)) {
            // Append the values to the existing array
            this._headers[name] = (this._headers[name] || []).concat(value);
        } else {
            // Initialize header values as an array to allow for multiple values if it does not exist
            if (this._headers[name] == undefined) {
                // Initialize header value as an array
                this._headers[name] = [value];
            } else {
                // Append the value to the header values
                this._headers[name].push(value);
            }
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

        // Initialize the cookies holder object if it does not exist
        if (this._cookies == undefined) this._cookies = {};

        // Store the seralized cookie value to be written during response
        this._cookies[name] = cookie.serialize(name, value, options);
        return this;
    }

    /**
     * This method is used to upgrade an incoming upgrade HTTP request to a Websocket connection.
     * @param {Object=} context Store information about the websocket connection
     */
    upgrade(context) {
        // Do not allow upgrades if request is already completed
        if (this.completed) return;

        // Ensure a upgrade_socket exists before upgrading ensuring only upgrade handler requests are handled
        if (this.#upgrade_socket == null)
            this.throw(
                new Error(
                    'HyperExpress: You cannot upgrade a request that does not come from an upgrade handler. No upgrade socket was found.'
                )
            );

        // Ensure our request is not paused to ensure socket is in a flowing state
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
        this.completed = true;
    }

    /**
     * Initiates response process by writing HTTP status code and then writing the appropriate headers.
     * @private
     * @returns {Boolean}
     */
    _initiate_response() {
        // Halt execution if response has already been initiated or completed
        if (this.#initiated) return false;

        // Emit the 'prepare' event to allow for any last minute response modifications
        if (this._writable) this.emit('prepare', this.#wrapped_request, this);

        // Mark the instance as initiated signifying that no more status/header based operations can be performed
        this.#initiated = true;

        // Ensure we are not in a paused state as uWS requires us to be a in a flowing state to be able to write status and headers
        this._resume_if_paused();

        // Write the appropriate status code to the response along with mapped status code message
        if (this._status_code)
            this.#raw_response.writeStatus(this._status_code + ' ' + status_codes[this._status_code]);

        // Iterate through all headers and write them to uWS
        Object.keys(this._headers).forEach((name) =>
            this._headers[name].forEach((value) => this.#raw_response.writeHeader(name, value))
        );

        // Iterate through all cookies and write them to uWS
        if (this._cookies)
            Object.keys(this._cookies).forEach((name) =>
                this.#raw_response.writeHeader('set-cookie', this._cookies[name])
            );

        // Signify that the response was successfully initiated
        return true;
    }

    /**
     * Binds a drain handler which gets called with a byte offset that can be used to try a failed chunk write.
     * You MUST perform a write call inside the handler for uWS chunking to work properly.
     * You MUST return a boolean value indicating if the write was successful or not.
     *
     * @param {function(number):boolean} handler Synchronous callback only
     */
    drain(handler) {
        // Bind a writable handler with a fallback return value to true as uWS expects a Boolean
        this.#raw_response.onWritable((offset) => {
            // Retrieve the write result from the handler
            const output = handler(offset);

            // Throw an exception if the handler did not return a boolean value as that is an improper implementation
            if (typeof output !== 'boolean')
                this.throw(
                    new Error(
                        'HyperExpress: Response.drain(handler) -> handler must return a boolean value stating if the write was successful or not.'
                    )
                );

            // Return the boolean value to uWS as required by uWS documentation
            return output;
        });
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
        if (!this.completed) {
            // Determine if streaming flag is not enabled yet
            if (!this.#streaming) {
                // Mark this request as streaming
                this.#streaming = true;

                // Bind an 'finish' event handler to send response once a piped stream has completed
                this.once('finish', () => this.send());
            }

            // Ensure response has been initiated before writing any chunks
            this._initiate_response();

            // Attempt to write the chunk to the client
            const written = this.#raw_response.write(chunk);
            if (written) {
                // If chunk write was a success, we can move onto consuming the next chunk
                if (callback) callback();

                // Return true here to signify that this chunk was written successfully
                return true;
            } else if (callback) {
                // Wait for this chunk to be written to the client
                let drained = false;
                return this.drain(() => {
                    // If this response has been completed, we can stop waiting for drainage
                    if (this.completed) return true;

                    // Trigger the callback and inverse the drained flag to signify that we are no longer waiting for drainage in this scope
                    if (!drained) {
                        drained = true;
                        callback();
                    }

                    // The drain() method requires a boolean value to be returned to uWS to signify if the write was successful or not
                    return drained;
                });
            }
        }

        // Trigger callback with an error if a write() is performed after response has completed
        if (callback) callback(new Error('HyperExpress: Response is already completed/aborted'));

        // Return false here to signify that this chunk was not written successfully
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
     * Returns the custom content length header value if one was set.
     *
     * @private
     * @returns {Number=}
     */
    _custom_content_length() {
        const header = this._headers['content-length'];
        const length = parseInt(Array.isArray(header) ? header[header.length - 1] : header);
        if (!isNaN(length) && length > 0) return length;
    }

    /**
     * This method is used to end the current request and send response with specified body and headers.
     *
     * @param {String|Buffer|ArrayBuffer=} body Optional
     * @param {Boolean=} close_connection
     * @returns {Response}
     */
    send(body, close_connection) {
        // Ensure response connection is still active
        if (!this.completed) {
            // Attempt to initiate the response to ensure status code & headers get written first
            if (this._initiate_response()) {
                // Stop downloading further body chunks as we are done with the response
                this.#wrapped_request._stop_streaming();
            }

            // Wait for any expected request body data to be fully received to prevent an ECONNRESET error
            if (!this.#wrapped_request.received)
                return this.#wrapped_request.once('received', () => this.send(body, close_connection));

            // Determine if we have a custom content length header, no body data and were not streaming the request body
            if (body === undefined && !this.#streaming && this._custom_content_length() !== undefined) {
                // Send the response with the uWS.HttpResponse.endWithoutBody() method as we have no body data
                // NOTE: This method is completely undocumented by uWS but exists in the source code to solve the problem of no body being sent with a custom content-length
                this.#raw_response.endWithoutBody();
            } else {
                // Send the response with the uWS.HttpResponse.end(body, close_connection) method as we have some body data
                this.#raw_response.end(body, close_connection);
            }

            // Emit the 'finish' event to signify that the response has been sent without streaming
            if (this._writable && !this.#streaming) this.emit('finish', this.#wrapped_request, this);

            // Mark request as completed if we were able to send response properly
            this.completed = true;

            // Emit the 'close' event to signify that the response has been completed
            if (this._writable) this.emit('close', this.#wrapped_request, this);
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
        // The specific uWS method to stream the chunk to the client differs depending on if we have a total_size or not
        let sent, finished;
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

        // Return the sent and finished booleans
        return [sent, finished];
    }

    /**
     * Streams individual chunk from a stream.
     * Delivers with chunked transfer without content-length header when no total_size is specified.
     * Delivers with backpressure handling and content-length header when a total_size is specified.
     *
     * @private
     * @param {stream.Readable} stream
     * @param {Buffer} chunk
     * @param {Number=} total_size
     */
    _stream_chunk(stream, chunk, total_size) {
        // Ensure the client is still connected and request is pending
        if (!this.completed) {
            // Remember the initial write offset for future backpressure sliced chunks
            // Write the chunk to the client using the appropriate uWS chunk writing method
            const write_offset = this.write_offset;
            const [sent, finished] = this._uws_write_chunk(chunk, total_size);
            if (finished) {
                // Destroy the readable stream as no more writing will occur
                if (!stream.destroyed) stream.destroy();
            } else if (!sent) {
                // Pause the readable stream to prevent any further data from being read as chunk was not fully sent
                if (!stream.isPaused()) stream.pause();

                // Bind a drain handler to relieve backpressure
                // Note! This callback may be called as many times as neccessary to send a full chunk when using the tryEnd method
                this.drain((offset) => {
                    // Check if the response has been completed / connection has been closed
                    if (this.completed) {
                        // Destroy the readable stream as no more writing will occur
                        if (!stream.destroyed) stream.destroy();

                        // Return true to signify this was a no-op
                        return true;
                    }

                    // If we have a total size then we need to serve sliced chunks as uWS does not buffer under the hood
                    if (total_size) {
                        // Slice the chunk to the correct offset and send it to the client
                        const [flushed, ended] = this._uws_write_chunk(chunk.slice(offset - write_offset), total_size);
                        if (ended) {
                            // Destroy the readable stream as no more writing will occur
                            if (!stream.destroyed) stream.destroy();
                        } else if (flushed) {
                            // Resume the readable stream to allow more data to be read
                            if (stream.isPaused()) stream.resume();
                        }

                        // Return the flushed boolean as that signifies whether this specific chunk was fully sent
                        return flushed;
                    }

                    // Resume the readable stream to allow more data to be read
                    if (stream.isPaused()) stream.resume();

                    // Return true to signify this was a no-op
                    return true;
                });
            }
        }
    }

    /**
     * This method is used to serve a readable stream as response body and send response.
     * By default, this method will use chunked encoding transfer to stream data.
     * If your use-case requires a content-length header, you must specify the total payload size.
     *
     * @param {stream.Readable} readable A Readable stream which will be consumed as response body
     * @param {Number=} total_size Total size of the Readable stream source in bytes (Optional)
     */
    stream(readable, total_size) {
        // Ensure readable is an instance of a stream.Readable
        if (!(readable instanceof stream.Readable))
            this.throw(
                new Error('HyperExpress: Response.stream(readable, total_size) -> readable must be a Readable stream.')
            );

        // Do not allow streaming if response has already been aborted or completed
        if (!this.completed) {
            // Initiate response as we will begin writing body chunks
            this._initiate_response();

            // Bind an 'abort' event handler which will destroy the consumed stream if request is aborted
            this.once('abort', () => (!readable.destroyed ? readable.destroy() : null));

            // Bind an 'data' event handler on the readable stream to stream each chunk to the client
            readable.on('data', (chunk) => this._stream_chunk(readable, chunk, total_size));

            // Bind an 'end' event handler on the readable stream to send the response if no total size was provided hence chunked encoding is used
            if (total_size === undefined) readable.once('end', () => this.send());
        }
    }

    /**
     * Instantly aborts/closes current request without writing a status response code.
     * Use this to instantly abort a request where a proper response with an HTTP status code is not neccessary.
     */
    close() {
        // Ensure request has already not been completed
        if (!this.completed) {
            // Mark request as completed
            this.completed = true;

            // Ensure request is not paused and socket is in a flowing state
            this._resume_if_paused();

            // Stop streaming any remaining body data
            this.#wrapped_request._stop_streaming();

            // Close the underlying uWS request
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
        if (!this.completed) return this.status(302).header('location', url).send();
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
        this.type(live_file.extension);

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
        return this.header('content-disposition', `attachment; filename="${final_name}"`).type(extension);
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
     * @param {Error} error
     * @returns {Response}
     */
    throw(error) {
        // If the error is not an instance of Error, wrap it in an Error object that
        if (!(error instanceof Error)) error = new Error(`ERR_CAUGHT_NON_ERROR_TYPE: ${error}`);

        // Trigger the global error handler
        this.route.app.handlers.on_error(this.#wrapped_request, this, error);

        // Return this response instance
        return this;
    }

    /* HyperExpress Properties */

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
     * Returns the underlying raw uWS.Response object.
     * Note! Utilizing any of uWS.Response's methods after response has been sent will result in an invalid discarded access error.
     * @returns {import('uWebSockets.js').Response}
     */
    get raw() {
        return this.#raw_response;
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
        return this.completed;
    }

    /**
     * Upgrade socket context for upgrade requests.
     * @returns {import('uWebSockets.js').ux_socket_context}
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

    /**
     * Returns the current response body content write offset in bytes.
     * Use in conjunction with the drain() offset handler to retry writing failed chunks.
     * Note! This method will return `-1` after the Response has been completed and the connection has been closed.
     * @returns {Number}
     */
    get write_offset() {
        return this.completed ? -1 : this.#raw_response.getWriteOffset();
    }

    /**
     * Throws a descriptive error when an unsupported ExpressJS property/method is invocated.
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
        // Initialize a passthrough method for each descriptor
        const passthrough = function () {
            // Call the original function with the Request scope
            return original.apply(this, arguments);
        };

        // Return the passthrough function
        return passthrough;
    },
});

// Inherit the stream.Writable and EventEmitter prototypes
// Lazy initialize the stream.Writable instance on each call to any of the inherited methods
inherit_prototype({
    from: [stream.Writable.prototype, emitter.prototype],
    to: Response.prototype,
    override: (name) => '_super_' + name, // Prefix all overrides with _super_
    method: (type, name, original) => {
        // Initialize a pass through method
        const passthrough = function () {
            // Lazy initialize the writable stream on local scope
            if (this._writable === null) {
                // Initialize the writable stream
                this._writable = new stream.Writable(this.route.streaming.writable);

                // Bind the natively implemented _write and _writev methods
                // Ensure the Response scope is passed to these methods
                this._writable._write = descriptors['_write'].value.bind(this);
                this._writable._writev = descriptors['_writev'].value.bind(this);
            }

            // Return the original function with the writable stream as the context
            return original.apply(this._writable, arguments);
        };

        // Otherwise, simply return the passthrough method
        return passthrough;
    },
});

module.exports = Response;
