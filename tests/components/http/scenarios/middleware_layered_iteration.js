const { assert_log } = require('../../../scripts/operators.js');
const { HyperExpress, fetch, server } = require('../../../configuration.js');
const crypto = require('crypto');
const router = new HyperExpress.Router();
const endpoint = '/tests/request';
const scenario_endpoint = '/middleware-layered-iteration';
const endpoint_url = server.base + endpoint + scenario_endpoint;

// Create Backend HTTP Route
router.post(
    scenario_endpoint,
    async (req, res, next) => {
        req.body = await req.json();
    },
    (req, res, next) => {
        res.locals.data = req.body;
        next();
    },
    (req, res) => {
        res.status(200).json(res.locals.data);
    }
);

// Bind router to webserver
const { TEST_SERVER } = require('../../Server.js');
TEST_SERVER.use(endpoint, router);

async function test_middleware_layered_iterations(iterations = 10) {
    const group = 'REQUEST';
    const candidate = 'HyperExpress.Request';
    for (let iteration = 0; iteration < iterations; iteration++) {
        // Generate a random payload
        const payload = {};
        for (let i = 0; i < 10; i++) {
            payload[crypto.randomUUID()] = crypto.randomUUID();
        }

        // Perform fetch request
        const response = await fetch(endpoint_url, {
            method: 'POST',
            body: JSON.stringify(payload),
        });
        const body = await response.json();

        // Test to see error handler was properly called on expected middleware error
        assert_log(
            group,
            `${candidate} Middleware Layered Iterations Test #${iteration + 1}`,
            () => JSON.stringify(payload) === JSON.stringify(body)
        );
    }
}

module.exports = {
    test_middleware_layered_iterations,
};
