const root = '../../../';
const { log, assert_log, random_string, async_for_each } = require(root +
    'scripts/operators.js');
const { fetch, server } = require(root + 'scripts/configuration.js');
const { webserver } = require(root + 'setup/webserver.js');
const { session_store } = require(root + '/setup/session_engine.js');
const endpoint = '/tests/request/session/roll';
const endpoint_url = server.base + endpoint;

// Create Backend HTTP Route
webserver.post(endpoint, async (request, response) => {
    await request.session.start();
    if (request.session.get('some_data') == undefined) {
        request.session.set('some_data', random_string(10));
    } else {
        // Performs a delete and migrate to a new roll id
        await request.session.roll();
    }

    return response.json({
        session_id: request.session.id,
        session_data: request.session.get_all(),
        store: session_store.data,
    });
});

async function test_roll_scenario() {
    let group = 'SESSION';
    let candidate = 'HyperExpress.Request.session';
    let cookies = [];
    let last_rolled_id = '';
    log(group, 'Testing ' + candidate + ' - Roll Test');

    session_store.empty();
    await async_for_each([0, 0, 1, 0], async (value, next) => {
        let response = await fetch(endpoint_url, {
            method: 'POST',
            headers: {
                cookie: cookies.join('; '),
            },
        });
        let headers = response.headers.raw();
        let body = await response.json();

        // Send session cookie with future requests
        let current_session_id;
        if (Array.isArray(headers['set-cookie'])) {
            cookies = []; // Reset cookies for new session id
            headers['set-cookie'].forEach((chunk) => {
                chunk = chunk.split('; ')[0].split('=');
                let name = chunk[0];
                let value = chunk[1];
                let header = `${name}=${value}`;
                if (name === 'test_sess') current_session_id = value;
                cookies.push(header);
            });
        }

        assert_log(
            group,
            candidate + ' Session Roll @ Iterative Scenario ' + value,
            () => {
                // Store will always be empty due to lazy persistance and .roll() destroying session during request
                let store_test =
                    Object.keys(body.store).length === Math.floor(value);
                let id_test =
                    value < 1 ? current_session_id !== last_rolled_id : true;
                last_rolled_id = current_session_id;
                return store_test && id_test;
            }
        );

        next();
    });

    log(group, 'Finished Testing ' + candidate + ' - Roll Test\n');
}

module.exports = {
    test_roll_scenario: test_roll_scenario,
};
