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
        super();

        // Merge user options into the LiveFile defaults
        wrap_object(this.#options, options);

        const chunks = options.path.split('/');
        this.#name = chunks[chunks.length - 1];

        this.#extension = this.#options.path.split('.');
        this.#extension = this.#extension[this.#extension.length - 1];

        // Complete the initial load before watching for subsequent changes
        this.reload()
            .then(() => this._initiate_watcher())
            .catch((error) => this.emit('error', error));
    }

    /**
     * @private
     * Initializes File Watcher to reload file on changes
     */
    _initiate_watcher() {
        // Debounce filesystem changes through the shared reload promise
        this.#watcher = FileSystem.watch(this.#options.path, () =>
            this.reload().catch((error) => this.emit('error', error))
        );
        this.#watcher.on('error', (error) => this.emit('error', error));
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
            // Reuse an in-flight lookup for concurrent reload callers
            if (this.#reload_promise instanceof Promise) return this.#reload_promise;

            this.#reload_promise = new Promise((resolve, reject) => {
                reference.#reload_resolve = resolve;
                reference.#reload_reject = reject;
            });
        }

        FileSystem.readFile(this.#options.path, async (error, buffer) => {
            if (error) {
                const reject = reference.#reload_reject;
                reference.#reload_resolve = null;
                reference.#reload_reject = null;
                reference.#reload_promise = null;
                reference._flush_ready(error);
                return reject(error);
            }

            // Retry empty reads caused by atomic file replacements from third-party programs
            const { every, max } = reference.#options.retry;
            if (buffer.length == 0 && count < max) {
                await async_wait(every);
                return reference.reload(false, count + 1);
            }

            reference.#buffer = buffer;
            reference.#content = buffer.toString();
            reference.#last_update = Date.now();

            // Resolve all callers before clearing the shared reload state
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
    #ready_reject;
    #ready_error;

    /**
     * Flushes pending ready promise.
     * @private
     */
    _flush_ready(error) {
        if (error) {
            this.#ready_error = error;
            if (typeof this.#ready_reject == 'function') this.#ready_reject(error);
        } else {
            if (typeof this.#ready_resolve == 'function') this.#ready_resolve();
            this.#ready_promise = true;
        }
        this.#ready_resolve = null;
        this.#ready_reject = null;
    }

    /**
     * Returns a promise which resolves once first reload is complete.
     *
     * @returns {Promise}
     */
    ready() {
        // Reuse the resolved or pending readiness state across callers
        if (this.#ready_promise === true) return Promise.resolve();
        if (this.#ready_error) return Promise.reject(this.#ready_error);

        if (this.#ready_promise === undefined)
            this.#ready_promise = new Promise((resolve, reject) => {
                this.#ready_resolve = resolve;
                this.#ready_reject = reject;
            });

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
