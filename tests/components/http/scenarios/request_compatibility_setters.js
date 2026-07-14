const { assert_log } = require('../../../scripts/operators.js');
const { HyperExpress, fetch, server } = require('../../../configuration.js');
const router = new HyperExpress.Router();
const endpoint = '/tests/request';
const scenario_endpoint = '/compatibility-setters';
const endpoint_url = server.base + endpoint + scenario_endpoint;

// Create Backend HTTP Route to test mutable ExpressJS compatibility properties
router.get(scenario_endpoint, (request, response) => {
    // Initialize the original parsed query to verify URL changes invalidate it
    request.query_parameters;
    request.originalUrl = '/rewritten/path?original=value';
    const rewritten = {
        url: request.url,
        path: request.path,
        query: request.path_query,
        query_parameters: request.query_parameters,
    };

    request.query = {
        normalized: 'value',
    };

    response.json({
        rewritten,
        query: request.query,
        query_parameters: request.query_parameters,
    });
});

// Bind router to webserver
const { TEST_SERVER } = require('../../Server.js');
TEST_SERVER.use(endpoint, router);

async function test_request_compatibility_setters() {
    const response = await fetch(endpoint_url);
    const body = await response.json();

    assert_log(
        'REQUEST',
        'HyperExpress.Request ExpressJS Compatibility Setters Test',
        () =>
            body.rewritten.url === '/rewritten/path?original=value' &&
            body.rewritten.path === '/rewritten/path' &&
            body.rewritten.query === 'original=value' &&
            body.rewritten.query_parameters.original === 'value' &&
            body.query.normalized === 'value' &&
            body.query_parameters.normalized === 'value'
    );
}

module.exports = {
    test_request_compatibility_setters,
};
