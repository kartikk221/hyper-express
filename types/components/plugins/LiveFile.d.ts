import * as FileSystem from 'fs';
import { EventEmitter } from 'events';

export interface LiveFileOptions {
    path: string;
    retry?: {
        every?: number;
        max?: number;
    };
}

export class LiveFile extends EventEmitter {
    constructor(options: LiveFileOptions);

    /**
     * Reloads buffer/content for file asynchronously with retry policy.
     *
     * @private
     * @param {Boolean} fresh
     * @param {Number} count
     * @returns {Promise}
     */
    reload(fresh?: boolean, count?: number): Promise<void>;

    /**
     * Returns a promise which resolves once first reload is complete.
     *
     * @returns {Promise}
     */
    ready(): Promise<void>;

    /** Disposes the watcher. Returns false when the file was already closed. */
    close(): boolean;

    /* LiveFile Getters */
    get is_ready(): boolean;

    get name(): string;

    get path(): string;

    get extension(): string;

    get content(): string | undefined;

    get buffer(): Buffer | undefined;

    get last_update(): number | undefined;

    get watcher(): FileSystem.FSWatcher | undefined;

    get closed(): boolean;
}
