const root = '../../../';
const { log, assert_log, random_string, async_for_each } = require(root +
    'scripts/operators.js');
const { fetch, server } = require(root + 'scripts/configuration.js');
const { webserver } = require(root + 'setup/webserver.js');
const { session_store, session_engine } = require(root +
    '/setup/session_engine.js');
const endpoint = '/tests/request/session/duration';
const endpoint_url = server.base + endpoint;

// Create Backend HTTP Route
webserver.post(endpoint, async (request, response) => {
    await session_engine.cleanup(); // Purposely trigger cleanup before every request to simulate ideal session cleanup
    await request.session.start();
    let duration = parseInt(await request.text());

    if (duration > 0) request.session.set_duration(duration);

    return response.json({
        session_id: request.session.id,
        store: session_store.data,
    });
});

async function test_duration_scenario() {
    let group = 'SESSION';
    let candidate = 'HyperExpress.Request.session';
    let cookies = [];

    log(group, 'Testing ' + candidate + ' - Custom Duration/Cleanup Test');
    session_store.empty();
    await async_for_each([1, 2, 3], async (value, next) => {
        let response = await fetch(endpoint_url, {
            method: 'POST',
            headers: {
                cookie: cookies.join('; '),
            },
            body: value < 3 ? '500' : '', // Set Custom Duration On First 2 Requests
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

        assert_log(
            group,
            candidate + ' Custom Duration/Cleanup @ Iteration ' + value,
            () => {
                if (value == 1 || value == 3)
                    return Object.keys(body.store).length == 0;

                let store_test = Object.keys(body.store).length == 1;
                let sess_obj_test =
                    body.store?.[body.session_id]?.data !== undefined;

                return store_test && sess_obj_test;
            }
        );

        // Wait 1.5 Seconds for session to expire with custom duration before 3rd request
        let delay = value == 2 ? 750 : 0;
        if (delay > 0)
            log(
                group,
                `Waiting ${delay}ms to simulate custom duration expiry...`
            );

        setTimeout((n) => n(), delay, next);
    });

    log(
        group,
        'Finished Testing ' + candidate + ' - Custom Duration/Cleanup Test\n'
    );
}

module.exports = {
    test_duration_scenario: test_duration_scenario,
};
