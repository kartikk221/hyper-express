const { log, assert_log, random_string } = require('../../scripts/operators.js');
const { HyperExpress, fetch, server } = require('../../configuration.js');
const { test_request_multipart } = require('./scenarios/request_multipart.js');
const { test_request_stream_pipe } = require('./scenarios/request_stream.js');
const { test_request_chunked_stream } = require('./scenarios/request_chunked_stream.js');
const { test_request_body_echo_test } = require('./scenarios/request_body_echo_test.js');
const { test_request_uncaught_rejections } = require('./scenarios/request_uncaught_rejections.js');
const { test_request_router_paths_test } = require('./scenarios/request_router_paths_test.js');
const { test_request_chunked_json } = require('./scenarios/request_chunked_json.js');
const fs = require('fs');
const _path = require('path');
const crypto = require('crypto');
const router = new HyperExpress.Router();
const endpoint = '/tests/request/:param1/:param2';
const route_specific_endpoint = '/tests/request-route/';
const middleware_delay = 100 + Math.floor(Math.random() * 150);
const signature_value = random_string(10);
const signature_secret = random_string(10);
const middleware_property = random_string(10);
const base = server.base;

// Bind a middlewares for simulating artificial delay on request endpoint
const global_middleware_1 = (request, response, next) => {
    // We only want this middleware to run for this request endpoint
    if (request.headers['x-middleware-test'] === 'true') {
        request.mproperty = middleware_property;
        return setTimeout((n) => n(), middleware_delay, next);
    }

    return next();
};
router.use(global_middleware_1);

// Test Promise returning middlewares support
const global_middleware_2 = (request, response) => {
    return new Promise((resolve, reject) => {
        // We only want this middleware to run for this request endpoint
        if (request.headers['x-middleware-test-2'] === 'true') {
            request.mproperty2 = middleware_property;
        }

        resolve();
    });
};
router.use(global_middleware_2);

let last_endpoint_mproperty;
let last_endpoint_mproperty2;
let last_endpoint_mproperty3;

const route_specific_middleware = (request, response, next) => {
    // We only want this middleware to run for this request endpoint
    if (request.headers['x-middleware-test-3'] === 'true') {
        request.mproperty3 = middleware_property;
        return setTimeout((n) => n(), middleware_delay, next);
    }

    return next();
};

// Load scenarios and bind router to test server
const { test_middleware_double_iteration } = require('./scenarios/middleware_double_iteration.js');
const { test_middleware_iteration_error } = require('./scenarios/middleware_iteration_error.js');
const { test_middleware_uncaught_async_error } = require('./scenarios/middleware_uncaught_async_error.js');
const { test_middleware_layered_iterations } = require('./scenarios/middleware_layered_iteration.js');
const { test_middleware_dynamic_iteration } = require('./scenarios/middleware_dynamic_iteration.js');
const { test_middleware_execution_order } = require('./scenarios/middleware_execution_order.js');
const { TEST_SERVER } = require('../Server.js');
TEST_SERVER.use(router);

// Create a temporary specific middleware route
router.get(
    route_specific_endpoint,
    {
        middlewares: [route_specific_middleware],
    },
    (request, response) => {
        // Store mproperty if exists on request object
        if (request.mproperty3) last_endpoint_mproperty3 = request.mproperty3;

        let body_error;
        try {
            request.body;
        } catch (error) {
            body_error = error;
        }

        return response.json({
            success: true,
            body_error: body_error !== undefined,
        });
    }
);

