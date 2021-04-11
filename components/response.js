const HTTP_STATUS_CODES = require('../http_status_codes.json');
const MIME_TYPES = require('../mime_types.json');
const OPERATORS = require('../operators.js');
const COOKIE = require('cookie');
const SIGNATURE = require('cookie-signature');

module.exports = class Response {
    #session_engine;
    #request;
    #uws_response;
    completed = false;
    #error_handler;
    #socket = null;
    #status_change_available = true;

    constructor(request, uws_response, session_engine, error_handler, socket_context) {
        // Establish core variables for response
        let reference = this;
        this.#session_engine = session_engine;
        this.#request = request;
        this.#uws_response = uws_response;
        this.#error_handler = error_handler;
        if (socket_context) this.#socket = socket_context;

        // Bind abort handler to allow for async operations
        uws_response.onAborted(() => (reference.completed = true));
    }

    atomic(handler) {
        if (typeof handler !== 'function') throw new Error('HyperExpress: atomic operation only takes a function as a handler');
        return this.#uws_response.cork(handler);
    }

    header(key, value) {
        if (this.completed === false) this.#uws_response.writeHeader(key, value);
        this.#status_change_available = false;
        return this;
    }

    status(code) {
        if (this.#status_change_available === false)
            throw new Error(
                'HyperExpress: .status() and .redirect() method must be called before calling any headers/cookies/send methods.'
            );
        if (this.completed === false) this.#uws_response.writeStatus(code + ' ' + (HTTP_STATUS_CODES[code] || 'UNKNOWN'));
        return this;
    }

    type(type) {
        if (this.completed === false) this.header('content-type', MIME_TYPES[type.toLowerCase()] || 'text/plain');
        this.#status_change_available = false;
        return this;
    }

    cookie(
        name,
        value,
        expiry,
        options = {
            secure: true,
            sameSite: 'none',
            path: '/',
        }
    ) {
        // Convert expiry to valid expires Date object
        if (typeof expiry == 'number') {
            options.expires = new Date(Date.now() + expiry);
        } else {
            delete options.expires;
        }

        // Sign cookie if a secret is provided
        if (typeof options.secret == 'string') {
            value = SIGNATURE.sign(value, options.secret);
            options.encode = false;
        }

        let header = COOKIE.serialize(name, value, options);
        this.header('set-cookie', header);
        this.#status_change_available = false;
        return this;
    }

    delete_cookie(name) {
        return this.cookie(name, '', null, {
            maxAge: 0,
        });
    }

    upgrade(user_data = {}) {
        if (this.completed === false) {
            // Ensure a socket exists before upgrading
            if (this.#socket == null) {
                return this.error_handler(
                    this.#request,
                    this,
                    'You cannot upgrade a request that does not come from an upgrade handler. No socket was found.'
                );
            }

            this.completed = true;
            let ws_headers = this.#request.ws_headers();
            let sec_websocket_key = ws_headers.sec_websocket_key;
            let sec_websocket_protocol = ws_headers.sec_websocket_protocol;
            let sec_websocket_extensions = ws_headers.sec_websocket_extensions;
            return this.#uws_response.upgrade(user_data, sec_websocket_key, sec_websocket_protocol, sec_websocket_extensions, this.#socket);
        }
    }

    write(body) {
        this.#uws_response.write(body);
        return this;
    }

    send(body = '') {
        if (this.completed === false) {
            // Trigger session closure if session engine is present
            if (this.#request.session !== null && this.#request.session.ready()) this.#request.session.perform_sess_closure(this);
            this.completed = true;
            return this.#uws_response.end(body);
        }
    }

    redirect(url) {
        if (this.completed === false) this.status(302).header('location', url).send();
    }

    json(payload = {}) {
        this.type('json').send(JSON.stringify(payload));
    }

    html(html) {
        this.type('html').send(html);
    }

    throw_error(error) {
        this.#error_handler(this.#request, this, error);
    }
};
