const cookie = require('cookie');
const signature = require('cookie-signature');
const status_codes = require('../../constants/status_codes.json');
const mime_types = require('../../constants/mime_types.json');

const LiveFile = require('../features/LiveFile.js');
const FilePool = {};

class Response {
    #wrapped_request;
    #middleware_cursor;
    #raw_response;
    #master_context;
    #upgrade_socket;
    #status_code;
    #headers;
    #completed = false;
    #type_written = false;
    #hooks;

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
        let reference = this;
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
        // Match status code Number to a status message and call uWS.Response.writeStatus
        let message = status_codes[code];
        this.#status_code = code + ' ' + message;
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
        let mime_header = mime_types[mime_type] || 'text/plain';
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

    #cookies;
    /**
     * This method is used to write a cookie to incoming request.
     * Note! This method utilized .header() therefore it must be called
     * after setting a custom status code.
     *
     * @param {String} name Cookie Name
     * @param {String} value Cookie Value
     * @param {Number} expiry In milliseconds
     * @param {Object} options Cookie Options
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
     * This method is used to upgrade an incoming upgrade HTTP request to a Websocket connection.
     *
     * @param {Object} user_data Store any information about the websocket connection
     * @returns {Boolean} Boolean (true || false)
     */
    upgrade(user_data) {
        if (!this.#completed) {
            // Ensure a upgrade_socket exists before upgrading ensuring only upgrade handler requests are handled
            if (this.#upgrade_socket == null)
                throw new Error(
                    'You cannot upgrade a request that does not come from an upgrade handler. No upgrade socket was found.'
                );

            // Mark request as completed and call uWS.Response.upgrade() with upgrade_socket
            let headers = this.#wrapped_request.headers;
            let sec_key = headers['sec-websocket-key'];
            let sec_protocol = headers['sec-websocket-protocol'];
            let sec_extensions = headers['sec-websocket-extensions'];

            this.#completed = true;
            this.#raw_response.upgrade(
                user_data,
                sec_key,
                sec_protocol,
                sec_extensions,
                this.#upgrade_socket
            );
            return true;
        }
        return false;
    }

    /**
     * This method can be used to write the body in chunks/parts and .send()
     * must be called to end the request.
     *
     * @param {String|Buffer|ArrayBuffer} body
     * @returns {Response} Response (Chainable)
     */
    write(body) {
        if (!this.#completed) this.#raw_response.write(body);
        return this;
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

            // Trigger session closure if a session is preset in request object
            let session = this.#wrapped_request.session;
            if (typeof session == 'object' && session.ready)
                session._perform_closure(this, this.#master_context);

            // Write custom HTTP status if specified
            if (this.#status_code) this.#raw_response.writeStatus(this.#status_code);

            // Write headers if specified
            if (this.#headers)
                Object.keys(this.#headers).forEach((name) =>
                    this.#headers[name].forEach((value) =>
                        this.#raw_response.writeHeader(name, value)
                    )
                );

            // Mark request as completed and end request using uWS.Response.end()
            this.#completed = true;
            let result = this.#raw_response.end(body, close_connection);

            // Call any bound hooks for type 'complete' if no backpressure was built up
            if (result) this._call_hooks('complete');

            return result;
        }
        return false;
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
     * @returns {Boolean} Boolean (true || false)
     */
    redirect(url) {
        if (!this.#completed) return this.status(302).header('location', url).send();
        return false;
    }

    /**
     * This method is an alias of send() method except it accepts an object
     * and automatically stringifies the passed payload object.
     *
     * @param {Object} body JSON body
     * @returns {Boolean} Boolean (true || false)
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
     * @param {String} name
     * @returns {Boolean} Boolean (true || false)
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
     * @returns {Boolean} Boolean (true || false)
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
     * @param {function(Object):void} callback Executed after file has been served with the parameter being the cache pool.
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
     * @param {String} filename
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
        this.#master_context.error_handler(this.#wrapped_request, this, error);
    }

    /* Response Getters */

    /**
     * Returns the underlying raw uWS.Response object.
     */
    get raw() {
        return this.#raw_response;
    }

    /**
     * Returns current state of request in regards to whether the source is still connected.
     */
    get aborted() {
        return this.#completed;
    }

    /**
     * Alias of aborted property as they both represent the same request state in terms of inaccessibility.
     */
    get completed() {
        return this.#completed;
    }

    /**
     * Upgrade socket context for upgrade requests.
     */
    get upgrade_socket() {
        return this.#upgrade_socket;
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
    writeHead(name, values) {
        return this.append(name, values);
    }

    /**
     * ExpressJS: Alias of Response.append()
     */
    setHeader(name, values) {
        return this.append(name, values);
    }

    /**
     * ExpressJS: Alias of Response.writeHeaders
     * @param {Object} headers
     */
    setHeaders(headers) {
        this.writeHeaders(headers);
    }

    /**
     * ExpressJS: Writes multiple headers in form of an object
     * @param {Object} headers
     */
    writeHeaders(headers) {
        Object.keys(headers).forEach((name) => this.header(name, headers[name]));
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
     * @param {Object} object
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
