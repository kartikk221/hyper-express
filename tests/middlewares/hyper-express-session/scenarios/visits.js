const { log, assert_log, random_string, async_for_each } = require('../../../scripts/operators.js');
const { fetch, server } = require('../../../configuration.js');
const { TEST_SERVER } = require('../../../components/Server.js');
const { TEST_STORE } = require('../test_engine.js');
const { path } = require('../configuration.json');
const endpoint = `${path}/scenarios/visits`;
const endpoint_url = server.base + endpoint;

// Create Backend HTTP Route
TEST_SERVER.post(endpoint, async (request, response) => {
    await request.session.start();
    let visits = request.session.get('visits');

    if (visits == undefined) {
        visits = 1;
    } else if (visits < 5) {
        visits++;
    } else {
        visits = undefined;
    }

    if (visits) {
        request.session.set('visits', visits);
    } else {
        await request.session.destroy();
    }

    return response.json({
        session_id: request.session.id,
        session: request.session.get(),
        store: TEST_STORE.data,
    });
});

async function test_visits_scenario() {
    // Test session persistence with visits test - VISITS ITERATOR TEST
    let group = 'MIDDLEWARE';
    let candidate = 'Middleware.SessionEngine.Session';
    let cookies = [];
    let session_expiry = 0;

    TEST_STORE.empty();
    log(group, 'Testing ' + candidate + ' - Visits Test');
    await async_for_each([1, 2, 3, 4, 5, 0, 1, 2, 3, 4], async (value, next) => {
        let response = await fetch(endpoint_url, {
            method: 'POST',
            headers: {
                cookie: cookies.join('; '),
            },
        });
        let headers = response.headers.raw();
        let body = await response.json();

        // Send session cookie with future requests
        if (Array.isArray(headers['set-cookie'])) {
            cookies = [];
            headers['set-cookie'].forEach((chunk) => {
                let chunks = chunk.split('; ')[0].split('=');
                let name = chunks[0];
                let value = chunks[1];
                let header = `${name}=${value}`;
                if (chunk.split('; ')[1].indexOf('0') > -1) return;
                cookies.push(header);
            });
        }

        // Perform Visits Check
        if (value == 0) {
            assert_log(group, `${candidate} VISITS_TEST @ ${value}`, () => {
                let visits_test = Object.keys(body.session).length == 0;
                let store_test =
                    body.store[body.session_id] == undefined && Object.keys(body.store).length == 0;
                return visits_test && store_test;
            });
        } else if (value == 1) {
            assert_log(group, `${candidate} VISITS_TEST @ ${value}`, () => {
                let visits_test = body.session.visits === value;
                let store_test = body.store[body.session_id] == undefined;
                return visits_test && store_test;
            });
        } else {
            assert_log(group, `${candidate} OBJ_TOUCH_TEST & OBJ_VISITS_TEST @ ${value}`, () => {
                let session_object = body.store?.[body.session_id];
                let visits_test = body.session.visits === value;
                let store_test = session_object?.data?.visits === value;

                let touch_test = value < 3;
                if (!touch_test && session_object.expiry > session_expiry) touch_test = true;

                session_expiry = session_object.expiry;
                return visits_test && store_test && touch_test;
            });
        }

        next();
    });

    log(group, 'Finished Testing ' + candidate + ' - Visits Test\n');
}

module.exports = {
    test_visits_scenario,
};
