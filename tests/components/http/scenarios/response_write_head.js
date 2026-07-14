const { assert_log } = require('../../../scripts/operators.js');
const { HyperExpress, fetch, server } = require('../../../configuration.js');
const router = new HyperExpress.Router();
const endpoint = '/tests/response';
const scenario_endpoint = '/write-head';
const endpoint_url = server.base + endpoint + scenario_endpoint;
const object_endpoint = scenario_endpoint + '-object';
const object_endpoint_url = server.base + endpoint + object_endpoint;

// Create Backend HTTP Route to test Node.js ServerResponse.writeHead() compatibility
router.get(scenario_endpoint, (request, response) => {
    response
        .writeHead(209, 'Custom Status', ['x-array-header', 'array-value', 'x-second-header', 'second-value'])
        .send('writeHead');
});
router.get(object_endpoint, (request, response) => {
    response.writeHead(210, {
        'x-object-header': 'object-value',
    });
    response.send('writeHead object');
});

// Bind router to webserver
const { TEST_SERVER } = require('../../Server.js');
TEST_SERVER.use(endpoint, router);

async function test_response_write_head() {
    const response = await fetch(endpoint_url);
    const body = await response.text();
    const object_response = await fetch(object_endpoint_url);
    const object_body = await object_response.text();

    assert_log(
        'RESPONSE',
        'HyperExpress.Response.writeHead() Compatibility Test',
        () =>
            response.status === 209 &&
            response.statusText === 'Custom Status' &&
            response.headers.get('x-array-header') === 'array-value' &&
            response.headers.get('x-second-header') === 'second-value' &&
            body === 'writeHead' &&
            object_response.status === 210 &&
            object_response.headers.get('x-object-header') === 'object-value' &&
            object_body === 'writeHead object'
    );
}

module.exports = {
    test_response_write_head,
};
