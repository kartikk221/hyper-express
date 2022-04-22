import * as FileSystem from 'fs';
import { EventEmitter} from 'events';

export interface LiveFileOptions {
    path: string,
    retry: {
        every: number,
        max: number
    }
}

export class LiveFile extends EventEmitter {
    constructor(options: LiveFileOptions)

    /**
     * Reloads buffer/content for file asynchronously with retry policy.
     *
     * @private
     * @param {Boolean} fresh
     * @param {Number} count
     * @returns {Promise}
     */
    reload(fresh: boolean, count: number): Promise<any>;

    /**
     * Returns a promise which resolves once first reload is complete.
     *
     * @returns {Promise}
     */
    ready(): Promise<any>

    /* LiveFile Getters */
    get is_ready(): boolean;

    get name(): string;

    get path(): string;

    get extension(): string;

    get content(): string;

    get buffer(): Buffer;

    get last_update(): number;

    get watcher(): FileSystem.FSWatcher;
}
