const { log, assert_log, async_for_each } = require('../../../scripts/operators.js');
const { fetch, server } = require('../../../configuration.js');
const { TEST_SERVER } = require('../../../components/Server.js');
const { TEST_STORE, TEST_ENGINE } = require('../test_engine.js');
const { path } = require('../configuration.json');
const endpoint = `${path}/scenarios/duration`;
const endpoint_url = server.base + endpoint;

// Create Backend HTTP Route
TEST_SERVER.post(endpoint, async (request, response) => {
    await TEST_ENGINE.cleanup(); // Purposely trigger cleanup before every request to simulate ideal session cleanup
    await request.session.start();
    let body = await request.text();
    let duration = parseInt(body);

    if (duration > 0) request.session.set_duration(duration);

    return response.json({
        session_id: request.session.id,
        store: TEST_STORE.data,
    });
});

async function test_duration_scenario() {
    let group = 'MIDDLEWARE';
    let candidate = 'Middleware.SessionEngine.Session';
    let cookies = [];

    log(group, 'Testing ' + candidate + ' - Custom Duration/Cleanup Test');
    TEST_STORE.empty();
    await async_for_each([1, 2, 3], async (value, next) => {
        let response = await fetch(endpoint_url, {
            method: 'POST',
            headers: {
                cookie: cookies.join('; '),
            },
            body: value < 3 ? '250' : '', // Set Custom Duration On First 2 Requests
        });
        let headers = response.headers.raw();
        let body = await response.json();

        // Send session cookie with future requests
        if (Array.isArray(headers['set-cookie'])) {
            cookies = [];
            headers['set-cookie'].forEach((chunk) => {
                chunk = chunk.split('; ')[0].split('=');
                let name = chunk[0];
                let value = chunk[1];
                let header = `${name}=${value}`;
                cookies.push(header);
            });
        }

        assert_log(group, candidate + ' Custom Duration/Cleanup @ Iteration ' + value, () => {
            if (value == 1 || value == 3) return Object.keys(body.store).length == 0;

            let store_test = Object.keys(body.store).length == 1;
            let sess_obj_test = body.store?.[body.session_id]?.data !== undefined;

            return store_test && sess_obj_test;
        });

        // Wait 1.5 Seconds for session to expire with custom duration before 3rd request
        let delay = value == 2 ? 300 : 0;
        if (delay > 0) log(group, `Waiting ${delay}ms to simulate custom duration expiry...`);

        setTimeout((n) => n(), delay, next);
    });

    log(group, 'Finished Testing ' + candidate + ' - Custom Duration/Cleanup Test\n');
}

module.exports = {
    test_duration_scenario,
};
