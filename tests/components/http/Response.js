const { log, assert_log, random_string } = require('../../scripts/operators.js');
const { HyperExpress, fetch, server } = require('../../configuration.js');
const { test_livefile_object } = require('../../components/features/LiveFile.js');
const { test_response_custom_status } = require('./scenarios/response_custom_status.js');
const { test_response_send_no_body } = require('./scenarios/response_send_no_body.js');
const { test_response_headers_behavior } = require('./scenarios/response_headers_behavior.js');
const { test_response_stream_method } = require('./scenarios/response_stream.js');
const { test_response_chunked_write } = require('./scenarios/response_chunked_write.js');
const { test_response_piped_write } = require('./scenarios/response_piped.js');
const { test_response_events } = require('./scenarios/response_hooks.js');
const { test_response_custom_content_length } = require('./scenarios/response_custom_content_length.js');
const { test_response_sse } = require('./scenarios/response_sse.js');
const router = new HyperExpress.Router();
const endpoint = '/tests/response/operators';
const endpoint_url = server.base + endpoint;

function write_prepare_event(request, response) {
    if (typeof request.url == 'string' && !response.completed) {
        response.header('hook-called', 'prepare');
        events_emitted.push('prepare');
    }
}

// Create Backend HTTP Route
const events_emitted = [];
router.post(endpoint, async (request, response) => {
    let body = await request.json();

    // Validate response.app.locals
    if (response.app.locals.some_reference.some_data !== true) throw new Error('Invalid Response App Locals Detected!');

    // Test hooks
    response.on('abort', () => events_emitted.push('abort'));
    response.on('prepare', write_prepare_event);
    response.on('finish', () => events_emitted.push('finish'));
    response.on('close', () => events_emitted.push('close'));

    // Perform Requested Operations For Testing
    if (Array.isArray(body))
        body.forEach((operation) => {
            let method = operation[0];
            let parameters = operation[1];

            // Utilize the Response.statusCode compatibility setter for status code modifications
            if (method == 'status') {
                response.statusCode = parameters;
            } else if (Array.isArray(parameters)) {
                // Support up to 4 multi parameters
                response[method](parameters[0], parameters[1], parameters[2], parameters[3]);
            } else {
                response[method](parameters);
            }
        });

    if (!response.aborted) return response.send();
});

// Bind router to webserver
const { TEST_SERVER } = require('../Server.js');
TEST_SERVER.use(router);

async function test_response_object() {
    let start_time = Date.now();
    let group = 'RESPONSE';
    let candidate = 'HyperExpress.Response';
    log(group, 'Testing HyperExpress.Response Object...');

    // Test HyperExpress.Response Operators
    let test_status_code = 404;
    let test_mime_type = 'html';
    let header_test_name = random_string(10);
    let header_test_value = random_string(10);
    let cookie_test_name = random_string(10);
    let cookie_test_value = random_string(10);
    let test_html_placeholder = random_string(20);
    let test_cookie = {
        name: random_string(10) + '_sess',
        value: random_string(10),
    };

    let response1 = await fetch(endpoint_url, {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
            cookie: `${test_cookie.name}=${test_cookie.value}`,
        },
        body: JSON.stringify([
            ['status', test_status_code],
            ['type', test_mime_type],
            ['header', [header_test_name, header_test_value]],
            ['cookie', [cookie_test_name, cookie_test_value]],
            ['cookie', [test_cookie.name, null]],
            ['send', test_html_placeholder],
        ]),
    });
    let body1 = await response1.text();

    // Verify .status()
    assert_log(group, candidate + '.status()', () => test_status_code === response1.status);

    // Verify .type()
    assert_log(
        group,
        candidate + '.type()',
        () => response1.headers.get('content-type') === 'text/html; charset=utf-8'
    );

    // Verify .header()
    assert_log(group, candidate + '.header()', () => response1.headers.get(header_test_name) === header_test_value);

    // Verify .cookie()
    assert_log(group, candidate + '.cookie() AND .cookie(name, null) to delete', () => {
        let cookies = {};
        response1.headers
            .get('set-cookie')
            .split(', ')
            .forEach((chunk) => {
                if (chunk.indexOf('=') > -1) {
                    chunk = chunk.split('=');
                    let name = chunk[0];
                    let value = chunk[1].split(';')[0];
                    let properties = chunk.join('=').split('; ')[1];
                    cookies[name] = {
                        value: value,
                        properties: properties,
                    };
                }
            });

        let test_cookie_test = cookies[cookie_test_name]?.value === cookie_test_value;
        let delete_cookie_value_test = cookies[test_cookie.name]?.value === '';
        let delete_cookie_props_test = cookies[test_cookie.name]?.properties === 'Max-Age=0';
        return test_cookie_test && delete_cookie_value_test && delete_cookie_props_test;
    });

    // Verify the custom HTTP status code and message support
    await test_response_custom_status();

    // Verify the behavior of the .header() and .cookie() methods
    await test_response_headers_behavior();

    // Verify .on() aka. Response events
    await test_response_events();

    // Verify .send()
    assert_log(group, candidate + '.send()', () => body1 === test_html_placeholder);

    // Verify .send() with custom content-length header specified body
    await test_response_custom_content_length();

    // Verify .send() with no body and custom content-length
    await test_response_send_no_body();

    // Test Response.sse (Server-Sent Events) support
    await test_response_sse();

    // Test Response.stream()
    await test_response_stream_method();

    // Test Response.write() for chunked writing
    await test_response_chunked_write();

    // Test Response.write() for piped writes
    await test_response_piped_write();

    // Test Response.LiveFile object
    await test_livefile_object();

    // Verify .on() aka. Response events
    assert_log(
        group,
        candidate + '.on()',
        () =>
            events_emitted.length == 3 &&
            events_emitted[0] === 'prepare' &&
            events_emitted[1] === 'finish' &&
            events_emitted[2] === 'close' &&
            response1.headers.get('hook-called') === 'prepare'
    );

    log(group, `Finished Testing ${candidate} In ${Date.now() - start_time}ms\n`);
}

module.exports = {
    test_response_object: test_response_object,
};
