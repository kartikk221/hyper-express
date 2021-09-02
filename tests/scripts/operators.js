const HTTP = require('http');

function log(logger = 'SYSTEM', message) {
    let dt = new Date();
    let timeStamp = dt
        .toLocaleString([], { hour12: true, timeZone: 'America/New_York' })
        .replace(', ', ' ')
        .split(' ');
    timeStamp[1] += ':' + dt.getMilliseconds().toString().padStart(3, '0') + 'ms';
    timeStamp = timeStamp.join(' ');
    console.log(`[${timeStamp}][${logger}] ${message}`);
}

function random_string(length = 7) {
    var result = [];
    var characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    var charactersLength = characters.length;
    for (var i = 0; i < length; i++) {
        result.push(characters.charAt(Math.floor(Math.random() * charactersLength)));
    }
    return result.join('');
}

function assert_log(group, target, assertion) {
    try {
        let result = assertion();
        if (result) {
            log(group, 'Verified ' + target);
        } else {
            throw new Error(
                'Failed To Verify ' + target + ' @ ' + group + ' -> ' + assertion.toString()
            );
        }
    } catch (error) {
        console.log(error);
        throw new Error(
            'Failed To Verify ' + target + ' @ ' + group + ' -> ' + assertion.toString()
        );
    }
}

function async_for_each(items, handler, cursor = 0, final) {
    if (final == undefined)
        return new Promise((resolve, reject) => async_for_each(items, handler, cursor, resolve));
    if (cursor < items.length)
        return handler(items[cursor], () => async_for_each(items, handler, cursor + 1, final));
    return final(); // Resolve master promise
}

function http_post_headers({
    host,
    port,
    path,
    method = 'GET',
    body,
    headers = {},
    silence_errors = false,
}) {
    return new Promise((resolve, reject) => {
        const request = HTTP.request({
            host,
            port,
            path,
            method,
            headers,
        });

        if (body) request.write(body);

        request.on('response', (response) =>
            resolve({
                url: response.url,
                status: response.statusCode,
                headers: response.headers,
            })
        );

        if (!silence_errors) request.on('error', reject);
    });
}

module.exports = {
    log: log,
    random_string: random_string,
    assert_log: assert_log,
    async_for_each: async_for_each,
    http_post_headers: http_post_headers,
};
