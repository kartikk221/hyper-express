const FileSystem = require('fs');
const EventEmitter = require('events');

class LiveFile {
    #path;
    #emitter = new EventEmitter();
    #extension = '';
    #content;
    #watcher;
    #watcher_delay;
    #last_update;

    constructor({ path, watcher_delay = 250 }) {
        // Parse and store path
        this.#path = path;
        const path_chunks = this.#path.split('.');

        // Determine various file metadata properties for faster future access
        this.#extension = path_chunks[path_chunks.length - 1];
        this.#watcher_delay = watcher_delay;
        this.#last_update = Date.now() - watcher_delay;

        // Initialize FileWatcher and perform initial content load into memory
        this._init_watcher();
        this._reload_content();
    }

    /**
     * Binds handler for specified type event.
     *
     * @param {String} type
     * @param {Function} handler
     */
    on(type, handler) {
        this.#emitter.on(type, handler);
    }

    /**
     * Binds handler for specified type event.
     *
     * @param {String} type
     * @param {Function} handler
     */
    once(type, handler) {
        this.#emitter.once(type, handler);
    }

    /**
     * INTERNAL METHOD!
     * This method performs a check against last_update timestamp
     * to ensure sufficient time has passed since last watcher update.
     *
     * @param {Boolean} touch
     * @returns {Boolean} Boolean
     */
    _delay_check() {
        let last_update = this.#last_update;
        let watcher_delay = this.#watcher_delay;
        let result = Date.now() - last_update > watcher_delay;
        return result;
    }

    /**
     * INTERNAL METHOD!
     * This method initiates the FileWatcher used for current live file.
     */
    _init_watcher() {
        let reference = this;

        // Create FileWatcher For File
        this.#watcher = FileSystem.watch(this.#path, (event, file_name) => {
            if (reference._delay_check()) reference._reload_content();
        });

        // Bind FSWatcher Error Handler To Prevent Execution Halt
        this.#watcher.on('error', (error) => this.#emitter.emit('error', error));
    }

    /**
     * INTERNAL METHOD!
     * This method reads/updates content for current live file.
     */
    _reload_content() {
        let reference = this;
        FileSystem.readFile(this.#path, (error, content) => {
            // Report error through error handler
            if (error) return reference.#emitter.emit('error', error);

            // Store newly read content and update file metadata
            reference.#content = content;
            reference.#last_update = Date.now();
            reference.#emitter.emit('reload', content);
        });
    }

    /**
     * Reloads file content by reading directly from file.
     */
    reload() {
        return this._reload_content();
    }

    /**
     * This method can be used to destroy current live file and its watcher.
     */
    destroy() {
        this.#watcher.close();
        this.#content = '';
    }

    /* LiveFile Getters */
    get path() {
        return this.#path;
    }

    get extension() {
        return this.#extension;
    }

    get content() {
        return this.#content;
    }

    get last_update() {
        return this.#last_update;
    }
}

module.exports = LiveFile;
