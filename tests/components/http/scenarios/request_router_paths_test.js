const crypto = require('crypto');
const { assert_log } = require('../../../scripts/operators.js');
const { HyperExpress, fetch, server } = require('../../../configuration.js');
const router = new HyperExpress.Router();
const endpoint = '/tests/request';
const scenario_endpoint = '/cached-paths';
const endpoint_url = server.base + endpoint + scenario_endpoint;

// Create Backend HTTP Route to echo the path of the request
router.get(scenario_endpoint, (req, res) => res.send(req.path));
router.get(scenario_endpoint + '/:random', (req, res) => res.send(req.path));

// Bind router to webserver
const { TEST_SERVER } = require('../../Server.js');
TEST_SERVER.use(endpoint, router);

async function test_request_router_paths_test() {
    const group = 'REQUEST';
    const candidate = 'HyperExpress.Request.path';

    // Test the candidates to ensure that the path is being cached properly
    const _candidates = [];
    const candidates = [
        endpoint_url,
        `${endpoint_url}/${crypto.randomUUID()}`,
        `${endpoint_url}/${crypto.randomUUID()}`,
    ];
    for (const candidate of candidates) {
        const response = await fetch(candidate);
        const _candidate = await response.text();
        _candidates.push(_candidate);
    }

    // Assert that the candidates match
    assert_log(
        group,
        `${candidate} Cached Router Paths Test`,
        () => _candidates.join(',') === candidates.map((url) => url.replace(server.base, '')).join(',')
    );
}

module.exports = {
    test_request_router_paths_test,
};
