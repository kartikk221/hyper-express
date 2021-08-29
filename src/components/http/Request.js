const Session = require('../session/Session.js');
const cookie = require('cookie');
const signature = require('cookie-signature');
const querystring = require('query-string');
const operators = require('../../shared/operators.js');

// We'll re-use this buffer throughout requests with empty bodies
const EMPTY_BUFFER = Buffer.from('');

class Request {
    #master_context;
    #raw_request = null;
    #raw_response = null;
    #method;
    #url;
    #path;
    #query;
    #buffer_pending = false;
    #buffer_resolve;
    #body_buffer;
    #body_text;
    #body_json;
    #remote_ip;
    #remote_proxy_ip;
    #cookies;
    #headers = {};
    #path_parameters = {};
    #query_parameters;
    #session;

    constructor(raw_request, raw_response, path_parameters_key, master_context) {
        // Pre-parse core data attached to volatile uWebsockets request/response objects
        this.#raw_request = raw_request;
        this.#raw_response = raw_response;
        this.#master_context = master_context;

        // Execute requesr operators for pre-parsing common access data
        // Attach session engine and parse path parameters based on specification
        this._request_information();
        this._request_headers();
        this._path_parameters(path_parameters_key);
        this._load_session_engine(master_context.session_engine);
    }

    /**
     * INTERNAL METHOD! This method is an internal method and should NOT be called manually.
     * This method parses initial data from uWS.Request and uWS.Response to prevent forbidden
     * stack memory access errors for asynchronous usage
     */
    _request_information() {
        // Retrieve raw uWS request & response objects
        let request = this.#raw_request;
        let response = this.#raw_response;

        // Perform request pre-parsing for common access data
        // This is required as uWS.Request is forbidden for access after initial execution
        this.#method = request.getMethod().toUpperCase();
        this.#path = request.getUrl();
        this.#query = request.getQuery();
        this.#url = this.#path + (this.#query ? '?' + this.#query : '');
        this.#remote_ip = response.getRemoteAddressAsText();
        this.#remote_proxy_ip = response.getProxiedRemoteAddressAsText();
    }

    /**
     * INTERNAL METHOD! This method is an internal method and should NOT be called manually.
     * This method parses request headers utilizing uWS.Request.forEach((key, value) => {})
     */
    _request_headers() {
        this.#raw_request.forEach((key, value) => (this.#headers[key] = value));
    }

    /**
     * INTERNAL METHOD! This method is an internal method and should NOT be called manually.
     * This method parses path parameters from incoming request using a parameter key
     *
     * @param {Array} parameters_key [[key, index], ...]
     */
    _path_parameters(parameters_key) {
        if (parameters_key.length > 0) {
            let path_parameters = this.#path_parameters;
            let request = this.#raw_request;
            parameters_key.forEach(
                (keySet) => (path_parameters[keySet[0]] = request.getParameter(keySet[1]))
            );
        }
    }

    /**
     * INTERNAL METHOD! This method is an internal method and should NOT be called manually.
     * This method is used to initiate a Session object on an incoming request.
     *
     * @param {SessionEngine} session_engine
     */
    _load_session_engine(session_engine) {
        if (session_engine) this.#session = new Session(session_engine, this);
    }

    /* Request Methods/Operators */

    /**
     * Securely unsigns a value with provided secret and returns its original value upon successful verification.
     *
     * @param {String} signed_value
     * @param {String} secret
     * @returns {String} String OR undefined
     */
    unsign(signed_value, secret) {
        let unsigned_value = signature.unsign(signed_value, secret);
        if (unsigned_value !== false) return unsigned_value;
    }

    /**
     * Aborts pending body buffer downloads if request is prematurely aborted.
     */
    _abort_buffer() {
        if (this.#buffer_pending === true && typeof this.#buffer_resolve == 'function') {
            this.#body_buffer = EMPTY_BUFFER;
            this.#buffer_resolve(this.#body_buffer);
        }
    }

