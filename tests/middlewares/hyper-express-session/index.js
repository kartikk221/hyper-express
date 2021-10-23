// Bind test session engine to configuration path on test server
const { TEST_SERVER } = require('../../components/Server.js');
const { TEST_ENGINE } = require('./test_engine.js');
const { path } = require('./configuration.json');
TEST_SERVER.use(path, TEST_ENGINE);

const { test_brute_scenario } = require('./scenarios/brute.js');
const { test_duration_scenario } = require('./scenarios/duration.js');
const { test_roll_scenario } = require('./scenarios/roll.js');
const { test_visits_scenario } = require('./scenarios/visits.js');

async function test_session_middleware() {
    await test_brute_scenario();
    await test_roll_scenario();
    await test_visits_scenario();
    await test_duration_scenario();
}

module.exports = {
    test_session_middleware,
};
