/**
 * This method parses route pattern into an array of expected path parameters.
 *
 * @param {String} pattern
 * @returns {Array} [[key {String}, index {Number}], ...]
 */
export function parse_path_parameters(pattern: string): any[];
/**
 * This method converts ArrayBuffers to a string.
 *
 * @param {ArrayBuffer} array_buffer
 * @param {String} encoding
 * @returns {String} String
 */
export function array_buffer_to_string(array_buffer: ArrayBuffer, encoding?: string): string;
/**
 * Writes values from focus object onto base object.
 *
 * @param {Object} obj1 Base Object
 * @param {Object} obj2 Focus Object
 */
export function wrap_object(original: any, target: any): void;
/**
 * Returns a promise which is resolved after provided delay in milliseconds.
 *
 * @param {Number} delay
 * @returns {Promise}
 */
export function async_wait(delay: number): Promise<any>;
/**
 * Merges provided relative paths into a singular relative path.
 *
 * @param {String} base_path
 * @param {String} new_path
 * @returns {String} path
 */
export function merge_relative_paths(base_path: string, new_path: string): string;
