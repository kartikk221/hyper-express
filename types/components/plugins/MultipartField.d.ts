import { Readable, WritableOptions } from 'stream';

export type MultipartFile = {
    name?: string,
    stream: Readable
}

export type Truncations = {
    name: boolean,
    value: boolean
}

export class MultipartField {
    /* MultipartField Methods */

    /**
     * Saves this multipart file content to the specified path.
     * Note! You must specify the file name and extension in the path itself.
     *
     * @param {String} path Path with file name to which you would like to save this file.
     * @param {WritableOptions} options Writable stream options
     * @returns {Promise}
     */
    write(path: string, options?: WritableOptions): Promise<void>;

    /* MultipartField Properties */

    /**
     * Field name as specified in the multipart form.
     * @returns {String}
     */
    get name(): string;

    /**
     * Field encoding as specified in the multipart form.
     * @returns {String}
     */
    get encoding(): string;

    /**
     * Field mime type as specified in the multipart form.
     * @returns {String}
     */
    get mime_type(): string;

    /**
     * Returns file information about this field if it is a file type.
     * Note! This property will ONLY be defined if this field is a file type.
     *
     * @returns {MultipartFile}
     */
    get file(): MultipartFile | void;

    /**
     * Returns field value if this field is a non-file type.
     * Note! This property will ONLY be defined if this field is a non-file type.
     *
     * @returns {String}
     */
    get value(): string | void;

    /**
     * Returns information about truncations in this field.
     * Note! This property will ONLY be defined if this field is a non-file type.
     *
     * @returns {Truncations}
     */
    get truncated(): Truncations | void;
}

export type MultipartHandler = (field: MultipartField) => void | Promise<void>;

export type MultipartLimitReject = "PARTS_LIMIT_REACHED" | "FILES_LIMIT_REACHED" | "FIELDS_LIMIT_REACHED";