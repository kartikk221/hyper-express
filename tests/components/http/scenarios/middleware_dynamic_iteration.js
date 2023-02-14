const { assert_log } = require('../../../scripts/operators.js');
const { HyperExpress, fetch, server } = require('../../../configuration.js');
const router = new HyperExpress.Router();
const endpoint = '/tests/request';
const scenario_endpoint = '/middleware-dynamic-iteration';
const endpoint_url = server.base + endpoint + scenario_endpoint;
const { TEST_SERVER } = require('../../Server.js');

// Bind a global middleware which is a wildcard for a path that has no existing routes
// This middleware will apply to the not found handler
const global_wildcard_middleware = (request, response, next) => {
    // Check if dynamic middleware is enabled
    if (request.headers['x-dynamic-middleware'] === 'true') {
        return response.send('GLOBAL_WILDCARD');
    }

    // Call next middleware
    next();
};

TEST_SERVER.use('/global-wildcard/', global_wildcard_middleware);

// Bind a global middleware which is a wildcard for a path that is on an existing route path
const route_specific_dynamic_middleware = (request, response, next) => {
    if (request.headers['x-dynamic-middleware'] === 'true') {
        response.send('ROUTE_SPECIFIC_WILDCARD');
    }

    // Call next middleware
    next();
};
router.use('/middleware-dynamic-iteration/middleware', route_specific_dynamic_middleware);

// Bind a middleware which will try target an incomplete part of the path and should not be executed
const incomplete_path_middleware = (request, response, next) => {
    // This should never be executed
    console.log('INCOMPLETE_PATH_MIDDLEWARE');
    return response.send('INCOMPLETE_PATH_MIDDLEWARE');
};
router.use('/middleware-dy', incomplete_path_middleware); // Notice how "/middleware-dy" should not match "/middleware-dynamic-iteration/..."

// Create Backend HTTP Route
router.get(scenario_endpoint + '/*', async (request, response) => {
    response.send('ROUTE_HANDLER');
});

// Bind router to webserver
TEST_SERVER.use(endpoint, router);

async function test_middleware_dynamic_iteration() {
    const group = 'REQUEST';
    const candidate = 'HyperExpress.Request';

    // Make a fetch request to a random path that will not be found
    const not_found_response = await fetch(server.base + '/not-found/' + Math.random(), {
        headers: {
            'x-dynamic-middleware': 'true',
        },
    });

    // Assert that we received a 404 response
    assert_log(group, `${candidate} Unhandled Middleware Iteration`, () => not_found_response.status === 404);

    // Make a fetch request to a global not found path on the global wildcard pattern
    const global_response = await fetch(server.base + '/global-wildcard/' + Math.random(), {
        headers: {
            'x-dynamic-middleware': 'true',
        },
    });
    const global_text = await global_response.text();

    // Assert that the global wildcard middleware was executed
    assert_log(group, `${candidate} Global Dynamic Middleware Iteration`, () => global_text === 'GLOBAL_WILDCARD');

    // Make a fetch request to a path that has a route with a wildcard middleware
    const route_specific_response = await fetch(endpoint_url + '/middleware/' + Math.random(), {
        headers: {
            'x-dynamic-middleware': 'true',
        },
    });
    const route_specific_text = await route_specific_response.text();

    // Assert that the route specific wildcard middleware was executed
    assert_log(
        group,
        `${candidate} Route-Specific Dynamic Middleware Iteration`,
        () => route_specific_text === 'ROUTE_SPECIFIC_WILDCARD'
    );

    // Make a fetch request to a path that has an exact route match
    const route_handler_response = await fetch(endpoint_url + '/test/random/' + Math.random(), {
        headers: {
            'x-dynamic-middleware': 'true',
        },
    });
    const route_handler_text = await route_handler_response.text();

    // Assert that the route handler was executed
    assert_log(
        group,
        `${candidate} Route-Specific Dynamic Middleware Pattern Matching Check`,
        () => route_handler_text === 'ROUTE_HANDLER'
    );
}

module.exports = {
    test_middleware_dynamic_iteration,
};
