const { log, assert_log } = require('../../scripts/operators.js');
const { HyperExpress, fetch, server } = require('../../configuration.js');
const { TEST_SERVER } = require('../Server.js');
const endpoint_base = '/tests/router/echo-';

// Inject middleweare signature values into the requests through global, local and route specific middlewares
const middleware_signature = [Math.random(), Math.random(), Math.random()];
TEST_SERVER.use((request, response, next) => {
    // Initialize with first signature value
    request.middleware_signature = [middleware_signature[0]];
    next();
});

// Define all HTTP test method definitions
const route_definitions = {
    get: {
        method: 'GET',
        call: 'get',
    },
    post: {
        method: 'POST',
        call: 'post',
    },
    del: {
        method: 'DELETE',
        call: 'delete',
    },
    options: {
        method: 'OPTIONS',
        call: 'options',
    },
    patch: {
        method: 'PATCH',
        call: 'patch',
    },
    put: {
        method: 'PUT',
        call: 'put',
    },
    trace: {
        method: 'TRACE',
        call: 'trace',
    },
};

// Create dynamic routes for testing across all methods
const router = new HyperExpress.Router();
Object.keys(route_definitions).forEach((type) => {
    const { method, call } = route_definitions[type];
    router[call](
        endpoint_base + type,
        async (request, response) => {
            // Push the third signature value to the request
            request.middleware_signature.push(middleware_signature[2]);
        },
        (request, response) => {
            // Echo the methods, call and signature values to the client
            response.json({
                method: request.method,
                signature: request.middleware_signature,
            });
        }
    );
});
TEST_SERVER.use(router);

// Bind a second global middleware
TEST_SERVER.use((request, response, next) => {
    // Push the second signature value to the request
    request.middleware_signature.push(middleware_signature[1]);
    next();
});

async function test_router_object() {
    // Prepare Test Candidates
    log('ROUTER', 'Testing HyperExpress.Router Object...');
    const group = 'ROUTER';
    const candidate = 'HyperExpress.Router';
    const start_time = Date.now();

    // Test all route definitions to ensure consistency
    await Promise.all(
        Object.keys(route_definitions).map(async (type) => {
            // Retrieve the expected method and call values
            const { method, call } = route_definitions[type];

            // Make the fetch request
            const response = await fetch(server.base + endpoint_base + type, {
                method,
            });

            // Retrieve the response body
            const body = await response.json();

            // Assert the response body
            assert_log(group, `${candidate}.${call}() - HTTP ${method} Test`, () => {
                const call_check = typeof router[call] == 'function';
                const method_check = method === body.method;
                const signature_check = JSON.stringify(body.signature) === JSON.stringify(middleware_signature);
                const route_check = TEST_SERVER.routes[type][endpoint_base + type] !== undefined;
                return call_check && method_check && signature_check && route_check;
            });
        })
    );

    log(group, `Finished Testing ${candidate} In ${Date.now() - start_time}ms\n`);
}

module.exports = {
    test_router_object,
};
