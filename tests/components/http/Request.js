const root = '../../';
const { log, assert_log, random_string } = require(root + 'scripts/operators.js');
const { fetch, server } = require(root + 'scripts/configuration.js');
const { webserver } = require(root + 'setup/webserver.js');
const crypto = require('crypto');
const endpoint = '/tests/request/:param1/:param2';
const base = server.base;

let last_endpoint_body;

// Create Backend HTTP Route
webserver.any(endpoint, async (request, response) => {
    let text = await request.text();
    last_endpoint_body = text;
    let json = await request.json();

    // Return all possible information about incoming request
    return response.json({
        method: request.method,
        url: request.url,
        path: request.path,
        query: request.query,
        headers: request.headers,
        path_parameters: request.path_parameters,
        query_parameters: request.query_parameters,
        ip: request.ip,
        proxy_ip: request.proxy_ip,
        cookies: request.cookies,
        body: {
            text: text,
            json: json,
        },
    });
});

function crypto_random(length) {
    return new Promise((resolve, reject) =>
        crypto.randomBytes(Math.round(length / 2), (error, buffer) => {
            if (error) return reject(error);
            resolve(buffer.toString('hex'));
        })
    );
}

async function test_request_object() {
    // Prepare Test Candidates
    log('REQUEST', 'Testing HyperExpress.Request Object...');

    const body_size = 10 * 1024 * 1024;
    log(
        'REQUEST',
        `Generating A Large ${body_size.toLocaleString()} Characters Size Body To Simulate Large Payload...`
    );

    let group = 'REQUEST';
    let candidate = 'HyperExpress.Request';
    let start_time = Date.now();
    let test_method = 'POST';
    let param1 = random_string(10);
    let param2 = random_string(10);
    let query1 = random_string(10);
    let query2 = random_string(10);
    let query = `?query1=${query1}&query2=${query2}`;
    let body_test_value = await crypto_random(body_size);
    let fetch_body = JSON.stringify({
        test_value: body_test_value,
    });
    let header_test_value = random_string(10);
    let header_test_cookie = {
        name: random_string(10),
        value: random_string(10),
    };

    // Prepare HTTP Request Information
    let path = `/tests/request/${param1}/${param2}`;
    let url = path + query;
    let options = {
        method: test_method,
        headers: {
            'x-test-value': header_test_value,
            'content-type': 'application/json',
            cookie: `${header_test_cookie.name}=${header_test_cookie.value}`,
        },
        body: fetch_body,
    };

    // Perform HTTP Request To Endpoint
    let response = await fetch(base + url, options);
    let body = await response.json();

    // Verify .method
    assert_log(group, candidate + '.method', () => test_method === body.method);

    // Verify .url
    assert_log(group, candidate + '.url', () => body.url === url);

    // Verify .path
    assert_log(group, candidate + '.path', () => path === body.path);

    // Verify .query
    assert_log(group, candidate + '.query', () => query.substring(1) === body.query);

    // Verify .ip
    assert_log(group, candidate + '.ip', () => body.ip === '127.0.0.1');

    // Verify .proxy_ip
    assert_log(group, candidate + '.proxy_ip', () => body.proxy_ip === '');

    // Verify .headers
    assert_log(group, candidate + '.headers["x-test-value", "cookie", "content-length"]', () => {
        let headers = body.headers;
        let value_test = headers['x-test-value'] === header_test_value;
        let cookie_test = headers.cookie === options.headers.cookie;
        let content_length_test = +headers['content-length'] === fetch_body.length;
        return value_test && cookie_test && content_length_test;
    });

    // Verify .query_parameters
    assert_log(group, candidate + '.path_parameters', () => {
        let query1_test = body.query_parameters.query1 === query1;
        let query2_test = body.query_parameters.query2 === query2;
        return query1_test && query2_test;
    });

    // Verify .cookies
    assert_log(
        group,
        candidate + '.cookies',
        () => body.cookies[header_test_cookie.name] === header_test_cookie.value
    );

    // Verify .text()
    assert_log(group, candidate + '.text()', () => body.body.text === options.body);

    // Verify .json()
    assert_log(group, candidate + '.json()', () => JSON.stringify(body.body.json) === options.body);

    log(group, `Finished Testing ${candidate} In ${Date.now() - start_time}ms\n`);
}

module.exports = {
    test_request_object: test_request_object,
};
