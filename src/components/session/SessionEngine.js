const uid_safe = require('uid-safe');
const operators = require('../../shared/operators.js');

class SessionEngine {
    #default_duration = 1000 * 60 * 30;
    #manual_touch = false;
    #cookie_options = {
        name: 'default_sess',
        path: '/',
        httpOnly: true,
        secure: true,
        sameSite: 'none',
        secret: null,
    };

    constructor({
        signature_secret,
        cookie_options,
        default_duration,
        require_manual_touch,
    }) {
        // Ensure a valid and strong signature secret is provided for best practice
        if (
            typeof signature_secret !== 'string' ||
            signature_secret.length < 10
        ) {
            throw new Error(
                'HyperExpress: signature_secret must be a string that is atleast 10 characters in length.'
            );
        } else {
            this.#cookie_options.secret = signature_secret;
        }

        // Fill cookie_options default with provided cookie options
        if (typeof cookie_options == 'object')
            operators.fill_object(this.#cookie_options, cookie_options);

        // Ensure a valid number is provided for the default_duration
        if (typeof default_duration == 'number')
            this.#default_duration = default_duration;

        // Ensure a valid boolean value is provided for manual_touch requirement
        if (typeof require_manual_touch == 'boolean')
            this.#manual_touch = require_manual_touch;
    }

    #methods = {
        id: () => uid_safe(24), // 32 length secure id
        touch: () => this._not_setup_method('touch'),
        read: () => this._not_setup_method('read'),
        write: () => this._not_setup_method('write'),
        destroy: () => this._not_setup_method('destroy'),
        cleanup: () => this._not_setup_method('cleanup'),
    };

    /**
     * INTERNAL METHOD! This method is an internal method and should NOT be called manually.
     * This method throws a session engine unhandled operation error.
     * @param {String} action
     */
    _not_setup_method(action) {
        throw new Error(
            `HyperExpress: SessionEngine '${action}' is not being handled. Please use instance.handle('${action}', some_handler) to handle this session engine operation.`
        );
    }

    /**
     * This method is used to handle specific operations for a session engine.
     *
     * @param {String} type [id, touch, read, write, destroy, cleanup]
     * @param {Function} handler
     * @returns
     */
    handle(type, handler) {
        if (typeof handler !== 'function')
            throw new Error('HyperExpress: handler must be a function');

        if (this.#methods[type] == undefined)
            throw new Error(
                `HyperExpress: ${type} is not a valid session engine event.`
            );

        this.#methods[type] = handler;
        return this;
    }

    /**
     * This method calls triggers the 'cleanup' session engine operation.
     */
    cleanup() {
        return this.#methods.cleanup(this.#default_duration);
    }

    /* Private SessionEngine Getters */
    get _cookie_options() {
        return this.#cookie_options;
    }

    get _methods() {
        return this.#methods;
    }

    get _default_duration() {
        return this.#default_duration;
    }

    get _manual_touch() {
        return this.#manual_touch;
    }
}

module.exports = SessionEngine;
