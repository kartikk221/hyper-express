const cookie = require('cookie');
const signature = require('cookie-signature');
const querystring = require('query-string');
const { array_buffer_to_string } = require('../../shared/operators.js');

// ExpressJS compatibility packages
const accepts = require('accepts');
const parse_range = require('range-parser');
const type_is = require('type-is');
const is_ip = require('net').isIP;

class Request {
    #master_context;
    #raw_request = null;
    #raw_response = null;
    #method;
    #url;
    #path;
    #query;
    #buffer_promise;
    #buffer_resolve;
    #body_buffer;
    #body_text;
    #body_json;
    #body_urlencoded;
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

        // Execute request operators for pre-parsing common access data
        this._request_information();
        this._path_parameters(path_parameters_key);
    }

    /**
     * @private
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
        this.#raw_request.forEach((key, value) => (this.#headers[key] = value));
    }

    /**
     * This method parses path parameters from incoming request using a parameter key
     * @private
     * @param {Array} parameters_key [[key, index], ...]
     */
    _path_parameters(parameters_key) {
        if (parameters_key.length > 0) {
            parameters_key.forEach(
                (keySet) => (this.#path_parameters[keySet[0]] = this.#raw_request.getParameter(keySet[1]))
            );
        }
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
     * @private
     * @param {Number} content_length
     * @returns {Promise}
     */
    _download_buffer(content_length) {
        // Return pending buffer promise if in flight
        if (this.#buffer_promise) return this.#buffer_promise;

        // Initiate a buffer promise with chunk retrieval process
        let reference = this;
        this.#buffer_promise = new Promise((resolve) => {
            // Store promise resolve method to allow closure from _abort_buffer() method
            reference.#buffer_resolve = resolve;

            // Store body into a singular Buffer for most memory efficiency
            let body_buffer;
            let body_cursor = 0;
            let use_fast_buffers = reference.#master_context.options.fast_buffers;

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

                // Perform final processing on last body chunk
                if (is_last) {
                    // Cache buffer locally depending on received format type
                    if (body_buffer) {
                        // Cache compiled buffer of multiple chunks
                        reference.#body_buffer = body_buffer;
                    } else if (chunk) {
                        // Cache singular buffer when only one chunk is received
                        reference.#body_buffer = chunk;
                    } else {
                        // Cache an empty buffer as a fallback to signify no body content received
                        reference.#body_buffer = Buffer.from('');
                    }

                    // Abort request with a (400 Bad Request) if downloaded buffer length does not match expected content-length header
                    if (reference.#body_buffer.length !== content_length) {
                        reference.#body_buffer = Buffer.from('');
                        reference.#raw_response
                            .status(400)
                            .send('Received body length did not match content length header.');
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
     * @private
     * Aborts pending body buffer downloads if request is prematurely aborted.
     */
    _abort_buffer() {
        // Overwrite allocated buffer with empty buffer and pending buffer promise
        if (this.#buffer_promise !== undefined && typeof this.#buffer_resolve == 'function') {
            this.#body_buffer = Buffer.from('');
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
        const content_length = +this.#headers['content-length'];
        if (isNaN(content_length) || content_length < 1) {
            this.#body_buffer = Buffer.from('');
            return Promise.resolve(this.#body_buffer);
        }

        // Initiate buffer download
        return this._download_buffer(content_length);
    }

    /**
     * Asynchronously parses and returns request body as a String.
     *
     * @returns {Promise} Promise
     */
    async text() {
        // Resolve from cache if available
        if (this.#body_text) return this.#body_text;

        // Retrieve body buffer, convert to string, cache and resolve
        this.#body_text = (this.#body_buffer || (await this.buffer())).toString();
        return this.#body_text;
    }

    /**
     * @private
     * Parses JSON from provided string. Resolves default_value or throws exception on failure.
     *
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
     * Parses and resolves an Object of json values from body.
     * Passing default_value as undefined will lead to the function throwing an exception
     * if JSON parsing fails.
     *
     * @param {Any} default_value Default: {}
     * @returns {Promise} Promise
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
     *
     * @returns {Promise} Promise(Object: body)
     */
    async urlencoded() {
        // Return from cache if available
        if (this.#body_urlencoded) return this.#body_urlencoded;

        // Retrive text body, parse as a query string, cache and resolve
        this.#body_urlencoded = querystring.parse(this.#body_text || (await this.text()));
        return this.#body_urlencoded;
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
     * @returns {String}
     */
    get method() {
        return this.#method;
    }

    /**
     * Returns full request url for incoming request (path + query).
     * @returns {String}
     */
    get url() {
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
     * Returns request headers from incoming request.
     * @returns {Record<string, unknown>}
     */
    get headers() {
        return this.#headers;
    }

    /**
     * Returns cookies from incoming request.
     * @returns {Record<string, unknown>}
     */
    get cookies() {
        // Return from cache if already parsed once
        if (this.#cookies) return this.#cookies;

        // Parse cookies from Cookie header and cache results
        let header = this.#headers['cookie'];
        this.#cookies = header ? cookie.parse(header) : {};
        return this.#cookies;
    }

    /**
     * Returns path parameters from incoming request in Object form {key: value}
     * @returns {Record<string, unknown>}
     */
    get path_parameters() {
        return this.#path_parameters;
    }

    /**
     * Returns query parameters from incoming request in Object form {key: value}
     * @returns {Record<string, unknown>}
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
     * @returns {String}
     */
    get ip() {
        // Convert Remote IP to string on first access
        if (typeof this.#remote_ip !== 'string') this.#remote_ip = array_buffer_to_string(this.#remote_ip);

        return this.#remote_ip;
    }

    /**
     * Returns remote proxy IP address in string format from incoming request.
     * @returns {String}
     */
    get proxy_ip() {
        // Convert Remote Proxy IP to string on first access
        if (typeof this.#remote_proxy_ip !== 'string')
            this.#remote_proxy_ip = array_buffer_to_string(this.#remote_proxy_ip);

        return this.#remote_proxy_ip;
    }

    /* ExpressJS compatibility properties & methods */

    /**
     * ExpressJS: Returns header for specified name.
     * @param {String} name
     * @returns {String|undefined}
     */
    get(name) {
        let lowercase = name.toLowerCase();
        switch (lowercase) {
            case 'referer':
            case 'referrer':
                return this.headers['referer'] || this.headers['referrer'];
            default:
                return this.headers[lowercase];
        }
    }

    /**
     * ExpressJS: Alias of .get(name) method.
     * @param {String} name
     * @returns {String|undefined}
     */
    header(name) {
        return this.get(name);
    }

    /**
     * ExpressJS: Checks if provided types are accepted.
     * @param {String|Array} types
     * @returns {String|Array|Boolean}
     */
    accepts() {
        let instance = accepts(this);
        return instance.types.apply(instance, arguments);
    }

    /**
     * ExpressJS: Checks if provided encodings are accepted.
     * @param {String|Array} encodings
     * @returns {String|Array}
     */
    acceptsEncodings() {
        let instance = accepts(this);
        return instance.encodings.apply(instance, arguments);
    }

    /**
     * ExpressJS: Checks if provided charsets are accepted
     * @param {String|Array} charsets
     * @returns {String|Array}
     */
    acceptsCharsets() {
        let instance = accepts(this);
        return instance.charsets.apply(instance, arguments);
    }

    /**
     * ExpressJS: Checks if provided languages are accepted
     * @param {String|Array} languages
     * @returns {String|Array}
     */
    acceptsLanguages() {
        let instance = accepts(this);
        return instance.languages.apply(instance, arguments);
    }

    /**
     * ExpressJS: Parse Range header field, capping to the given `size`.
     * @param {Number} size
     * @param {Object} options
     * @param {Boolean} options.combine Default: false
     * @returns {Number|Array}
     */
    range(size, options) {
        let range = this.get('Range');
        if (!range) return;
        return parse_range(size, range, options);
    }

    /**
     * ExpressJS: Return the value of param `name` when present or `defaultValue`.
     * @param {String} name
     * @param {Any} default_value
     * @returns {String}
     */
    param(name, default_value) {
        // Parse three dataset candidates
        let body = this.body;
        let path_parameters = this.path_parameters;
        let query_parameters = this.query_parameters;

        // First check path parameters, body, and finally query_parameters
        if (null != path_parameters[name] && path_parameters.hasOwnProperty(name)) return path_parameters[name];
        if (null != body[name]) return body[name];
        if (null != query_parameters[name]) return query_parameters[name];

        return default_value;
    }

    /**
     * ExpressJS: Check if the incoming request contains the "Content-Type" header field, and it contains the give mime `type`.
     * @param {String|Array} types
     * @returns {String|false|null}
     */
    is(types) {
        // support flattened arguments
        let arr = types;
        if (!Array.isArray(types)) {
            arr = new Array(arguments.length);
            for (let i = 0; i < arr.length; i++) arr[i] = arguments[i];
        }
        return type_is(this, arr);
    }

    /**
     * Throws a descriptive error when an unsupported ExpressJS property/method is invocated.
     * @private
     * @param {String} name
     */
    _throw_unsupported(name) {
        throw new Error(
            `One of your middlewares or logic tried to call Request.${name} which is unsupported with HyperExpress.`
        );
    }

    /**
     * Unsupported property
     */
    get app() {
        this._throw_unsupported('app()');
    }

    /**
     * Returns expected body from route options
     */
    get body() {
        // Ensure body has been initialized from internal handler through expect_body route option
        if (this._body == undefined)
            throw new Error(
                'Request.body property has not been initialized yet. Please specify expect_body parameter in options when creating a route to populate the Request.body property.'
            );

        return this._body;
    }

    /**
     * ExpressJS: Alias of HyperExpress.Request.path
     */
    get baseUrl() {
        return this.#path;
    }

    /**
     * ExpressJS: Alias of HyperExpress.Request.url
     */
    get originalUrl() {
        return this.url;
    }

    /**
     * ExpressJS: Alias of HyperExpress.Request.path_parameters
     */
    get params() {
        return this.path_parameters;
    }

    /**
     * ExpressJS: Returns query parameters
     */
    get query() {
        return this.query_parameters;
    }

    /**
     * Unsupported property
     */
    get route() {
        this._throw_unsupported('route');
    }

    /**
     * ExpressJS: Returns the current protocol
     * @returns {('https'|'http')}
     */
    get protocol() {
        // Resolves x-forwarded-proto header if trust proxy is enabled
        let trust_proxy = this.#master_context.options.trust_proxy;
        let x_forwarded_proto = this.get('X-Forwarded-Proto');
        if (trust_proxy && x_forwarded_proto)
            return x_forwarded_proto.indexOf(',') > -1 ? x_forwarded_proto.split(',')[0] : x_forwarded_proto;

        // Use HyperExpress/uWS initially defined protocol
        return this.#master_context.is_ssl ? 'https' : 'http';
    }

    /**
     * ExpressJS: Returns true when request is on https protocol
     * @returns {Boolean}
     */
    get secure() {
        return this.protocol === 'https';
    }

    /**
     * ExpressJS: When "trust proxy" is set, trusted proxy addresses + client.
     * @returns {Array}
     */
    get ips() {
        let client_ip = this.ip;
        let proxy_ip = this.proxy_ip;
        let trust_proxy = this.#master_context.trust_proxy;
        let x_forwarded_for = this.get('X-Forwarded-For');
        if (trust_proxy && x_forwarded_for) return x_forwarded_for.split(',');
        return [client_ip, proxy_ip];
    }

    /**
     * ExpressJS: Parse the "Host" header field to a hostname.
     */
    get hostname() {
        let trust_proxy = this.#master_context.trust_proxy;
        let host = this.get('X-Forwarded-Host');

        if (!host || !trust_proxy) {
            host = this.get('Host');
        } else if (host.indexOf(',') > -1) {
            // Note: X-Forwarded-Host is normally only ever a
            //       single value, but this is to be safe.
            host = host.substring(0, host.indexOf(',')).trimRight();
        }

        if (!host) return;

        // IPv6 literal support
        let offset = host[0] === '[' ? host.indexOf(']') + 1 : 0;
        let index = host.indexOf(':', offset);
        return index !== -1 ? host.substring(0, index) : host;
    }

    /**
     * ExpressJS: Return subdomains as an array.
     * @returns {Array}
     */
    get subdomains() {
        let hostname = this.hostname;
        if (!hostname) return [];

        let offset = 2;
        let subdomains = !is_ip(hostname) ? hostname.split('.').reverse() : [hostname];
        return subdomains.slice(offset);
    }

    /**
     * Unsupported Property
     */
    get fresh() {
        this._throw_unsupported('fresh');
    }

    /**
     * Unsupported Property
     */
    get stale() {
        this._throw_unsupported('stale');
    }

    /**
     * ExpressJS: Check if the request was an _XMLHttpRequest_.
     * @returns {Boolean}
     */
    get xhr() {
        return (this.get('X-Requested-With') || '').toLowerCase() === 'xmlhttprequest';
    }
}

module.exports = Request;
