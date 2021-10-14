const { log, assert_log, random_string, async_for_each } = require('../../../scripts/operators.js');
const { fetch, server } = require('../../../configuration.js');
const { TEST_SERVER } = require('../../../components/Server.js');
const { TEST_STORE } = require('../test_engine.js');
const { path } = require('../configuration.json');
const endpoint = `${path}/scenarios/brute`;
const endpoint_url = server.base + endpoint;

// Create Backend HTTP Route
TEST_SERVER.post(endpoint, async (request, response) => {
    await request.session.start();
    return response.json({
        session_id: request.session.id,
        store: TEST_STORE.data,
    });
});

async function test_brute_scenario() {
    // User Specified ID Brute Vulnerability Test
    let group = 'MIDDLEWARE';
    let candidate = 'Middleware.SessionEngine.Session';
    let last_session_id = '';
    log(group, `Testing ${candidate} - Self-Specified/Brute Session ID Test`);
    TEST_STORE.empty();
    await async_for_each([0, 1, 2, 3, 4], async (value, next) => {
        let response = await fetch(endpoint_url, {
            method: 'POST',
            headers: {
                cookie: 'test_sess=' + random_string(30), // Random Session IDs
            },
        });

        let body = await response.json();
        assert_log(
            group,
            candidate + ' Brute-Force ID Vulnerability Prevention @ ' + value,
            () => Object.keys(body.store).length === 0 && last_session_id !== body.session_id
        );

        last_session_id = body.session_id;
        next();
    });

    log(group, `Finished Testing ${candidate} - Self-Specified/Brute Session ID Test\n`);
}

module.exports = {
    test_brute_scenario,
};
