const crypto = require('crypto');
const { assert_log } = require('../../../scripts/operators.js');
const { HyperExpress, fetch, server } = require('../../../configuration.js');
const router = new HyperExpress.Router();
const endpoint = '/tests/response';
const scenario_endpoint = '/custom-content-length';
const endpoint_url = server.base + endpoint + scenario_endpoint;

// Generate a random string payload
const payload = crypto.randomBytes(800).toString('hex');

// Create Backend HTTP Route
router.get(scenario_endpoint, (_, response) => {
    response.header('content-length', payload.length.toString()).send(payload);
});

// Bind router to webserver
const { TEST_SERVER } = require('../../Server.js');
TEST_SERVER.use(endpoint, router);

async function test_response_custom_content_length() {
    const group = 'RESPONSE';
    const candidate = 'HyperExpress.Response.send()';

    // Send a normal request to trigger the appropriate hooks
    const response = await fetch(endpoint_url);
    const received = await response.text();

    // Assert that the received headers all match the expected headers
    assert_log(group, `${candidate} Custom Content-Length Body Test`, () => received === payload);
}

module.exports = {
    test_response_custom_content_length,
};
