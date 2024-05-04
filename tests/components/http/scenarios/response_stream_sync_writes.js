const { assert_log } = require('../../../scripts/operators.js');
const { HyperExpress, fetch, server } = require('../../../configuration.js');
const router = new HyperExpress.Router();
const endpoint = '/tests/response';
const scenario_endpoint = '/sync-writes';
const endpoint_url = server.base + endpoint + scenario_endpoint;

const expected_parts = ['1', '2', '3', 'done'];

// Create Backend HTTP Route
router.get(scenario_endpoint, (request, response) => {
    // Write the first 3 parts with response.write()
    response.write(expected_parts[0]);
    response.write(expected_parts[1]);
    response.write(expected_parts[2]);

    // Send the last part with response.send()
    response.send(expected_parts[3]);
});

// Bind router to webserver
const { TEST_SERVER } = require('../../Server.js');
TEST_SERVER.use(endpoint, router);

async function test_response_sync_writes() {
    const group = 'RESPONSE';
    const candidate = 'HyperExpress.Response.write()';

    // Make a fetch request to the endpoint
    const response = await fetch(endpoint_url);

    // Get the received body from the response
    const expected_body = expected_parts.join('');
    const received_body = await response.text();

    // Ensure that the received body is the same as the expected body
    assert_log(group, `${candidate} Sync Writes Test`, () => expected_body === received_body);
}

module.exports = {
    test_response_sync_writes,
};
