const status_codes = require('../../constants/status_codes.json');
const mime_types = require('../../constants/mime_types.json');
const cookie = require('cookie');
const signature = require('cookie-signature');

const LiveFile = require('../features/LiveFile.js');
const FilePool = {};

class Response {
    #wrapped_request;
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
     * @param {String} value Header Value
     * @returns {Response} Response (Chainable)
     */
    header(name, value) {
        // Initialize headers container
        if (this.#headers == undefined)
            this.#headers = {
                keys: [],
                values: [],
            };

        this.#headers.keys.push(name);
        this.#headers.values.push(value);
        return this;
    }

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
        } else {
            delete options.expires;
        }

        // Sign cookie value if signing is enabled and a valid secret is provided
        if (sign_cookie && typeof options.secret == 'string') {
            value = signature.sign(value, options.secret);
            options.encode = false; // Turn off encoding to prevent loss of signature structure
        }

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
     * Executes all registered hooks (callbacks) for specified type.
     *
     * @param {String} type
     */
    _call_hooks(type) {
        if (this.#hooks && this.#hooks[type]) this.#hooks[type].forEach((hook) => hook());
    }

    /**
     * Binds a hook (callback) that gets executed based on specified type.
     * See documentation for supported hook types.
     *
     * @param {String} type
     * @param {Function} callback
     * @returns {Response} Chainable
     */
    hook(type, callback) {
        // Initialize hooks if they haven't been yet
        if (this.#hooks == undefined) this.#hooks = {};

        // Initialize hooks array on first invocation
        if (this.#hooks[type] == undefined) this.#hooks[type] = [];

        // Store hook into individual location
        this.#hooks[type].push(callback);
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
     * Returns current global byte write offset for the response.
     *
     * @returns {Number}
     */
    _write_offset() {
        return this.#raw_response.getWriteOffset();
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
     * @returns {Boolean} Boolean (true || false)
     */
    send(body, close_connection = false) {
        if (!this.#completed) {
            // Trigger session closure if a session is preset in request object
            let session = this.#wrapped_request.session;
            if (typeof session == 'object' && session.ready)
                session._perform_closure(this, this.#master_context);

            // Write custom HTTP status if specified
            if (this.#status_code) this.#raw_response.writeStatus(this.#status_code);

            // Write headers if specified
            if (this.#headers)
                for (let i = 0; i < this.#headers.keys.length; i++)
                    this.#raw_response.writeHeader(this.#headers.keys[i], this.#headers.values[i]);

            // Abort body download buffer just to be safe for large incoming requests
            this.#wrapped_request._abort_buffer();

            // Mark request as completed and end request using uWS.Response.end()
            this.#completed = true;
            this.#raw_response.end(body, close_connection);

            // Call any bound hooks for type 'complete'
            this._call_hooks('complete');
            return true;
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
     * Sends file content with appropriate content-type header based on file extension from LiveFile.
     *
     * @param {LiveFile} live_file
     */
    _send_file(live_file) {
        if (!this.#type_written) this.type(live_file.extension);
        return this.send(live_file.content);
    }

    /**
     * This method is an alias of send() method except it sends the file at specified path.
     * This method automatically writes the appropriate content-type header if one has not been specified yet.
     * This method also maintains its own cache pool in memory allowing for fast performance.
     * Avoid using this method to a send a large file as it will be kept in memory.
     *
     * @param {String} path
     */
    file(path) {
        // Send file from local cache pool if available
        if (FilePool[path]) return this._send_file(FilePool[path]);

        // Create new LiveFile instance in local cache pool for new file path
        FilePool[path] = new LiveFile({
            path: path,
        });

        // Assign error handler to live file
        FilePool[path].on('error', (error) => this.throw_error(error));

        // Serve file once initial content has been read
        FilePool[path].once('reload', () => this._send_file(FilePool[path]));
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
}

module.exports = Response;
