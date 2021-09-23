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
    #session;
    #method;
    #url;
    #path;
    #query;
    #buffer_promise;
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
            let reference = this;
            parameters_key.forEach((keySet) => {
                reference.#path_parameters[keySet[0]] = reference.#raw_request.getParameter(
                    keySet[1]
                );
            });
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
     * @returns {String} String OR undefined
     */
    unsign(signed_value, secret) {
        let unsigned_value = signature.unsign(signed_value, secret);
        if (unsigned_value !== false) return unsigned_value;
    }

    /**
     * Initiates body buffer download process.
     *
     * @param {Number} content_length
     * @returns {Promise}
     */
    _download_buffer(content_length) {
        // Return pending buffer promise if in flight
        if (this.#buffer_promise) return this.#buffer_promise;

        // Initiate a buffer promise with chunk retrieval process
        let reference = this;
        this.#buffer_promise = new Promise((resolve, reject) => {
            // Store promise resolve method to allow closure from _abort_buffer() method
            reference.#buffer_resolve = resolve;

            // Store body into a singular Buffer for most memory efficiency
            let body_buffer;
            let body_cursor = 0;
            let use_fast_buffers = reference.#master_context.fast_buffers;

            // Store incoming buffer chunks into buffers Array
            reference.#raw_response.onData((array_buffer, is_last) => {
                // Do not process chunks if request has been aborted
                if (reference.#raw_response.aborted) return;

                // Process current array_buffer chunk into a Buffer
                let chunk;
                if (is_last && body_cursor === 0) {
                    // Create a copy of ArrayBuffer from uWS as it will be deallocated and this is the only received chunk
                    chunk = Buffer.concat([Buffer.from(array_buffer)]);
                } else {
                    // Allocate a fresh Buffer for storing incoming body chunks
                    if (body_buffer == undefined) {
                        // Use appropriate allocation scheme based on user options
                        if (use_fast_buffers) {
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
                    // Cache buffer locally depending on received format type
                    if (body_buffer) {
                        reference.#body_buffer = body_buffer;
                    } else if (chunk) {
                        reference.#body_buffer = chunk;
                    } else {
                        reference.#body_buffer = EMPTY_BUFFER;
                    }

                    // Abort request with a (400 Bad Request) if downloaded buffer length does not match expected content-length header
                    if (reference.#body_buffer.length !== content_length) {
                        reference.#body_buffer = EMPTY_BUFFER;
                        reference.#raw_response.status(400).send();
                    }

                    // Mark instance as no longer buffer pending and resolve if request has not been reslolved yet
                    reference.#buffer_promise = undefined;
                    if (!reference.#raw_response.aborted) return resolve(reference.#body_buffer);
                }
            });
        });

        return this.#buffer_promise;
    }

    /**
     * Aborts pending body buffer downloads if request is prematurely aborted.
     */
    _abort_buffer() {
        // Overwrite allocated buffer with empty buffer and pending buffer promise
        if (this.#buffer_promise !== undefined && typeof this.#buffer_resolve == 'function') {
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
        // Check cache and return if body has already been parsed
        if (this.#body_buffer) return Promise.resolve(this.#body_buffer);

        // Resolve empty if invalid content-length header detected
        let content_length = +this.#headers['content-length'];
        if (isNaN(content_length) || content_length < 1) {
            this.#body_buffer = EMPTY_BUFFER;
            return Promise.resolve(this.#body_buffer);
        }

        return this._download_buffer(content_length);
    }

    /**
     * Asynchronously parses and returns request body as a String.
     *
     * @returns {Promise} Promise
     */
    text() {
        // Resolve from cache if available
        if (this.#body_text) return Promise.resolve(this.#body_text);

        // Convert and resolve from memory if buffer is available
        if (this.#body_buffer) {
            this.#body_text = this.#body_buffer.toString();
            return Promise.resolve(this.#body_text);
        }

        // Parse Buffer from incoming request body and cache/resolve string type
        let reference = this;
        return new Promise((resolve, reject) =>
            reference
                .buffer()
                .then((buffer) => {
                    reference.#body_text = buffer.toString();
                    resolve(reference.#body_text);
                })
                .catch(reject)
        );
    }

    /**
     * Parses JSON from provided string. Resolves default_value or throws exception on failure.
     *
     * @param {String} string
     * @param {Any} default_value
     * @returns {Any}
     */
    _parse_json(string, default_value) {
        // Unsafely parse JSON as we do not have a default_value
        if (default_value == undefined) return JSON.parse(string);

        // Resolve default_value if string is empty and thus invalid
        if (string == '') return default_value;

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
     * Asynchronously parses request body as JSON.
     * Passing default_value as undefined will lead to the function throwing an exception
     * if JSON parsing fails.
     *
     * @param {Any} default_value Default: {}
     * @returns {Promise} Promise(String: body)
     */
    json(default_value = {}) {
        // Return from cache if available
        if (this.#body_json) return Promise.resolve(this.#body_json);

        // Parse and resolve fast if text body is available locally
        if (this.#body_text) {
            this.#body_json = this._parse_json(this.#body_text, default_value);
            return this.#body_json;
        }

        // Parse Text from incoming request body and cache/resolve Object type
        let reference = this;
        return new Promise((resolve, reject) =>
            reference
                .text()
                .then((text) => {
                    reference.#body_json = reference._parse_json(text, default_value);
                    resolve(reference.#body_json);
                })
                .catch((error) => {
                    if (default_value == undefined) return reject(error);
                    resolve(default_value);
                })
        );
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
        return this.#path_parameters;
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