    /**
     * Asynchronously downloads and returns request body as a Buffer.
     *
     * @returns {Promise} Promise
     */
    buffer() {
        let reference = this;
        return new Promise((resolve, reject) => {
            // Check cache and return if body has already been parsed
            if (reference.#body_buffer) return resolve(reference.#body_buffer);

            // Resolve empty if invalid content-length header detected
            let content_length = +reference.#headers['content-length'];
            if (isNaN(content_length) || content_length < 1) {
                reference.#body_buffer = EMPTY_BUFFER;
                return resolve(reference.#body_buffer);
            }

            // Store incoming buffer chunks into buffers Array
            reference.#buffer_pending = true;
            reference.#buffer_resolve = resolve;
            let body_buffer;
            let body_cursor = 0;
            reference.#raw_response.onData((array_buffer, is_last) => {
                let chunk;
                if (is_last && body_cursor === 0) {
                    // Create a copy of ArrayBuffer from uWS as it will be deallocated and this is the only chunk
                    chunk = Buffer.concat([Buffer.from(array_buffer)]);
                } else {
                    // Allocate a Buffer for storing incoming body content
                    if (body_buffer == undefined) {
                        // Use appropriate allocation scheme based on user options
                        if (reference.#master_context.fast_buffers === true) {
                            body_buffer = Buffer.allocUnsafe(content_length);
                        } else {
                            body_buffer = Buffer.alloc(content_length);
                        }
                    }

                    // Convert ArrayBuffer to Buffer and copy to body buffer
                    chunk = Buffer.from(array_buffer);
                    chunk.copy(body_buffer, body_cursor, 0, chunk.byteLength);
                }

                // Iterate body cursor to keep track of incoming chunks
                body_cursor += array_buffer.byteLength;

                // Trigger final processing on last chunk
                if (is_last) {
                    // Cache buffer locally depending on situation
                    if (body_buffer) {
                        reference.#body_buffer = body_buffer;
                    } else if (chunk) {
                        reference.#body_buffer = chunk;
                    } else {
                        reference.#body_buffer = EMPTY_BUFFER;
                    }

                    // Mark instance as no longer buffer pending and resolve
                    reference.#buffer_pending = false;
                    if (!reference.#raw_response.aborted) return resolve(reference.#body_buffer);
                }
            });
        });
    }

    /**
     * Asynchronously parses and returns request body as a String.
     *
     * @returns {Promise} Promise
     */
    async text() {
        // Resolve from cache if available
        if (this.#body_text) return this.#body_text;

        // Parse body buffer into string and cache
        this.#body_text = (await this.buffer()).toString();

        return this.#body_text;
    }

    /**
     * Asynchronously parses request body as JSON.
     * Passing default_value as undefined will lead to the function throwing an exception
     * if JSON parsing fails.
     *
     * @param {Any} default_value Default: {}
     * @returns {Promise} Promise(String: body)
     */
    async json(default_value = {}) {
        // Return from cache if available
        if (this.#body_json) return this.#body_json;

        // Parse a text body
        let body = this.#body_text || (await this.text());

        // Unsafely parse JSON without catching exception if no default_value is specified
        if (default_value == undefined) return JSON.parse(body);

        // Return default value on empty body
        if (body == '') return default_value;

        // Safely parse JSON and return default value on exception
        try {
            body = JSON.parse(body);
        } catch (error) {
            return default_value;
        }

        // Cache and resolve JSON body
        this.#body_json = body;
        return body;
    }

    /* Request Getters */

    /**
     * Returns underlying uWS.Request reference.
     * Note! Utilizing any of uWS.Request's methods after initial synchronous call will throw a forbidden access error.
     */
    get raw() {
        return this.#raw_request;
    }

    /**
     * Returns HTTP request method for incoming request in all uppercase.
     */
    get method() {
        return this.#method;
    }

    /**
     * Returns full request url for incoming request (path + query).
     */
    get url() {
        return this.#url;
    }

    /**
     * Returns path for incoming request.
     */
    get path() {
        return this.#path;
    }

    /**
     * Returns query for incoming request without the '?'.
     */
    get query() {
        return this.#query;
    }

    /**
     * Returns request headers from incoming request.
     */
    get headers() {
        return this.#headers;
    }

    /**
     * Returns cookies from incoming request.
     */
    get cookies() {
        // Return from cache if already parsed once
        if (this.#cookies) return this.#cookies;

        // Parse cookies from Cookie header and cache results
        let cookie_header = this.#headers.cookie;
        if (typeof cookie_header == 'string') {
            this.#cookies = cookie.parse(cookie_header);
        } else {
            this.#cookies = {};
        }

        return this.#cookies;
    }

    /**
     * Returns Session object for incoming request given a SessionEngine has been bound to Server instance.
     */
    get session() {
        return this.#session;
    }

    /**
     * Returns path parameters from incoming request in Object form {key: value}
     */
    get path_parameters() {
        return this.#query_parameters;
    }

    /**
     * Returns query parameters from incoming request in Object form {key: value}
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
     */
    get ip() {
        // Convert Remote IP to string on first access
        if (typeof this.#remote_ip !== 'string')
            this.#remote_ip = operators.arr_buff_to_str(this.#remote_ip);

        return this.#remote_ip;
    }

    /**
     * Returns remote proxy IP address in string format from incoming request.
     */
    get proxy_ip() {
        // Convert Remote Proxy IP to string on first access
        if (typeof this.#remote_proxy_ip !== 'string')
            this.#remote_proxy_ip = operators.arr_buff_to_str(this.#remote_proxy_ip);

        return this.#remote_proxy_ip;
    }
}

module.exports = Request;
