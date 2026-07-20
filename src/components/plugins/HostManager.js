'use strict';
const EventEmitter = require('events');

const STRING_OPTIONS = [
    'key_file_name',
    'cert_file_name',
    'passphrase',
    'dh_params_file_name',
    'ca_file_name',
    'ssl_ciphers',
];

function validate_host_options(options) {
    const normalized = Object.create(null);
    for (const name of STRING_OPTIONS) {
        if (Object.prototype.hasOwnProperty.call(options, name)) {
            const value = options[name];
            if (typeof value !== 'string' || value.includes('\0'))
                throw new TypeError(
                    `HyperExpress.HostManager option ${name} must be a string without null bytes.`
                );
            normalized[name] = value;
        }
    }

    if (Object.prototype.hasOwnProperty.call(options, 'ssl_prefer_low_memory_usage')) {
        const value = options.ssl_prefer_low_memory_usage;
        if (typeof value !== 'boolean')
            throw new TypeError(
                'HyperExpress.HostManager option ssl_prefer_low_memory_usage must be a boolean.'
            );
        normalized.ssl_prefer_low_memory_usage = value;
    }

    const configures_certificate = Object.prototype.hasOwnProperty.call(
        normalized,
        'cert_file_name'
    );
    const configures_private_key = Object.prototype.hasOwnProperty.call(
        normalized,
        'key_file_name'
    );
    if (
        (configures_certificate || configures_private_key) &&
        (!configures_certificate ||
            !configures_private_key ||
            !normalized.cert_file_name.length ||
            !normalized.key_file_name.length)
    )
        throw new TypeError(
            'HyperExpress.HostManager TLS configuration requires non-empty cert_file_name and key_file_name strings together.'
        );

    return normalized;
}

class HostManager extends EventEmitter {
    #app;
    #hosts = Object.create(null);

    constructor(app) {
        super();
        this.#app = app;

        // Forward missing uWS server names through the HostManager event API
        this.#app.uws_instance.missingServerName((hostname) => this._emit_missing(hostname));
    }

    /** @private */
    _emit_error(error) {
        if (!(error instanceof Error)) error = new Error(`ERR_CAUGHT_NON_ERROR_TYPE: ${error}`);
        if (!this.listenerCount('error')) {
            try {
                console.error(error);
            } catch {}
            return;
        }

        try {
            super.emit('error', error);
        } catch (handler_error) {
            try {
                console.error(handler_error);
            } catch {}
        }
    }

    /** @private */
    _emit_missing(hostname) {
        for (const listener of this.rawListeners('missing')) {
            try {
                const output = Reflect.apply(listener, this, [hostname]);
                if (output != null && typeof output.then === 'function')
                    Promise.resolve(output).catch((error) => this._emit_error(error));
            } catch (error) {
                this._emit_error(error);
            }
        }
    }

    /**
     * @typedef {Object} HostOptions
     * @property {String=} passphrase Strong passphrase for SSL cryptographic purposes.
     * @property {String=} cert_file_name Path to SSL certificate file to be used for SSL/TLS.
     * @property {String=} key_file_name Path to SSL private key file to be used for SSL/TLS.
     * @property {String=} dh_params_file_name Path to file containing Diffie-Hellman parameters.
     * @property {Boolean=} ssl_prefer_low_memory_usage Whether to prefer low memory usage over high performance.
     */

    /**
     * Registers the unique host options to use for the specified hostname for incoming requests.
     *
     * @param {String} hostname
     * @param {HostOptions} options
     * @returns {HostManager}
     */
    add(hostname, options) {
        if (typeof hostname !== 'string' || !hostname.length || hostname.includes('\0'))
            throw new TypeError('HyperExpress.HostManager.add() requires a non-empty hostname string.');
        if (options === null || typeof options !== 'object' || Array.isArray(options))
            throw new TypeError('HyperExpress.HostManager.add() requires an options object.');
        const normalized = validate_host_options(options);

        // Passing a normalized data-only object keeps accessors and proxies out of uWS's
        // unchecked ToLocalChecked option reads.
        this.#app.uws_instance.addServerName(hostname, normalized);
        this.#hosts[hostname] = normalized;
        return this;
    }

    /**
     * Un-Registers the unique host options to use for the specified hostname for incoming requests.
     *
     * @param {String} hostname
     * @returns {HostManager}
     */
    remove(hostname) {
        if (typeof hostname !== 'string' || !hostname.length || hostname.includes('\0'))
            throw new TypeError('HyperExpress.HostManager.remove() requires a non-empty hostname string.');

        this.#app.uws_instance.removeServerName(hostname);
        delete this.#hosts[hostname];
        return this;
    }

    /* HostManager Getters & Properties */

    /**
     * Returns all of the registered hostname options.
     * @returns {Object.<string, HostOptions>}
     */
    get registered() {
        return this.#hosts;
    }
}

module.exports = HostManager;
