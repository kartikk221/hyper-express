const { webserver } = require('../../setup/webserver.js');
const { session_engine } = require('../../setup/session_engine.js');
const { test_visits_scenario } = require('./scenarios/visits.js');
const { test_roll_scenario } = require('./scenarios/roll.js');
const { test_duration_scenario } = require('./scenarios/duration.js');
const { test_brute_scenario } = require('./scenarios/brute.js');

// Bind Session Engine To Web Based
webserver.set_session_engine(session_engine);

async function test_session_object() {
    await test_visits_scenario();
    await test_roll_scenario();
    await test_brute_scenario();
    await test_duration_scenario();
}

module.exports = {
    test_session_object: test_session_object,
};
