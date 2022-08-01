'use strict';
const EventEmitter = require('events');

class HostManager extends EventEmitter {
    #app;
    #hosts = {};

    constructor(app) {
        // Initialize event emitter
        super();

        // Store app reference
        this.#app = app;

        // Bind a listener which emits 'missing' events from uWS when a host is not found
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
        // Store host options
        this.#hosts[hostname] = options;

        // Register the host server with uWS
        this.#app.uws_instance.addServerName(hostname, options);

        // Return this instance
        return this;
    }

    /**
     * Un-Registers the unique host options to use for the specified hostname for incoming requests.
     *
     * @param {String} hostname
     * @returns {HostManager}
     */
    remove(hostname) {
        // Remove host options
        delete this.#hosts[hostname];

        // Un-Register the host server with uWS
        this.#app.uws_instance.removeServerName(hostname);

        // Return this instance
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
