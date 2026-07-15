const { assert_log } = require('../../../scripts/operators.js');
const { HyperExpress, fetch, server } = require('../../../configuration.js');
const router = new HyperExpress.Router();
const endpoint = '/tests/request';
const scenario_endpoint = '/middleware-double-iteration';
const endpoint_url = server.base + endpoint + scenario_endpoint;
let first_completion;
let duplicate_completion;

// This middleware should only run on this endpoint
const double_iteration_middleware = async (request, response, next) => {
    first_completion = next();
    duplicate_completion = next();
};

const delay_middleware = (request, response, next) => setTimeout(next, 10);

// Create Backend HTTP Route
router.get(
    scenario_endpoint,
    double_iteration_middleware,
    [delay_middleware], // This weird parameter pattern is to test Express.js compatibility pattern for providing multiple middlewares through parameters/arrays
    {
        max_body_length: 1024 * 1024 * 10,
        middlewares: [delay_middleware],
    },
    async (request, response) => {
        return response.send('Good');
    }
);

// Bind router to webserver
const { TEST_SERVER } = require('../../Server.js');
TEST_SERVER.use(endpoint, router);

async function test_middleware_double_iteration() {
    const group = 'REQUEST';
    const candidate = 'HyperExpress.Request';

    // Perform fetch request
    const response = await fetch(endpoint_url);
    const body = await response.text();

    // The first completion advances; repeated next() calls and later promise settlement are ignored.
    assert_log(
        group,
        `${candidate} Middleware Single Completion Guard`,
        () =>
            response.status === 200 &&
            body === 'Good' &&
            first_completion === true &&
            duplicate_completion === false
    );
}

module.exports = {
    test_middleware_double_iteration,
};
