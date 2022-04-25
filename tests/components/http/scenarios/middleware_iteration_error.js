const { assert_log } = require('../../../scripts/operators.js');
const { HyperExpress, fetch, server } = require('../../../configuration.js');
const router = new HyperExpress.Router();
const endpoint = '/tests/request';
const scenario_endpoint = '/middleware-error';
const endpoint_url = server.base + endpoint + scenario_endpoint;

const middleware = (request, response, next) => {
    // Bind an artificial error handler so we don't treat this as uncaught error
    request.expected_error = () => response.status(501).send('MIDDLEWARE_ERROR');

    // Assume some problem occured, so we pass an error to next
    next(new Error('EXPECTED_ERROR'));
};

// Create Backend HTTP Route
router.get(scenario_endpoint, middleware, async (request, response) => {
    return response.send('Good');
});

// Bind router to webserver
const { TEST_SERVER } = require('../../Server.js');
TEST_SERVER.use(endpoint, router);

async function test_middleware_iteration_error() {
    const group = 'REQUEST';
    const candidate = 'HyperExpress.Request';

    // Perform fetch request
    const response = await fetch(endpoint_url);
    const body = await response.text();

    // Test to see error handler was properly called on expected middleware error
    assert_log(
        group,
        `${candidate} Middleware Thrown Iteration Error Handler`,
        () => response.status === 501 && body === 'MIDDLEWARE_ERROR'
    );
}

module.exports = {
    test_middleware_iteration_error,
};
