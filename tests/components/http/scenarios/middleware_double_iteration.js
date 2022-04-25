const { assert_log } = require('../../../scripts/operators.js');
const { HyperExpress, fetch, server } = require('../../../configuration.js');
const router = new HyperExpress.Router();
const endpoint = '/tests/request';
const scenario_endpoint = '/middleware-double-iteration';
const endpoint_url = server.base + endpoint + scenario_endpoint;

// This middleware should only run on this endpoint
const double_iteration_middleware = async (request, response, next) => {
    // Bind an artificial error handler so we don't treat this as uncaught error
    request.expected_error = () => response.status(501).send('DOUBLE_ITERATION_VIOLATION');

    // Since this is an async callback, calling next and the async callback resolving will trigger a double iteration violation
    next();
};

const delay_middleware = (request, response, next) => setTimeout(next, 10);

// Create Backend HTTP Route
router.get(scenario_endpoint, [double_iteration_middleware, delay_middleware], async (request, response) => {
    return response.send('Good');
});

// Bind router to webserver
const { TEST_SERVER } = require('../../Server.js');
TEST_SERVER.use(endpoint, router);

async function test_middleware_double_iteration() {
    const group = 'REQUEST';
    const candidate = 'HyperExpress.Request';

    // Perform fetch request
    const response = await fetch(endpoint_url);
    const body = await response.text();

    // Test to see error handler was properly called on expected middleware error
    assert_log(
        group,
        `${candidate} Middleware Double Iteration Violation`,
        () => response.status === 501 && body === 'DOUBLE_ITERATION_VIOLATION'
    );
}

module.exports = {
    test_middleware_double_iteration,
};
