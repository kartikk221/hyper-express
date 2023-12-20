const { assert_log } = require('../../../scripts/operators.js');
const { HyperExpress, fetch, server } = require('../../../configuration.js');
const endpoint = '/tests/router';
const scenario_endpoint = '/chainable-routes';
const endpoint_url = server.base + endpoint + scenario_endpoint;

const routes = [
    {
        method: 'GET',
        payload: Math.random().toString(),
    },
    {
        method: 'POST',
        payload: Math.random().toString(),
    },
    {
        method: 'PUT',
        payload: Math.random().toString(),
    },
    {
        method: 'DELETE',
        payload: Math.random().toString(),
    },
];

const router = new HyperExpress.Router();

let chainable = router.route(scenario_endpoint);
for (const route of routes) {
    // This will test the chainability of the router
    // Simulates Router.route().get().post().put().delete()
    chainable = chainable[route.method.toLowerCase()]((_, response) => {
        response.send(route.payload);
    });
}

// Bind router to webserver
const { TEST_SERVER } = require('../../Server.js');
TEST_SERVER.use(endpoint, router);

async function test_router_chainable_route() {
    const group = 'REQUEST';
    const candidate = 'HyperExpress.Router.route()';

    // Perform fetch requests for each method
    for (const route of routes) {
        const response = await fetch(endpoint_url, {
            method: route.method,
        });

        // Assert that the payload matches payload sent
        const _payload = await response.text();
        assert_log(group, `${candidate} Chained HTTP ${route.method} Route`, () => _payload === route.payload);
    }
}

module.exports = {
    test_router_chainable_route,
};
