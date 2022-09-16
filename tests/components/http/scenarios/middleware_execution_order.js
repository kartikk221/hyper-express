const { assert_log } = require('../../../scripts/operators.js');
const { HyperExpress, fetch, server } = require('../../../configuration.js');
const router = new HyperExpress.Router();
const endpoint = '/tests/request';
const scenario_endpoint = '/middleware-execution-order';
const endpoint_url = server.base + endpoint + scenario_endpoint;
const { TEST_SERVER } = require('../../Server.js');

// Create a middleware to bind a middleware executions array to the request object
router.use(scenario_endpoint, (request, response, next) => {
    // Initialize an array to contain middleware_executions
    request.middleware_executions = [];
    next();
});

// Create a single depth middleware
router.use(scenario_endpoint + '/one', (request, response, next) => {
    request.middleware_executions.push('one');
    next();
});

// Create a two depth middleware that depends on the previous middleware
router.use(scenario_endpoint + '/one/two', (request, response, next) => {
    request.middleware_executions.push('one/two');
    next();
});

// Create a unique single depth middleware
router.use(scenario_endpoint + '/three', (request, response, next) => {
    request.middleware_executions.push('three');
    next();
});

// Create a catch-all middleware to ensure execution order
router.use(scenario_endpoint, (request, response, next) => {
    request.middleware_executions.push('catch-all');
    next();
});

// Bind routes for each middleware to test route assignment
router.get(scenario_endpoint + '/one', (request, response) => {
    request.middleware_executions.push('one/route');
    response.json(request.middleware_executions);
});

router.get(scenario_endpoint + '/one/two/*', (request, response) => {
    request.middleware_executions.push('one/two/route');
    response.json(request.middleware_executions);
});

// Bind router to webserver
TEST_SERVER.use(endpoint, router);

async function test_middleware_execution_order() {
    const group = 'REQUEST';
    const candidate = 'HyperExpress.Request';

    // Make a fetch request to just the scenario endpoint which should only trigger catch-all
    const catch_all_response = await fetch(endpoint_url);
    const catch_all_response_json = await catch_all_response.json();
    assert_log(
        group,
        `${candidate} Catch-All Middleware Execution Order`,
        () => ['catch-all', 'not-found'].join(',') === catch_all_response_json.join(',')
    );

    // Make a fetch request to the single depth middleware
    const single_depth_response = await fetch(endpoint_url + '/one');
    const single_depth_response_json = await single_depth_response.json();
    assert_log(
        group,
        `${candidate} Single Path Depth Middleware Execution Order`,
        () => ['one', 'catch-all', 'one/route'].join(',') === single_depth_response_json.join(',')
    );

    // Make a fetch request to the two depth middleware that depends on the previous middleware
    const two_depth_response = await fetch(endpoint_url + '/one/two/' + Math.random());
    const two_depth_response_json = await two_depth_response.json();
    assert_log(
        group,
        `${candidate} Double Path Depth-Dependent Middleware Execution Order`,
        () => ['one', 'one/two', 'catch-all', 'one/two/route'].join(',') === two_depth_response_json.join(',')
    );

    // Make a fetch request to the unique single depth middleware
    const unique_single_depth_response = await fetch(endpoint_url + '/three/' + Math.random());
    const unique_single_depth_response_json = await unique_single_depth_response.json();
    assert_log(
        group,
        `${candidate} Single Path Depth Unique Middleware Execution Order`,
        () => ['three', 'catch-all', 'not-found'].join(',') === unique_single_depth_response_json.join(',')
    );
}

module.exports = {
    test_middleware_execution_order,
};
