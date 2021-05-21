const root = '../../../';
const { log, assert_log, random_string, async_for_each } = require(root +
    'scripts/operators.js');
const { fetch, server } = require(root + 'scripts/configuration.js');
const { webserver } = require(root + 'setup/webserver.js');
const { session_store } = require(root + '/setup/session_engine.js');
const endpoint = '/tests/request/session/brute';
const endpoint_url = server.base + endpoint;

// Create Backend HTTP Route
webserver.post(endpoint, async (request, response) => {
    await request.session.start();
    return response.json({
        session_id: request.session.id,
        store: session_store.data,
    });
});

async function test_brute_scenario() {
    // User Specified ID Brute Vulnerability Test
    let group = 'SESSION';
    let candidate = 'HyperExpress.Request.session';
    let last_session_id = '';
    log(group, `Testing ${candidate} - Self-Specified/Brute Session ID Test`);
    session_store.empty();
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
            () =>
                Object.keys(body.store).length === 0 &&
                last_session_id !== body.session_id
        );
        last_session_id = body.session_id;
        next();
    });

    log(
        group,
        `Finished Testing ${candidate} - Self-Specified/Brute Session ID Test\n`
    );
}

module.exports = {
    test_brute_scenario: test_brute_scenario,
};
