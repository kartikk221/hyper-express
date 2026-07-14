'use strict';
/**
 * Writes values from focus object onto base object.
 *
 * @param {Object} obj1 Base Object
 * @param {Object} obj2 Focus Object
 */
function wrap_object(original, target) {
    // Copy own values while recursively merging nested option objects
    const target_keys = Object.keys(target);
    for (let index = 0; index < target_keys.length; index++) {
        const target_key = target_keys[index];
        const target_value = target[target_key];
        if (typeof target_value == 'object') {
            if (Array.isArray(target_value)) {
                original[target_key] = target_value; // lgtm [js/prototype-pollution-utility]
                continue;
            }
            if (original[target_key] === null || typeof original[target_key] !== 'object') {
                original[target_key] = {};
            }
            const original_value = original[target_key];
            wrap_object(original_value, target_value);
        } else {
            original[target_key] = target_value;
        }
    }
}

/**
 * This method parses route pattern into an array of expected path parameters.
 *
 * @param {String} pattern
 * @returns {Array} [[key {String}, index {Number}], ...]
 */

function parse_path_parameters(pattern) {
    let results = [];
    let counter = 0;
    if (pattern.indexOf('/:') > -1) {
        const path_chunks = pattern.split('/');
        for (const path_chunk of path_chunks) {
            if (path_chunk.startsWith(':') && path_chunk.length > 2) {
                results.push([path_chunk.substring(1), counter]);
                counter++;
            }
        }
    }
    return results;
}

/**
 * This method converts ArrayBuffers to a string.
 *
 * @param {ArrayBuffer} array_buffer
 * @param {String} encoding
 * @returns {String} String
 */

function array_buffer_to_string(array_buffer, encoding = 'utf8') {
    return Buffer.from(array_buffer).toString(encoding);
}

/**
 * Copies an ArrayBuffer to a Uint8Array.
 * Note! This method is supposed to be extremely performant as it is used by the Body parser.
 * @param {ArrayBuffer} array_buffer
 */
function copy_array_buffer_to_uint8array(array_buffer) {
    const source = new Uint8Array(array_buffer);
    return new Uint8Array(source.subarray(0, source.length));
}

/**
 * Returns a promise which is resolved after provided delay in milliseconds.
 *
 * @param {Number} delay
 * @returns {Promise}
 */
function async_wait(delay) {
    return new Promise((resolve, reject) => setTimeout((res) => res(), delay, resolve));
}

/**
 * Merges provided relative paths into a singular relative path.
 *
 * @param {String} base_path
 * @param {String} new_path
 * @returns {String} path
 */
function merge_relative_paths(base_path, new_path) {
    // Preserve root semantics before normalizing the path boundary
    if (base_path == '/' && new_path == '/') return '/';

    if (!new_path.startsWith('/')) new_path = '/' + new_path;

    if (base_path == '/') return new_path;

    if (new_path == '/') return base_path;

    // Ensure the paths join across exactly one slash
    if (base_path.endsWith('/')) base_path = base_path.substr(0, base_path.length - 1);

    return `${base_path}${new_path}`;
}

/**
 * Returns all property descriptors of an Object including extended prototypes.
 *
 * @param {Object} prototype
 */
function get_all_property_descriptors(prototype) {
    const descriptors = Object.getOwnPropertyDescriptors(prototype);

    // Include custom ancestors while stopping before the base Object prototype
    const parent = Object.getPrototypeOf(prototype);
    if (parent && parent.constructor.name !== 'Object') {
        return Object.assign(descriptors, get_all_property_descriptors(parent));
    }

    return descriptors;
}

/**
 * Inherits properties, getters, and setters from one prototype to another with the ability to optionally define middleman methods.
 *
 * @param {Object} options
 * @param {Object|Array<Object>} options.from - The prototype to inherit from
 * @param {Object} options.to - The prototype to inherit to
 * @param {function(('FUNCTION'|'GETTER'|'SETTER'), string, function):function=} options.method - The method to inherit. Parameters are: type, name, method.
 * @param {function(string):string=} options.override - The method name to override the original with. Parameters are: name.
 * @param {Array<string>} options.ignore - The property names to ignore
 */
function inherit_prototype({ from, to, method, override, ignore = ['constructor'] }) {
    // Apply each source prototype in order when multiple sources are provided
    if (Array.isArray(from)) {
        const prototypes = from;
        for (const prototype of prototypes) {
            inherit_prototype({ from: prototype, to, override, method, ignore });
        }
        return;
    }

    // Collect source and target descriptors once before matching members
    const to_descriptors = get_all_property_descriptors(to);
    const from_descriptors = get_all_property_descriptors(from);
    const descriptor_names = Object.keys(from_descriptors);
    for (let index = 0; index < descriptor_names.length; index++) {
        let descriptor_name = descriptor_names[index];
        if (ignore.includes(descriptor_name)) continue;

        const descriptor = from_descriptors[descriptor_name];
        const { value, get, set } = descriptor;

        // Redirect collisions to the configured override name
        if (typeof override == 'function' && to_descriptors[descriptor_name]?.value) {
            descriptor_name = override(descriptor_name) || descriptor_name;
        }

        if (typeof value === 'function') {
            const middleman = method('FUNCTION', descriptor_name, value);
            if (middleman) {
                Object.defineProperty(to, descriptor_name, {
                    configurable: true,
                    enumerable: true,
                    writable: true,
                    value: middleman,
                });
            }
        } else {
            const definition = {};

            if (typeof get === 'function') definition.get = method('GETTER', descriptor_name, get);

            if (typeof set === 'function') definition.set = method('SETTER', descriptor_name, set);

            if (definition.get || definition.set) Object.defineProperty(to, descriptor_name, definition);
        }
    }
}

/**
 * Converts Windows path backslashes to forward slashes.
 * @param {string} string
 * @returns {string}
 */
function to_forward_slashes(string) {
    return string.split('\\').join('/');
}

module.exports = {
    parse_path_parameters,
    array_buffer_to_string,
    wrap_object,
    async_wait,
    inherit_prototype,
    merge_relative_paths,
    to_forward_slashes,
    copy_array_buffer_to_uint8array,
};
