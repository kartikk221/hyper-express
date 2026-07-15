const crypto = require('crypto');
const HTTP = require('http');
const assert = require('node:assert/strict');

function log(logger = 'SYSTEM', message) {
    let dt = new Date();
    let timeStamp = dt.toLocaleString([], { hour12: true, timeZone: 'America/New_York' }).replace(', ', ' ').split(' ');
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

async function assert_log(group, target, assertion) {
    try {
        const result = await assertion();
        assert.ok(result, 'Failed To Verify ' + target + ' @ ' + group + ' -> ' + assertion.toString());
        log(group, 'Verified ' + target);
    } catch (error) {
        throw new Error('Failed To Verify ' + target + ' @ ' + group + ' -> ' + assertion.toString(), {
            cause: error,
        });
    }
}

function async_for_each(items, handler, cursor = 0, final) {
    if (final == undefined) return new Promise((resolve, reject) => async_for_each(items, handler, cursor, resolve));
    if (cursor < items.length) return handler(items[cursor], () => async_for_each(items, handler, cursor + 1, final));
    return final(); // Resolve master promise
}

function http_post_headers({ host, port, path, method = 'GET', body, headers = {}, silence_errors = false }) {
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

function async_wait(delay) {
    return new Promise((resolve, reject) => setTimeout((res) => res(), delay, resolve));
}

function md5_from_buffer(buffer) {
    return crypto.createHash('md5').update(buffer).digest('hex');
}

module.exports = {
    log: log,
    random_string: random_string,
    assert_log: assert_log,
    async_for_each: async_for_each,
    http_post_headers: http_post_headers,
    async_wait: async_wait,
    md5_from_buffer: md5_from_buffer,
};
