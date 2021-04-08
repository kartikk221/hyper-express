const HTTP_STATUS_CODES = require('../http_status_codes.json');
const MIME_TYPES = require('../mime_types.json');
const OPERATORS = require('../operators.js');

module.exports = class Response {
    #sess_config;
    #request;
    #uws_response;
    completed = false;
    #error_handler;
    #socket = null;

    constructor(request, uws_response, sess_config, error_handler, socket_context) {
        // Establish core variables for response
        let reference = this;
        this.#sess_config = sess_config;
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
        this.#uws_response.writeHeader(key, value);
        return this;
    }

    status(code) {
        if (this.completed === false) this.#uws_response.writeStatus(code + ' ' + (HTTP_STATUS_CODES[code] || 'UNKNOWN'));
        return this;
    }

    type(type) {
        if (this.completed === false) this.header('content-type', MIME_TYPES[type.toLowerCase()] || 'text/plain');
        return this;
    }

    set_cookie(name, value, expiry = '0 milliseconds strict', options = null) {
        if (options == null)
            options = {
                secure: true,
                sameSite: true,
                path: '/',
            };

        let header = `${name}=${value}`;
        let expiry_msecs = OPERATORS.translate_duration_to_ms(expiry);
        if (options.domain) header += `; Domain=${options.domain}`;
        if (options.path) header += `; Path=${options.path}`;
        header += `; Expires=${new Date(expiry_msecs).toUTCString()}`;
        if (options.maxAge || expiry_msecs == 0) header += `; Max-Age=${expiry_msecs == 0 ? 0 : options.maxAge}`;
        if (typeof options.sameSite == 'string') {
            header += `; SameSite=${options.sameSite}`;
        } else if (options.sameSite === true) {
            header += `; SameSite=Strict`;
        } else {
            header += `; SameSite=None`;
        }
        if (options.httpOnly === true) header += `; HttpOnly`;
        if (options.secure === true) header += `; Secure`;
        this.header('set-cookie', header);
        return this;
    }

    delete_cookie(name) {
        return this.set_cookie(name, '');
    }

    upgrade(user_data = {}) {
        if (this.completed === false) {
            this.completed = true;

            // Ensure a socket exists before upgrading
            if (this.#socket == null) {
                return this.error_handler(
                    this.#request,
                    this,
                    'You cannot upgrade a request that does not come from an upgrade handler. No socket was found.'
                );
            }

            let sec_websocket_key = this.#request.headers['sec-websocket-key'] || '';
            let sec_websocket_protocol = this.#request.headers['sec-websocket-protocol'] || '';
            let sec_websocket_extensions = this.#request.headers['sec-websocket-extensions'] || '';
            user_data.url = this.#request.path;
            return this.#uws_response.upgrade(user_data, sec_websocket_key, sec_websocket_protocol, sec_websocket_extensions, this.#socket);
        }
    }

    send(body = '') {
        if (this.completed === false) {
            this.completed = true;

            // Pre-handle session cookie and persist/touch operations
            if (this.#request.session && this.#request.session.id.length > 0) {
                // Set proper cookie header according to session status
                if (this.#request.session.destroyed === true) {
                    this.delete_cookie(this.#sess_config.cookie.name);
                } else {
                    this.set_cookie(
                        this.#sess_config.cookie.name,
                        this.#request.session.id,
                        this.#request.session.expiry + ' milliseconds strict',
                        this.#sess_config.cookie
                    );
                }

                // Persist or Touch session
                let ref = this;
                if (this.#request.session.persist === true) {
                    this.#sess_config
                        .session_write(this.#request.session, Date.now() + this.#sess_config.session_expiry_msecs)
                        .catch((error) => ref.error_handler(ref.req, ref, error));
                } else if (this.#sess_config.require_manual_touch !== true) {
                    this.#request.session.touch(true).catch((error) => ref.error_handler(ref.req, ref, error));
                }
            }

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
