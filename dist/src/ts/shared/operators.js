"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.get_all_property_descriptors = exports.merge_relative_paths = exports.async_wait = exports.array_buffer_to_string = exports.parsePathParameters = exports.parse_path_parameters = exports.wrap_object = void 0;
const wrap_object = (original, target) => {
    // initial implemmentation
    // Object.keys(target).forEach((key) => {
    //   if (typeof target[key] == 'object') {
    //     if (Array.isArray(target[key])) return (original[key] = target[key]); // lgtm [js/prototype-pollution-utility]
    //     if (original[key] === null || typeof original[key] !== 'object') original[key] = {};
    //     wrap_object(original[key], target[key]);
    //   } else {
    //     original[key] = target[key];
    //   }
    Object.assign(original, target);
    // for (const key in target) {
    //   if (typeof target[key] == 'object') {
    //     if (Array.isArray(target[key])) {
    //       original[key] = target[key]; // lgtm [js/prototype-pollution-utility]
    //       continue;
    //     }
    //     if (original[key] === null || typeof original[key] !== 'object') original[key] = {};
    //     wrap_object(original[key], target[key]);
    //   } else {
    //     original[key] = target[key];
    //   }
    // }
};
exports.wrap_object = wrap_object;
const parse_path_parameters = (pattern) => {
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
};
exports.parse_path_parameters = parse_path_parameters;
// change return type
// @parse_path_parameters: "ddd/:id/:ev/:co" --> [ [ 'id', 0 ], [ 'ev', 1 ], [ 'co', 2 ] ]
// @parsePathParameters: "ddd/:id/:ev/:co" --> { 'id': 0, 'ev': 1, 'co': 2 }
const parsePathParameters = (pattern) => {
    const results = {};
    let counter = 0;
    if (pattern.indexOf('/:') > -1)
        pattern
            .split('/')
            .filter((chunk) => chunk.length > 0)
            .forEach((chunk) => {
            if (chunk.startsWith(':') && chunk.length > 2) {
                results[chunk.substring(1)] = counter;
                counter++;
            }
        });
    return results;
};
exports.parsePathParameters = parsePathParameters;
/**
 * This method converts ArrayBuffers to a string.
 *
 * @param {ArrayBuffer} array_buffer
 * @param {String} encoding
 * @returns {String} String
 */
const array_buffer_to_string = (array_buffer, encoding = 'utf8') => {
    return Buffer.from(array_buffer).toString(encoding);
    // let initString = "";
    // const ub = new Uint8Array(array_buffer);
    // for (let k = 0; k < ub.length; k++) {
    //   initString += String.fromCharCode(ub[k]);
    // }
    // return initString;
};
exports.array_buffer_to_string = array_buffer_to_string;
const async_wait = (delay) => {
    return new Promise((resolve, _reject) => setTimeout((res) => res(), delay, resolve));
};
exports.async_wait = async_wait;
/**
 * Merges provided relative paths into a singular relative path.
 *
 * @param {String} base_path
 * @param {String} new_path
 * @returns {String} path
 */
const merge_relative_paths = (base_path, new_path) => {
    // handle both roots merger case
    if (base_path == '/' && new_path == '/')
        return '/';
    // Inject leading slash to new_path
    if (!new_path.startsWith('/'))
        new_path = '/' + new_path;
    // handle base root merger case
    if (base_path == '/')
        return new_path;
    // handle new path root merger case
    if (new_path == '/')
        return base_path;
    // strip away leading slash from base path
    if (base_path.endsWith('/'))
        base_path = base_path.substring(0, base_path.length - 1);
    // Merge path and add a slash in between if new_path does not have a starting slash
    return `${base_path}${new_path}`;
};
exports.merge_relative_paths = merge_relative_paths;
/**
 * Returns all property descriptors of an Object including extended prototypes.
 *
 * @param {Object} prototype
 */
const get_all_property_descriptors = (prototype) => {
    // Retrieve initial property descriptors
    const descriptors = Object.getOwnPropertyDescriptors(prototype);
    // Determine if we have a parent prototype with a custom name
    const parent = Object.getPrototypeOf(prototype);
    if (parent && parent.constructor.name !== 'Object') {
        // Merge and return property descriptors along with parent prototype
        return Object.assign(descriptors, (0, exports.get_all_property_descriptors)(parent));
    }
    // Return property descriptors
    return descriptors;
};
exports.get_all_property_descriptors = get_all_property_descriptors;
//# sourceMappingURL=operators.js.map