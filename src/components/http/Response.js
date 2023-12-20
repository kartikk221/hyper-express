'use strict';
const crypto = require('crypto');
const cookie = require('cookie');
const signature = require('cookie-signature');
const status_codes = require('http').STATUS_CODES;
const mime_types = require('mime-types');
const stream = require('stream');

const NodeResponse = require('../compatibility/NodeResponse.js');
const ExpressResponse = require('../compatibility/ExpressResponse.js');
const { inherit_prototype } = require('../../shared/operators.js');

const FilePool = {};
const LiveFile = require('../plugins/LiveFile.js');
const SSEventStream = require('../plugins/SSEventStream.js');

class Response {
    _sse;
    _locals;
    route = null;
    _corked = false;
    _streaming = false;
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

        // Bind the abort handler as required by uWebsockets.js for each uWS.HttpResponse to allow for async processing
        raw_response.onAborted(() => {
            // If this request has already been initiated, as the request cannot be aborted after it has been initiated
            if (this.initiated) return;

            // Mark this response as completed since the client has disconnected
            this.completed = true;

            // Stop the body parser from accepting any more data
            this._wrapped_request._body_parser_stop();

            // Ensure we have a writable/emitter instance to emit over
            if (this._writable) {
                // Emit an 'abort' event to signify that the client aborted the request
                this.emit('abort', this._wrapped_request, this);

                // Emit an 'close' event to signify that the client has disconnected
                this.emit('close', this._wrapped_request, this);
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
        if (this._middleware_cursor === undefined || position > this._middleware_cursor)
            return (this._middleware_cursor = position);

        // If position is not greater than last cursor then we likely have a double middleware execution
        this.throw(
            new Error(
                'ERR_DOUBLE_MIDDLEWARE_EXEUCTION_DETECTED: Please ensure you are not calling the next() iterator inside of an ASYNC middleware. You must only call next() ONCE per middleware inside of SYNCHRONOUS middlewares only!'
            )
        );
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
        // Ensure handler is a function
        if (typeof handler !== 'function')
            this.throw(new Error('HyperExpress: atomic(handler) -> handler must be a Javascript function'));

        // Cork the provided handler
        if (!this.completed) this._raw_response.cork(handler);
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
        // Set the numeric status code. Status text is appended before writing status to uws
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
        // Remove leading dot from mime type if present
        if (mime_type[0] === '.') mime_type = mime_type.substring(1);

        // Determine proper mime type and send response
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
        // Enforce lowercase for header name
        name = name.toLowerCase();

        // Determine if this operation is an overwrite onto any existing header values
        if (overwrite) {
            // Overwrite the header value
            this._headers[name] = value;

            // Check if some value(s) already exist for this header name
        } else if (this._headers[name]) {
            // Check if there are multiple current values for this header name
            if (Array.isArray(this._headers[name])) {
                // Check if the provided value is an array
                if (Array.isArray(value)) {
                    // Concatenate the current and provided header values
                    this._headers[name] = this._headers[name].concat(value);
                } else {
                    // Push the provided header value to the current header values array
                    this._headers[name].push(value);
                }
            } else {
                // Convert the current header value to an array
                this._headers[name] = [this._headers[name], value];
            }
        } else {
            // Write the header value
            this._headers[name] = value;
        }

        // Make chainable
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
        // Determine if this is a delete operation and recursively call self with appropriate options
        if (name && value === null)
            return this.cookie(name, '', null, {
                maxAge: 0,
            });

        // If an options object was not provided, shallow copy it to prevent mutation to the original object
        // If an options object was not provided, create a new object with default options
        options = options
            ? { ...options }
            : {
                  secure: true,
                  sameSite: 'none',
                  path: '/',
              };

        // Determine if a expiry duration was provided in milliseconds
        if (typeof expiry == 'number') {
            // Set the expires value of the cookie if one was not already defined
            options.expires = options.expires || new Date(Date.now() + expiry);

            // Define a max age if one was not already defined
            options.maxAge = options.maxAge || Math.round(expiry / 1000);
        }

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
        if (this._upgrade_socket == null)
            this.throw(
                new Error(
                    'HyperExpress: You cannot upgrade a request that does not come from an upgrade handler. No upgrade socket was found.'
                )
            );

        // Resume the request in case it was paused
        this._wrapped_request.resume();

        // Cork the response if it has not been corked yet
        if (this._cork && !this._corked) {
            this._corked = true;
            return this._raw_response.cork(this.upgrade.bind(this, context));
        }

        // Call uWS.Response.upgrade() method with user data, protocol headers and uWS upgrade socket
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
        if (this.initiated) return false;

        // Emit the 'prepare' event to allow for any last minute response modifications
        if (this._writable) this.emit('prepare', this._wrapped_request, this);

        // Mark the instance as initiated signifying that no more status/header based operations can be performed
        this.initiated = true;

        // Resume the request in case it was paused
        this._wrapped_request.resume();

        // Write the appropriate status code to the response along with mapped status code message
        if (this._status_code || this._status_message)
            this._raw_response.writeStatus(
                this._status_code + ' ' + (this._status_message || status_codes[this._status_code])
            );

        // Iterate through all headers and write them to uWS
        for (const name in this._headers) {
            // If this is a custom content-length header, we need to skip it as we will write it later during the response send
            if (name == 'content-length') continue;

            // Write the header value to uWS
            const values = this._headers[name];
            if (Array.isArray(values)) {
                // Write each individual header value to uWS as there are multiple headers
                for (const value of values) {
                    this._raw_response.writeHeader(name, value);
                }
            } else {
                // Write the single header value to uWS
                this._raw_response.writeHeader(name, values);
            }
        }

        // Iterate through all cookies and write them to uWS
        if (this._cookies) {
            for (const name in this._cookies) {
                this._raw_response.writeHeader('set-cookie', this._cookies[name]);
            }
        }

        // Signify that the response was successfully initiated
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
        // Determine if this is the first time the drain handler is being set
        const is_first_time = this._drain_handler === null;

        // Store the handler which will be used to provide drain events to uWS
        this._drain_handler = handler;

        // Bind a writable handler with a fallback return value to true as uWS expects a Boolean
        if (is_first_time)
            this._raw_response.onWritable((offset) => {
                // Retrieve the write result from the handler
                const output = this._drain_handler(offset);

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
     * @param {String} encoding
     * @param {Function} callback
     */
    _write(chunk, encoding, callback) {
        // Spread the arguments to allow for a single object argument
        if (chunk.chunk && chunk.encoding) {
            // Pull out the chunk and encoding from the object argument
            const temp = chunk;
            chunk = temp.chunk;
            encoding = temp.encoding;

            // Only use the callback from this specific chunk if one is not provided
            // This is because we want to respect the iteratore callback from the _writev method
            if (!callback) callback = temp.callback;
        }

        // Ensure this request has not been completed yet
        if (!this.completed) {
            // If this response has not be marked as an active stream, mark it as one and bind a 'finish' event handler to send response once a piped stream has completed
            if (!this._streaming) {
                this._streaming = true;
                this.once('finish', () => this.send());
            }

            // Attempt to write the chunk to the client with backpressure handling
            this._stream_chunk(chunk).then(callback).catch(callback);
        } else {
            // Trigger callback to flush the chunk as the response has already been completed
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
        // Serve the chunk at the current index
        this._write(chunks[index], null, (error) => {
            // Pass the error to the callback if one was provided
            if (error) return callback(error);

            // Trigger the specific callback for the chunk we just served if it was in object format
            if (typeof chunks[index].callback == 'function') chunks[index].callback();

            // Determine if we have more chunks after the chunk we just served
            if (index < chunks.length - 1) {
                // Recursively serve the remaining chunks
                this._writev(chunks, callback, index + 1);
            } else {
                // Trigger the callback as all chunks have been served
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
        // Ensure response connection is still active
        if (!this.completed) {
            // If the response has not been corked yet, cork it and wait for the next tick to send the response
            if (this._cork && !this._corked) {
                this._corked = true;
                return this._raw_response.cork(() => this.send(body, close_connection));
            }

            // Initiate the response to begin writing the status code and headers
            this._initiate_response();

            // Determine if the request still has not fully received the whole request body yet
            if (!this._wrapped_request.received) {
                // Instruct the request to stop accepting any more data as a response is being sent
                this._wrapped_request._body_parser_stop();

                // Wait for the request to fully receive the whole request body before sending the response
                return this._wrapped_request.once('received', () =>
                    this._raw_response.cork(() => this.send(body, close_connection))
                );
            }

            // If we have no body and are not streaming and have a custom content-length header, we need to send a response without a body with the custom content-length header
            const custom_length = this._headers['content-length'];
            if (!(body !== undefined || this._streaming || !custom_length)) {
                // We can only use one of the content-lengths, so we will use the last one if there are multiple
                const content_length =
                    typeof custom_length == 'string' ? custom_length : custom_length[custom_length.length - 1];

                // Send the response with the uWS.HttpResponse.endWithoutBody() method as we have no body data
                // NOTE: This method is completely undocumented by uWS but exists in the source code to solve the problem of no body being sent with a custom content-length
                this._raw_response.endWithoutBody(content_length, close_connection);
            } else {
                // Send the response with the uWS.HttpResponse.end(body, close_connection) method as we have some body data
                this._raw_response.end(body, close_connection);
            }

            // Emit the 'finish' event to signify that the response has been sent without streaming
            if (this._writable && !this._streaming) this.emit('finish', this._wrapped_request, this);

            // Mark request as completed as it has been sent
            this.completed = true;

            // Emit the 'close' event to signify that the response has been completed
            if (this._writable) this.emit('close', this._wrapped_request, this);
        }

        // Make chainable
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
            const [ok, done] = this._raw_response.tryEnd(chunk, total_size);
            sent = ok;
            finished = done;
        } else {
            // Attempt to stream the current chunk uWS.write()
            sent = this._raw_response.write(chunk);

            // Since we are streaming without a total size, we are not finished
            finished = false;
        }

        // Return the sent and finished booleans
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
        // If the request has already been completed, we can resolve the promise immediately as we cannot write to the client anymore
        if (this.completed) return Promise.resolve();

        // Return a Promise which resolves once the chunk has been fully sent to the client
        return new Promise((resolve) =>
            this._raw_response.cork(() => {
                // Ensure the client is still connected after the cork
                if (this.completed) return resolve();

                // Initiate the response to ensure status code & headers get written first if they have not been written yet
                this._initiate_response();

                // Remember the initial write offset for future backpressure sliced chunks
                // Write the chunk to the client using the appropriate uWS chunk writing method
                const write_offset = this.write_offset;
                const [sent] = this._uws_write_chunk(chunk, total_size);
                if (sent) {
                    // The chunk was fully sent, we can resolve the promise
                    resolve();
                } else {
                    // Bind a drain handler to relieve backpressure
                    // Note! This callback may be called as many times as neccessary to send a full chunk when using the tryEnd method
                    this.drain((offset) => {
                        // Check if the response has been completed / connection has been closed since we can no longer write to the client
                        if (this.completed) {
                            resolve();
                            return true;
                        }

                        // Attempt to write the remaining chunk to the client
                        const remaining = chunk.slice(offset - write_offset);
                        const [flushed] = this._uws_write_chunk(remaining, total_size);
                        if (flushed) resolve();

                        // Return the flushed boolean as not flushed means we are still waiting for more drain events from uWS
                        return flushed;
                    });
                }
            })
        );
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
        // Ensure readable is an instance of a stream.Readable
        if (!(readable instanceof stream.Readable))
            this.throw(
                new Error('HyperExpress: Response.stream(readable, total_size) -> readable must be a Readable stream.')
            );

        // Do not allow streaming if response has already been aborted or completed
        if (!this.completed) {
            // Bind an 'close' event handler which will destroy the consumed stream if request is closed
            this.once('close', () => (!readable.destroyed ? readable.destroy() : null));

            // Define a while loop to consume chunks from the readable stream until it is fully consumed or the response has been completed
            while (!this.completed && !(readable.readableEnded || readable.destroyed)) {
                // Attempt to read a chunk from the readable stream
                let chunk = readable.read();
                if (!chunk) {
                    // Wait for the readable stream to emit a 'readable' event if no chunk was available in our initial read attempt
                    await new Promise((resolve) => {
                        // Bind a 'end' handler in case the readable stream ends before emitting a 'readable' event
                        readable.once('end', resolve);

                        // Bind a 'readable' handler to resolve the promise once a chunk is available to read
                        readable.once('readable', () => {
                            // Unbind the 'end' handler as we have a chunk available to read
                            readable.removeListener('end', resolve);

                            // Resolve the promise to continue the while loop
                            resolve();
                        });
                    });

                    // Attempt to read a chunk from the readable stream again
                    chunk = readable.read();
                }

                // Stream the chunk to the client
                if (chunk) await this._stream_chunk(chunk, total_size);
            }

            // If we had no total size and the response is still not completed, we need to end the response
            // This is because no total size means we served with chunked encoding and we need to end the response as it is a unbounded stream
            if (!this.completed && !total_size) this.send();
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

            // Stop the body parser from accepting any more data
            this._wrapped_request._body_parser_stop();

            // Resume the request in case it was paused
            this._wrapped_request.resume();

            // Close the underlying uWS request
            this._raw_response.close();
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
        let query_parameters = this._wrapped_request.query_parameters;
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
        this.route.app.handlers.on_error(this._wrapped_request, this, error);

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
        // Return a new SSE instance if one has not been created yet
        if (this._wrapped_request.method === 'GET') {
            // Create new SSE instance if one has not been created yet
            if (this._sse === undefined) this._sse = new SSEventStream(this);
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

// Inherit the stream.Writable prototype and lazy initialize the stream on first call to any inherited method
inherit_prototype({
    from: stream.Writable.prototype,
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
