const OPERATORS = {};

OPERATORS.stringify_error = (error) => {
    try {
        return JSON.parse(JSON.stringify(error, Object.getOwnPropertyNames(error))).stack;
    } catch (error) {
        return error.toString ? error.toString() : error;
    }
};

OPERATORS.parse_url_parameters_key = (pattern) => {
    let result = null;

    if (pattern.indexOf(':') > -1) {
        let index = 0;
        result = [];
        pattern
            .split('/')
            .filter((part) => part.length > 0)
            .forEach((part) => {
                if (part.substr(0, 1) == ':' && part.split(':').length == 2) {
                    result.push([part.substr(1), index]);
                    index++;
                }
            });
    }

    return result;
};

OPERATORS.fill_object = (original, target) => {
    let reference = this;
    Object.keys(target).forEach((key) => {
        if (typeof target[key] == 'object') {
            if (original[key] == undefined) original[key] = {};
            reference._fill_object(target[key], original[key]);
        } else {
            original[key] = target[key];
        }
    });
    return original;
};

module.exports = OPERATORS;
