/**
 * This method parses route pattern into an array of expected path parameters.
 *
 * @param {String} pattern
 * @returns {Array} [[key {String}, index {Number}], ...]
 */

function parse_path_parameters(pattern) {
    let results = [];
    if (pattern.indexOf('/:') > -1) {
        let chunks = pattern.split('/').filter((chunk) => chunk.length > 0);
        for (let index = 0; index < chunks.length; index++) {
            let current = chunks[index];
            if (current.startsWith(':') && current.length > 2)
                results.push([current.substring(1), index]);
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

function fill_object(original, target) {
    Object.keys(target).forEach((key) => {
        if (typeof target[key] == 'object') {
            if (original[key] == undefined) original[key] = {};
            fill_object(target[key], original[key]);
        } else {
            original[key] = target[key];
        }
    });

    return original;
}

module.exports = {
    parse_path_params: parse_path_parameters,
    arr_buff_to_str: array_buffer_to_string,
    fill_object: fill_object,
};
