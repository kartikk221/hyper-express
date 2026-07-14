const { assert_log } = require('../../../scripts/operators.js');
const { HyperExpress, fetch, server } = require('../../../configuration.js');
const router = new HyperExpress.Router();
const endpoint = '/tests/response';
const scenario_endpoint = '/send-no-body';
const endpoint_url = server.base + endpoint + scenario_endpoint;
const forbidden_statuses = [204, 304];

// Create Backend HTTP Route
const response_headers = [
    ['Content-Type', 'application/json'],
    ['Content-Length', Math.floor(Math.random() * 1e5).toString()],
    ['Last-Modified', new Date().toUTCString()],
    ['ETag', 'W/"' + Math.floor(Math.random() * 1e5).toString() + '"'],
];

router.head(scenario_endpoint, (_, response) => {
    // Write the response headers
    response_headers.forEach(([key, value]) => response.header(key, value));

    // Should send without body under the hood with the custom content-length
    return response.vary('Accept-Encoding').send();
});

router.head(scenario_endpoint + '/payload', (_, response) => response.send('head payload'));

router.get(scenario_endpoint + '/:status', (request, response) => {
    return response
        .status(Number(request.path_parameters.status))
        .header('content-length', '100')
        .send('forbidden payload');
});

// Bind router to webserver
const { TEST_SERVER } = require('../../Server.js');
TEST_SERVER.use(endpoint, router);

async function test_response_send_no_body() {
    const group = 'RESPONSE';
    const candidate = 'HyperExpress.Response.send()';

    // Send a normal request to trigger the appropriate hooks
    const response = await fetch(endpoint_url, {
        method: 'HEAD',
    });

    // Assert that the received headers all match the expected headers
    assert_log(group, `${candidate} Custom Content-Length Without Body Test`, () => {
        let verdict = true;
        response_headers.forEach(([key, value]) => {
            if (response.headers.get(key) !== value) verdict = false;
        });
        return verdict;
    });

    // HEAD responses should report the payload length without sending payload bytes
    const head_response = await fetch(endpoint_url + '/payload', { method: 'HEAD' });
    assert_log(
        group,
        `${candidate} HEAD Payload Suppression Test`,
        () => head_response.headers.get('content-length') === Buffer.byteLength('head payload').toString()
    );

    // Status codes which forbid payloads must not send body bytes or an invalid content-length
    for (const status of forbidden_statuses) {
        const status_response = await fetch(endpoint_url + '/' + status);
        const status_body = await status_response.text();
        assert_log(
            group,
            `${candidate} ${status} Payload Suppression Test`,
            () =>
                status_body.length === 0 &&
                (status === 304 || status_response.headers.get('content-length') !== '100')
        );
    }
}

module.exports = {
    test_response_send_no_body,
};