// Create Backend HTTP Route with expected body of urlencoded to test request.body property
router.any(endpoint, async (request, response) => {
    // Parse the incoming request body as text, json, and urlencoded to test all formats
    let text = await request.text();
    let json = await request.json();
    let urlencoded = await request.urlencoded();

    // Store mproperty if exists on request object to check for middleware
    if (request.mproperty) last_endpoint_mproperty = request.mproperty;
    if (request.mproperty2) last_endpoint_mproperty2 = request.mproperty;

    // Return all possible information about incoming request
    return response.json({
        locals: request.app.locals,
        method: request.method,
        url: request.url,
        path: request.path,
        path_query: request.path_query,
        headers: request.headers,
        path_parameters: request.path_parameters,
        query_parameters: request.query_parameters,
        ip: request.ip,
        proxy_ip: request.proxy_ip,
        cookies: request.cookies,
        signature_check:
            request.unsign(request.sign(signature_value, signature_secret), signature_secret) === signature_value,
        body: {
            text,
            json,
            urlencoded,
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
        `Generating A Large ${body_size.toLocaleString()} Characters Size Body To Simulate Too-Large Large Payload...`
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
    let too_large_body_value = await crypto_random(body_size);
    let body_test_value = too_large_body_value.substr(0, too_large_body_value.length / 2);
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
            'x-middleware-test': 'true',
            'x-middleware-test-2': 'true',
        },
        body: fetch_body,
    };

    // Perform Too Large Body Rejection Test
    const too_large_response = await fetch(base + url, {
        method: test_method,
        body: too_large_body_value,
    });

    // Assert no uwebsockets version header to be found
    assert_log(group, 'No uWebsockets Version Header', () => !too_large_response.headers.get('uwebsockets'));

    // Assert rejection status code as 413 Too Large Payload
    assert_log(group, 'Too Large Body 413 HTTP Code Reject', () => too_large_response.status === 413);

    // Perform a too large body test with transfer-encoding: chunked
    const temp_file_path = _path.resolve(_path.join(__dirname, '../../../tests/content/too-large-file.temp'));
    fs.writeFileSync(temp_file_path, too_large_body_value);
    try {
        const too_large_chunked_response = await fetch(base + url, {
            method: test_method,
            body: fs.createReadStream(temp_file_path),
            headers: {
                'transfer-encoding': 'chunked',
            },
        });

        // Cleanup the temp file
        fs.unlinkSync(temp_file_path);

        // Assert rejection status code as 413 Too Large Payload
        assert_log(
            group,
            'Too Large Body 413 HTTP Code Reject (Chunked)',
            () => too_large_chunked_response.status === 413
        );
    } catch (error) {
        // Cleanup the temp file
        fs.unlinkSync(temp_file_path);
    }

    // Perform a request with a urlencoded body to test .urlencoded() method
    const urlencoded_string = `url1=${param1}&url2=${param2}`;
    const urlencoded_response = await fetch(base + url, {
        method: test_method,
        body: urlencoded_string,
    });
    const urlencoded_body = await urlencoded_response.json();

    // Perform HTTP Request To Endpoint
    let req_start_time = Date.now();
    let response = await fetch(base + url, options);
    let body = await response.json();

    // Verify middleware functionalitiy and property binding
    assert_log(group, 'Middleware Execution & Timing Test', () => Date.now() - req_start_time > middleware_delay);

    assert_log(
        group,
        'Middleware Property Binding Test',
        () => last_endpoint_mproperty === middleware_property && last_endpoint_mproperty2 === middleware_property
    );

    assert_log(group, 'Route Specific Middleware Avoidance Test', () => last_endpoint_mproperty3 == undefined);

    await fetch(base + route_specific_endpoint, {
        headers: {
            'x-middleware-test-3': 'true',
        },
    });

    assert_log(
        group,
        'Route Specific Middleware Binding & Property Test',
        () => last_endpoint_mproperty3 === middleware_property
    );

    // Test request uncaught rejections
    await test_request_uncaught_rejections();

    // Test double iteration violation for middlewares
    await test_middleware_double_iteration();

    // Test layered middleware iterations
    await test_middleware_layered_iterations();

    // Test simulated middleware iteration error
    await test_middleware_iteration_error();

    // Test uncaught async middleware error
    await test_middleware_uncaught_async_error();

    // Test dynamic middleware iteration
    await test_middleware_dynamic_iteration();

    // Test middleware execution order
    await test_middleware_execution_order();

    // Verify .app.locals
    assert_log(group, candidate + '.app.locals', () => body.locals.some_reference.some_data === true);

    // Verify .method
    assert_log(group, candidate + '.method', () => test_method === body.method);

    // Verify .url
    assert_log(group, candidate + '.url', () => body.url === url);

    // Verify .path
    assert_log(group, candidate + '.path', () => path === body.path);

    test_request_router_paths_test();

    // Verify .query
    assert_log(group, candidate + '.query', () => query.substring(1) === body.path_query);

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
    assert_log(group, candidate + '.query_parameters', () => {
        let query1_test = body.query_parameters.query1 === query1;
        let query2_test = body.query_parameters.query2 === query2;
        return query1_test && query2_test;
    });

    // Verify .path_parameters
    assert_log(group, candidate + '.path_parameters', () => {
        let param1_test = body.path_parameters.param1 === param1;
        let param2_test = body.path_parameters.param2 === param2;
        return param1_test && param2_test;
    });

    // Verify .cookies
    assert_log(group, candidate + '.cookies', () => body.cookies[header_test_cookie.name] === header_test_cookie.value);

    // Verify chunked transfer request stream
    await test_request_chunked_stream();

    // Verify .stream readable request stream piping
    await test_request_stream_pipe();

    // Verify .sign() and .unsign()
    assert_log(group, `${candidate}.sign() and ${candidate}.unsign()`, () => body.signature_check === true);

    // Verify .text()
    assert_log(group, candidate + '.text()', () => body.body.text === options.body);

    // Verify .json()
    assert_log(group, candidate + '.json()', () => JSON.stringify(body.body.json) === options.body);

    // Verify .json() with chunked transfer
    await test_request_chunked_json();

    // Verify .json() with small body payload echo test
    await test_request_body_echo_test();

    // Verify .urlencoded()
    assert_log(group, candidate + '.urlencoded()', () => {
        const { url1, url2 } = urlencoded_body.body.urlencoded;
        return url1 === param1 && url2 === param2;
    });

    // Test .multipart() uploader with both a sync/async handler
    await test_request_multipart(false);
    await test_request_multipart(true);

    log(group, `Finished Testing ${candidate} In ${Date.now() - start_time}ms\n`);
}

module.exports = {
    test_request_object: test_request_object,
};
