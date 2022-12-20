const crypto = require('crypto');
const { assert_log } = require('../../../scripts/operators.js');
const { HyperExpress, fetch, server } = require('../../../configuration.js');
const router = new HyperExpress.Router();
const endpoint = '/tests/response';
const scenario_endpoint = '/custom-status';
const endpoint_url = server.base + endpoint + scenario_endpoint;

// Create Backend HTTP Route
router.post(scenario_endpoint, async (request, response) => {
    const { status, message } = await request.json();
    response.statusCode = status;
    response.statusMessage = message;
    response.send();
});

// Bind router to webserver
const { TEST_SERVER } = require('../../Server.js');
TEST_SERVER.use(endpoint, router);

async function test_response_custom_status() {
    const group = 'RESPONSE';
    const candidate = 'HyperExpress.Response.statusCode';

    [
        {
            status: 200,
            message: 'Some Message',
        },
        {
            status: 609,
            message: 'User Moved to Another Server',
        },
        {
            status: Math.floor(Math.random() * 1000),
            message: crypto.randomUUID(),
        },
    ].map(async ({ status, message }) => {
        // Make a request to the server with a custom status code and message
        const response = await fetch(endpoint_url, {
            method: 'POST',
            body: JSON.stringify({
                status,
                message,
            }),
        });

        // Validate the status code and message on the response
        assert_log(
            group,
            `${candidate} Custom Status Code & Response Test - "HTTP ${status} ${message}"`,
            () => response.status === status && response.statusText === message
        );
    });
}

module.exports = {
    test_response_custom_status,
};
