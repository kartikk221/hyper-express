'use strict';
/**
 * Writes values from focus object onto base object.
 *
 * @param {Object} obj1 Base Object
 * @param {Object} obj2 Focus Object
 */
function wrap_object(original, target) {
    Object.keys(target).forEach((key) => {
        if (typeof target[key] == 'object') {
            if (Array.isArray(target[key])) return (original[key] = target[key]); // lgtm [js/prototype-pollution-utility]
            if (original[key] === null || typeof original[key] !== 'object') original[key] = {};
            wrap_object(original[key], target[key]);
        } else {
            original[key] = target[key];
        }
    });
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
        let chunks = pattern.split('/').filter((chunk) => chunk.length > 0);
        for (let index = 0; index < chunks.length; index++) {
            let current = chunks[index];
            if (current.startsWith(':') && current.length > 2) {
                results.push([current.substring(1), counter]);
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
    // handle both roots merger case
    if (base_path == '/' && new_path == '/') return '/';

    // Inject leading slash to new_path
    if (!new_path.startsWith('/')) new_path = '/' + new_path;

    // handle base root merger case
    if (base_path == '/') return new_path;

    // handle new path root merger case
    if (new_path == '/') return base_path;

    // strip away leading slash from base path
    if (base_path.endsWith('/')) base_path = base_path.substr(0, base_path.length - 1);

    // Merge path and add a slash in between if new_path does not have a starting slash
    return `${base_path}${new_path}`;
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
    // Recursively call self if the from prototype is an Array of prototypes
    if (Array.isArray(from)) return from.forEach((f) => inherit_prototype({ from: f, to, override, method, ignore }));

    // Inherit the descriptors from the "from" prototype to the "to" prototype
    const to_descriptors = Object.getOwnPropertyDescriptors(to);
    const from_descriptors = Object.getOwnPropertyDescriptors(from);
    Object.keys(from_descriptors).forEach((name) => {
        // Ignore the properties specified in the ignore array
        if (ignore.includes(name)) return;

        // Destructure the descriptor function properties
        const { value, get, set } = from_descriptors[name];

        // Determine if this descriptor name would be an override
        // Override the original name with the provided name resolver for overrides
        if (typeof override == 'function' && to_descriptors[name]?.value) name = override(name) || name;

        // Determine if the descriptor is a method aka. a function
        if (typeof value === 'function') {
            // Inject a middleman method into the "to" prototype
            const middleman = method('FUNCTION', name, value);
            if (middleman) {
                // Define the middleman method on the "to" prototype
                Object.defineProperty(to, name, {
                    configurable: true,
                    enumerable: true,
                    writable: true,
                    value: middleman,
                });
            }
        } else {
            // Initialize a definition object
            const definition = {};

            // Initialize a middleman getter method
            if (typeof get === 'function') definition.get = method('GETTER', name, get);

            // Initialize a middleman setter method
            if (typeof set === 'function') definition.set = method('SETTER', name, set);

            // Inject the definition into the "to" prototype
            if (definition.get || definition.set) Object.defineProperty(to, name, definition);
        }
    });
}

module.exports = {
    parse_path_parameters,
    array_buffer_to_string,
    wrap_object,
    async_wait,
    inherit_prototype,
    merge_relative_paths,
};
