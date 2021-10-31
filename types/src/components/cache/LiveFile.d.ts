export = LiveFile;
declare class LiveFile extends EventEmitter {
    constructor(options: any);
    /**
     * @private
     * Initializes File Watcher to reload file on changes
     */
    private _initiate_watcher;
    /**
     * Reloads buffer/content for file asynchronously with retry policy.
     *
     * @private
     * @param {Boolean} fresh
     * @param {Number} count
     * @returns {Promise}
     */
    private reload;
    /**
     * Flushes pending ready promise.
     * @private
     */
    private _flush_ready;
    /**
     * Returns a promise which resolves once first reload is complete.
     *
     * @returns {Promise}
     */
    ready(): Promise<any>;
    get is_ready(): boolean;
    get name(): any;
    get path(): string;
    get extension(): any;
    get content(): any;
    get buffer(): any;
    get last_update(): any;
    get watcher(): any;
    #private;
}
import EventEmitter = require("events");
