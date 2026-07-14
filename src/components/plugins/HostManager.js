'use strict';
const EventEmitter = require('events');

class HostManager extends EventEmitter {
    #app;
    #hosts = {};

    constructor(app) {
        super();
        this.#app = app;

        // Forward missing uWS server names through the HostManager event API
        this.#app.uws_instance.missingServerName((hostname) => this.emit('missing', hostname));
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
        this.#hosts[hostname] = options;
        this.#app.uws_instance.addServerName(hostname, options);
        return this;
    }

    /**
     * Un-Registers the unique host options to use for the specified hostname for incoming requests.
     *
     * @param {String} hostname
     * @returns {HostManager}
     */
    remove(hostname) {
        delete this.#hosts[hostname];
        this.#app.uws_instance.removeServerName(hostname);
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
