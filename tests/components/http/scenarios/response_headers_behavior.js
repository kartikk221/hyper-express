const { assert_log, async_wait } = require('../../../scripts/operators.js');
const { HyperExpress, fetch, server, AbortController } = require('../../../configuration.js');
const router = new HyperExpress.Router();
const endpoint = '/tests/response';
const scenario_endpoint = '/headers-behavior';
const endpoint_url = server.base + endpoint + scenario_endpoint;

const RAW_HEADERS = [
    {
        name: 'test',
        value: 'first', // This will be overwritten by the second header
    },
    {
        name: 'test',
        value: 'second', // This will be overwritten by the third header
    },
    {
        name: 'test',
        value: 'third', // This will be the served header for the the "test" header
    },
];

const RAW_COOKIES = [
    {
        name: 'test-cookie',
        value: 'test-value', // This will be overwritten by the second cookie
    },
    {
        name: 'test-cookie',
        value: 'test-value-2', // This will be served to the client
    },
    {
        name: 'test-cookie-3',
        value: 'test-value-3', // This will be served to the client
    },
];

// Create Backend HTTP Route
router.get(scenario_endpoint, (request, response) => {
    // Serve the headers
    RAW_HEADERS.forEach((header) => response.header(header.name, header.value));

    // Serve the cookies
    RAW_COOKIES.forEach((cookie) => response.cookie(cookie.name, cookie.value, 1000 * 60 * 60 * 24 * 7));

    // Send response
    response.send();
});

// Bind router to webserver
const { TEST_SERVER } = require('../../Server.js');
TEST_SERVER.use(endpoint, router);

async function test_response_headers_behavior() {
    const group = 'RESPONSE';
    const candidate = 'HyperExpress.Response.header()';

    // Parse the last written header as the expected value
    const EXPECTED_HEADERS = {};
    RAW_HEADERS.forEach((header) => (EXPECTED_HEADERS[header.name] = header.value));

    // Parse the last written cookie as the expected value
    const EXPECTED_COOKIES = {};
    RAW_COOKIES.forEach((cookie) => (EXPECTED_COOKIES[cookie.name] = cookie.value));

    // Send a fetch request to retrieve headers
    const response = await fetch(endpoint_url);
    const received_headers = response.headers.raw();

    // Assert that the headers were served correctly
    assert_log(group, `${candidate} - Single/Multiple Header Values Behavior Test`, () => {
        let valid = true;
        Object.keys(EXPECTED_HEADERS).forEach((name) => {
            let expected = EXPECTED_HEADERS[name];
            let received = received_headers[name];

            // Assert that the received header is an array
            valid = Array.isArray(expected)
                ? JSON.stringify(expected) === JSON.stringify(received)
                : expected === received[0];
        });
        return valid;
    });

    // Assert that the cookies were served correctly
    assert_log(group, `${candidate} - Single/Multiple Cookie Values Behavior Test`, () => {
        const received_cookies = {};
        received_headers['set-cookie'].forEach((cookie) => {
            const [name, value] = cookie.split('; ')[0].split('=');
            received_cookies[name] = value;
        });

        let valid = true;
        Object.keys(EXPECTED_COOKIES).forEach((name) => {
            const expected_value = EXPECTED_COOKIES[name];
            const received_value = received_cookies[name];
            valid = expected_value === received_value;
        });
        return valid;
    });
}

module.exports = {
    test_response_headers_behavior,
};
