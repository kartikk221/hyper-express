const { assert_log } = require('../../../scripts/operators.js');
const { HyperExpress, fetch, server } = require('../../../configuration.js');
const router = new HyperExpress.Router();
const endpoint = '/tests/response';
const scenario_endpoint = '/send-status';
const endpoint_url = server.base + endpoint + scenario_endpoint;

// Create Backend HTTP Route
router.post(scenario_endpoint, async (request, response) => {
    const { status } = await request.json();
    response.sendStatus(status);
});

// Bind router to webserver
const { TEST_SERVER } = require('../../Server.js');
TEST_SERVER.use(endpoint, router);

async function test_response_send_status() {
    const group = 'RESPONSE';
    const candidate = 'HyperExpress.Response.statusCode';

    [
        {
            status: 200,
        },
        {
            status: 609,
        },
    ].map(async ({ status }) => {
        // Make a request to the server with a status code
        const response = await fetch(endpoint_url, {
            method: 'POST',
            body: JSON.stringify({
                status,
            }),
        });

        // Validate the status code on the response
        assert_log(
            group,
            `${candidate} Custom Status Code & Response Test - "HTTP ${status}"`,
            () => response.status === status
        );
    });
}

module.exports = {
    test_response_send_status,
};
