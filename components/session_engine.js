const UID = require('uid-safe');
const OPERATORS = require('../operators.js');

module.exports = class SessionEngine {
    duration_msecs = 1000 * 60 * 30; // Default 30 minute expiry
    require_manual_touch = false;
    #cookie_options = {
        name: 'he_sess',
        domain: '',
        path: '/',
        httpOnly: true,
        secure: true,
        sameSite: 'none',
        secret: null,
    };
    #methods = {
        id: () => UID(24), // 32 length secure id
        touch: () => this._not_setup_method('Session Touch'),
        read: () => this._not_setup_method('Session Read'),
        write: () => this._not_setup_method('Session Write'),
        destroy: () => this._not_setup_method('Session Destroy'),
        cleanup: () => this._not_setup_method('Session Cleanup'),
    };

    constructor({
        cookie = this.#cookie_options,
        duration_msecs = this.duration_msecs,
        require_manual_touch = this.require_manual_touch,
    }) {
        if (cookie && typeof cookie == 'object')
            OPERATORS.fill_object(this.#cookie_options, cookie);
        if (duration_msecs) this.duration_msecs = duration_msecs;
        if (cookie.secret == null)
            throw new Error(
                'HyperExpress: A random cookie secret must be specified for session signatures.'
            );
        this.require_manual_touch = require_manual_touch === true;
    }

    handle(type, handler) {
        if (typeof handler !== 'function')
            throw new Error('HyperExpress: handler must be a function');
        if (this.#methods[type] == undefined)
            throw new Error('HyperExpress: ' + type + ' not a supported event.');
        this.#methods[type] = handler;
        return this;
    }

    expose_methods() {
        return this.#methods;
    }

    get_cookie_options() {
        return this.#cookie_options;
    }

    perform_cleanup() {
        return this.#methods.cleanup(this.duration_msecs);
    }

    _not_setup_method(action) {
        throw new Error(
            "HyperExpress: SessionEngine '" +
                action +
                "' not handled. Use .handle('" +
                action +
                "', handler) to handle this method."
        );
    }
};
