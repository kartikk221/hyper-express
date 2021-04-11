const cookie = require('cookie');
const querystring = require('query-string');
const Session = require('./session.js');
const signature = require('cookie-signature');
const OPERATORS = require('../operators.js');

module.exports = class Request {
    uws_request;
    uws_response;
    method;
    url;
    path;
    query;
    session = null;
    headers = {};
    path_parameters = {};
    #cookies = null;
    #body = null;
    #query_parameters = null;

    constructor(uws_request, uws_response, url_parameters_key, session_engine) {
        // Parse common data
        let reference = this;
        this.uws_request = uws_request;
        this.uws_response = uws_response;
        this.method = uws_request.getMethod().toUpperCase();
        this.path = uws_request.getUrl();
        this.query = uws_request.getQuery();
        this.url = this.path + (this.query ? '?' + this.query : '');
        // this.remote_ip = OPERATORS.arr_buff_to_str(uws_response.getRemoteAddressAsText());
        // this.remote_proxy_ip = OPERATORS.arr_buff_to_str(uws_response.getProxiedRemoteAddressAsText());

        // Pre-Parse headers
        uws_request.forEach((key, value) => (reference.headers[key] = value));

        // Pre-Parse url parameters
        if (url_parameters_key !== null)
            url_parameters_key.forEach((key) => (reference.path_parameters[key[0]] = uws_request.getParameter(key[1])));

        // Bind session if established
        if (session_engine) this.session = new Session(this, session_engine);
    }

    ws_headers() {
        return {
            sec_websocket_key: this.headers['sec-websocket-key'] || '',
            sec_websocket_protocol: this.headers['sec-websocket-protocol'] || '',
            sec_websocket_extensions: this.headers['sec-websocket-extensions'] || '',
        };
    }

    query_parameters() {
        if (this.#query_parameters !== null) return this.#query_parameters;
        this.#query_parameters = querystring.parse(this.query || '');
        return this.#query_parameters;
    }

    get_query_parameter(key) {
        return this.query_parameters()[key];
    }

    cookies(decode = false) {
        if (this.#cookies !== null) return this.#cookies;
        this.#cookies = cookie.parse(this.headers.cookie || '', {
            decode: decode,
        });
        return this.#cookies;
    }

    get_cookie(key, decode = false) {
        return this.cookies(decode)[key];
    }

    unsign_cookie(name, secret) {
        // Retrieve cookie value
        let value = this.get_cookie(name, false);
        if (value) {
            // Attempt to unsing cookie - do not return anything on unsign fail
            let unsinged = signature.unsign(value, secret);
            if (unsinged !== false) return unsinged;
        }
    }

    text() {
        let reference = this;
        return new Promise((resolve, reject) => {
            // Return empty for non content-length header requests
            if (!this.headers['content-length']) return resolve('');

            // Check cache first
            if (reference.#body !== null) return resolve(reference.#body);

            // Define empty buffer and store chunks
            let buffer;
            reference.uws_response.onData((chunk, is_last) => {
                chunk = Buffer.from(chunk);
                if (is_last) {
                    let body;
                    if (buffer) {
                        body = Buffer.concat([buffer, chunk]);
                        body = body.toString();
                    } else if (chunk) {
                        body = chunk.toString();
                    } else {
                        body = '';
                    }

                    // Cache & return body
                    reference.#body = body;
                    return resolve(body);
                } else if (buffer) {
                    buffer = Buffer.concat([buffer, chunk]);
                } else {
                    buffer = Buffer.concat([chunk]);
                }
            });
        });
    }

    async json(default_value = {}) {
        let body = this.#body || (await this.text());

        // Will throw purposely on invalid json
        if (default_value == null) return JSON.parse(body);

        // Return default value for empty body
        if (body == '') return default_value;

        // Return default value on invalid json
        try {
            body = JSON.parse(body);
        } catch (error) {
            return default_value;
        }

        return body;
    }
};
