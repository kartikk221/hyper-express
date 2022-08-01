'use strict';
const FileSystem = require('fs');
const EventEmitter = require('events');
const { wrap_object, async_wait } = require('../../shared/operators.js');

class LiveFile extends EventEmitter {
    #name;
    #watcher;
    #extension;
    #buffer;
    #content;
    #last_update;
    #options = {
        path: '',
        retry: {
            every: 300,
            max: 3,
        },
    };

    constructor(options) {
        // Initialize EventEmitter instance
        super();

        // Wrap options object with provided object
        wrap_object(this.#options, options);

        // Determine the name of the file
        const chunks = options.path.split('/');
        this.#name = chunks[chunks.length - 1];

        // Determine the extension of the file
        this.#extension = this.#options.path.split('.');
        this.#extension = this.#extension[this.#extension.length - 1];

        // Initialize file watcher to keep file updated in memory
        this.reload();
        this._initiate_watcher();
    }

    /**
     * @private
     * Initializes File Watcher to reload file on changes
     */
    _initiate_watcher() {
        // Create FileWatcher that trigger reload method
        this.#watcher = FileSystem.watch(this.#options.path, () => this.reload());
    }

    #reload_promise;
    #reload_resolve;
    #reload_reject;

    /**
     * Reloads buffer/content for file asynchronously with retry policy.
     *
     * @private
     * @param {Boolean} fresh
     * @param {Number} count
     * @returns {Promise}
     */
    reload(fresh = true, count = 0) {
        const reference = this;
        if (fresh) {
            // Reuse promise if there if one pending
            if (this.#reload_promise instanceof Promise) return this.#reload_promise;

            // Create a new promise for fresh lookups
            this.#reload_promise = new Promise((resolve, reject) => {
                reference.#reload_resolve = resolve;
                reference.#reload_reject = reject;
            });
        }

        // Perform filesystem lookup query
        FileSystem.readFile(this.#options.path, async (error, buffer) => {
            // Pipe filesystem error through promise
            if (error) {
                reference._flush_ready();
                return reference.#reload_reject(error);
            }

            // Perform retries in accordance with retry policy
            // This is to prevent empty reads on atomicity based modifications from third-party programs
            const { every, max } = reference.#options.retry;
            if (buffer.length == 0 && count < max) {
                await async_wait(every);
                return reference.reload(false, count + 1);
            }

            // Update instance buffer/content/last_update variables
            reference.#buffer = buffer;
            reference.#content = buffer.toString();
            reference.#last_update = Date.now();

            // Cleanup reload promises and methods
            reference.#reload_resolve();
            reference._flush_ready();
            reference.#reload_resolve = null;
            reference.#reload_reject = null;
            reference.#reload_promise = null;
        });

        return this.#reload_promise;
    }

    #ready_promise;
    #ready_resolve;

    /**
     * Flushes pending ready promise.
     * @private
     */
    _flush_ready() {
        if (typeof this.#ready_resolve == 'function') {
            this.#ready_resolve();
            this.#ready_resolve = null;
        }
        this.#ready_promise = true;
    }

    /**
     * Returns a promise which resolves once first reload is complete.
     *
     * @returns {Promise}
     */
    ready() {
        // Return true if no ready promise exists
        if (this.#ready_promise === true) return Promise.resolve();

        // Create a Promise if one does not exist for ready event
        if (this.#ready_promise === undefined)
            this.#ready_promise = new Promise((resolve) => (this.#ready_resolve = resolve));

        return this.#ready_promise;
    }

    /* LiveFile Getters */
    get is_ready() {
        return this.#ready_promise === true;
    }

    get name() {
        return this.#name;
    }

    get path() {
        return this.#options.path;
    }

    get extension() {
        return this.#extension;
    }

    get content() {
        return this.#content;
    }

    get buffer() {
        return this.#buffer;
    }

    get last_update() {
        return this.#last_update;
    }

    get watcher() {
        return this.#watcher;
    }
}

module.exports = LiveFile;
