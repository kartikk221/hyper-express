const { log, assert_log, random_string, async_for_each } = require('../../../scripts/operators.js');
const { fetch, server } = require('../../../configuration.js');
const { TEST_SERVER } = require('../../../components/Server.js');
const { TEST_STORE } = require('../test_engine.js');
const { path } = require('../configuration.json');
const endpoint = `${path}/scenarios/properties`;
const endpoint_url = server.base + endpoint;

// Create Backend HTTP Route
TEST_SERVER.get(endpoint, async (request, response) => {
    // Start the session
    await request.session.start();

    // Set some value into the session object
    // The await is unneccessary but it is used to simulate a long running operation
    await request.session.set({
        myid: 'some_id',
        visits: 0,
    });

    return response.json({
        id: request.session.id,
        signed_id: request.session.signed_id,
        ready: request.session.ready,
        stored: request.session.stored,
    });
});

async function test_properties_scenario() {
    // Test session persistence with visits test - VISITS ITERATOR TEST
    let group = 'MIDDLEWARE';
    let candidate = 'Middleware.SessionEngine.Session';

    // Make first fetch request
    const response1 = await fetch(endpoint_url);
    const data1 = await response1.json();

    // Make second fetch request
    const response2 = await fetch(endpoint_url, {
        headers: {
            cookie: response1.headers.get('set-cookie').split('; ')[0],
        },
    });
    const data2 = await response2.json();

    // Assert that the Session.id is a string and exactly same in both requests
    assert_log(
        group,
        `${candidate}.id`,
        () => typeof data1.id == 'string' && data1.id.length > 0 && data1.id == data2.id
    );

    // Assert that the Session.signed_id is a string and exactly same in both requests
    assert_log(
        group,
        `${candidate}.signed_id`,
        () => typeof data1.signed_id == 'string' && data1.signed_id.length > 0 && data1.signed_id == data2.signed_id
    );

    // Assert that the session was Session.ready in both requests
    assert_log(group, `${candidate}.ready`, () => data1.ready && data2.ready);

    // Assert that the session was Session.stored only in second request
    assert_log(group, `${candidate}.stored`, () => !data1.stored && data2.stored);

    log(group, 'Finished Testing ' + candidate + ' - Properties Test\n');
}

module.exports = {
    test_properties_scenario,
};
