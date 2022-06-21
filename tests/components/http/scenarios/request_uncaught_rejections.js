const { assert_log } = require('../../../scripts/operators.js');
const { HyperExpress, fetch, server } = require('../../../configuration.js');
const router = new HyperExpress.Router();
const endpoint = '/tests/request';
const scenario_endpoint = '/uncaught-rejection';
const endpoint_url = server.base + endpoint + scenario_endpoint;

// Create Backend HTTP Route
router.post(scenario_endpoint, async (request, response) => {
    // Retrieve the desired scenario from the request body
    const { scenario } = await request.json();

    // Bind an expected error handler
    request.expected_error = (error) =>
        response.json({
            code: error.message,
        });

    // Trigger a specific error scenario
    switch (scenario) {
        case 1:
            // Manually throw a shallow error
            throw new Error('MANUAL_SHALLOW_ERROR');
        case 2:
            // Manually throw a deep error
            await new Promise((_, reject) => reject(new Error('MANUAL_DEEP_ERROR')));
        case 3:
            // Manually thrown non-Error object
            throw 'MANUAL_SHALLOW_NON_ERROR';
        case 4:
            // Manually thrown non-Error object
            await (async () => {
                throw 'MANUAL_DEEP_NON_ERROR';
            })();
        default:
            return response.json({
                code: 'SUCCESS',
            });
    }
});

// Bind router to webserver
const { TEST_SERVER } = require('../../Server.js');
TEST_SERVER.use(endpoint, router);

async function test_request_uncaught_rejections() {
    const group = 'REQUEST';
    const candidate = 'HyperExpress.Request';
    const promises = [
        [1, 'MANUAL_SHALLOW_ERROR'],
        [2, 'MANUAL_DEEP_ERROR'],
        [3, 'ERR_CAUGHT_NON_ERROR_TYPE: MANUAL_SHALLOW_NON_ERROR'],
        [4, 'ERR_CAUGHT_NON_ERROR_TYPE: MANUAL_DEEP_NON_ERROR'],
    ].map(
        ([scenario, expected_code]) =>
            new Promise(async (resolve) => {
                // Make the fetch request
                const response = await fetch(endpoint_url, {
                    method: 'POST',
                    body: JSON.stringify({
                        scenario,
                    }),
                });

                // Retrieve the received code from the server
                const { code } = await response.json();

                // Validate the hash uploaded on the server side with the expected hash from client side
                assert_log(
                    group,
                    `${candidate} Uncaught Rejections Test Scenario ${scenario} => ${code}`,
                    () => code === expected_code
                );

                // Release this promise
                resolve();
            })
    );

    await Promise.all(promises);
}

module.exports = {
    test_request_uncaught_rejections,
};
