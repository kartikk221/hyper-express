const UID = require('uid-safe');

module.exports = class SessionEngine {
    duration_msecs = 1000 * 60 * 30; // Default 30 minute expiry
    require_manual_touch = false;
    example_id = '';
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

    constructor(c) {
        let reference = this;
        if (c.cookie && typeof c.cookie == 'object') this._fill_object(this.#cookie_options, c.cookie);
        if (c.duration_msecs) this.duration_msecs = c.duration_msecs;
        if (c.cookie.secret == null) throw new Error('HyperExpress: A random cookie secret must be specified for session signatures.');
        this.require_manual_touch = c.require_manual_touch === true;
        this.#methods.id().then((id) => (reference.example_id = id));
    }

    handle(type, handler) {
        if (typeof handler !== 'function') throw new Error('HyperExpress: handler must be a function');
        if (this.#methods[type] == undefined) throw new Error('HyperExpress: ' + event + ' not a supported event.');
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
        return this.#methods.cleanup();
    }

    _not_setup_method(action) {
        throw new Error('HyperExpress: SessionEngine ' + action + ' not handled. Use .handle(event, handler) to handle this method.');
    }

    _fill_object(original, target) {
        let reference = this;
        Object.keys(target).forEach((key) => {
            if (typeof target[key] == 'object') {
                if (original[key] == undefined) original[key] = {};
                reference._fill_object(target[key], original[key]);
            } else {
                original[key] = target[key];
            }
        });
    }
};
