import { EventEmitter } from 'events';

interface HostOptions {
    passphrase?: string,
    cert_file_name?: string,
    key_file_name?: string,
    dh_params_file_name?: string,
    ssl_prefer_low_memory_usage?: boolean,
}

export class HostManager extends EventEmitter {
    /**
     * Registers the unique host options to use for the specified hostname for incoming requests.
     *
     * @param {String} hostname
     * @param {HostOptions} options
     * @returns {HostManager}
     */
    add(hostname: string, options: HostOptions): HostManager;

    /**
     * Un-Registers the unique host options to use for the specified hostname for incoming requests.
     *
     * @param {String} hostname
     * @returns {HostManager}
     */
    remove(hostname: string): HostManager;

        /* HostManager Getters & Properties */

    /**
     * Returns all of the registered hostname options.
     * @returns {Object.<string, HostOptions>}
     */
    get registered(): {[hostname: string]: HostOptions};
}