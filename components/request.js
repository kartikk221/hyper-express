const Session = require('./session.js');
const cookie = require('cookie');
const querystring = require('query-string');
const signature = require('cookie-signature');

module.exports = class Request {
    uws_request;
    uws_response;
    method;
    path;
    query;
    url;
    session = {};
    headers = {};
    url_parameters = {};
    #body = null;

    constructor(uws_request, uws_response, url_parameters_key, session_engine) {
        // Parse common data
        let reference = this;
        this.uws_request = uws_request;
        this.uws_response = uws_response;
        this.method = uws_request.getMethod().toUpperCase();
        this.path = uws_request.getUrl();
        this.query = uws_request.getQuery();
        this.url = this.path + (this.query ? '?' + this.query : '');

        // Pre-Parse headers
        uws_request.forEach((key, value) => (reference.headers[key] = value));

        // Pre-Parse url parameters
        if (url_parameters_key !== null)
            url_parameters_key.forEach((key) => (reference.url_parameters[key[0]] = uws_request.getParameter(key[1])));

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
        if (this._query_parameters) return this._query_parameters;
        this._query_parameters = querystring.parse(this.query || '');
        return this._query_parameters;
    }

    get_query_parameter(key) {
        return this.query_parameters()[key];
    }

    cookies(decode = true) {
        if (this._cookies) return this._cookies;
        this._cookies = cookie.parse(this.headers.cookie || '', {
            decode: decode,
        });
        return this._cookies;
    }

    get_cookie(key, decode = true) {
        return this.cookies(decode)[key];
    }

    unsign_cookie(name, secret) {
        let value = this.get_cookie(name);
        console.log('UNSIGN - GOT VALUE', value);
        if (value) {
            let unsinged = signature.unsign(value, secret);
            console.log('UNSIGNED - GOT RESULT', unsinged);
            if (unsinged !== false) return unsinged;
        }
    }

    text() {
        let reference = this;
        return new Promise((resolve, reject) => {
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
