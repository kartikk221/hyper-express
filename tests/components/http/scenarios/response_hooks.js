const { assert_log, async_wait } = require('../../../scripts/operators.js');
const { HyperExpress, fetch, server, AbortController } = require('../../../configuration.js');
const router = new HyperExpress.Router();
const endpoint = '/tests/response';
const scenario_endpoint = '/hooks';
const endpoint_url = server.base + endpoint + scenario_endpoint;
const response_delay = 100;

const hook_emissions = {};
function increment_hook(type) {
    hook_emissions[type] = hook_emissions[type] ? hook_emissions[type] + 1 : 1;
}

// Create Backend HTTP Route
router.get(scenario_endpoint, (request, response) => {
    // Bind all of the hooks to the response
    ['abort', 'send', 'complete', 'disconnect'].forEach((type) => response.hook(type, () => increment_hook(type)));

    // Send response after some delay to allow for client to prematurely abort
    setTimeout(() => (!response.completed ? response.send() : null), response_delay);
});

// Bind router to webserver
const { TEST_SERVER } = require('../../Server.js');
TEST_SERVER.use(endpoint, router);

async function test_response_hooks() {
    const group = 'RESPONSE';
    const candidate = 'HyperExpress.Response.hook()';

    // Send a normal request to trigger the appropriate hooks
    await fetch(endpoint_url);

    // Assert that only the appropriate hooks were called
    assert_log(
        group,
        `${candidate} - Normal Request Hooks Test`,
        () => hook_emissions['send'] === 1 && hook_emissions['complete'] === 1 && hook_emissions['disconnect'] === 1
    );

    // Send and prematurely abort a request to trigger the appropriate hooks
    const controller = new AbortController();
    setTimeout(() => controller.abort(), response_delay / 3);
    try {
        await fetch(endpoint_url, {
            signal: controller.signal,
        });
    } catch (error) {
        // Supress the error as we expect an abort
        // Wait a little bit for the hook emissions to be updated
        await async_wait(response_delay / 3);
    }

    // Assert that only the appropriate hooks were called
    assert_log(
        group,
        `${candidate} - Premature Aborted Request Hooks Test`,
        () =>
            hook_emissions['send'] === 1 &&
            hook_emissions['complete'] === 1 &&
            hook_emissions['disconnect'] === 2 &&
            hook_emissions['abort'] === 1
    );
}

module.exports = {
    test_response_hooks,
};
