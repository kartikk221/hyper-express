const OPERATORS = {};

OPERATORS.stringify_error = (error) => {
    try {
        return JSON.parse(JSON.stringify(error, Object.getOwnPropertyNames(error))).stack;
    } catch (error) {
        return error.toString ? error.toString() : error;
    }
};

OPERATORS.translate_duration_to_ms = (string) => {
    let value = 0;
    if (typeof string == 'string' && string.indexOf(' ') > -1) {
        string = string.toLowerCase().split(' ');
        let amount = +string[0];
        let tag = string[1];
        if (!isNaN(amount)) {
            let exact = typeof string[2] == 'string' && string[2].indexOf('strict') > -1;

            if (tag.indexOf('millisecond') > -1) {
                amount *= 1;
            } else if (tag.indexOf('second') > -1) {
                amount *= 1000;
            } else if (tag.indexOf('minute') > -1) {
                amount *= 1000 * 60;
            } else if (tag.indexOf('hour') > -1) {
                amount *= 1000 * 60 * 60;
            } else if (tag.indexOf('day') > -1) {
                amount *= 1000 * 60 * 60 * 24;
            } else if (tag.indexOf('week') > -1) {
                amount *= 1000 * 60 * 60 * 24 * 7;
            }

            value = exact ? amount : Date.now() + amount;
        }
    }

    return value;
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

module.exports = OPERATORS;
