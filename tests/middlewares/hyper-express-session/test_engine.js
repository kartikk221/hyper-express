const SessionEngine = require('hyper-express-session');
const MemoryStore = require('../../scripts/MemoryStore.js');
const { random_string } = require('../../scripts/operators.js');

// Create Test Engine For Usage In Tests
const TEST_ENGINE = new SessionEngine({
    duration: 1000 * 60 * 45,
    cookie: {
        name: 'test_sess',
        httpOnly: false,
        secure: false,
        sameSite: 'none',
        secret: random_string(20),
    },
});

const { log } = require('../../scripts/operators.js');
const { log_store_events } = require('./configuration.json');
function store_log(message) {
    if (log_store_events === true) log('SESSION_STORE', message);
}

// Use a simulated SQL-like memory store
const TEST_STORE = new MemoryStore();

// Handle READ events
TEST_ENGINE.use('read', (session) => {
    store_log('READ -> ' + session.id);
    return TEST_STORE.select(session.id);
});

// Handle WRITE events
TEST_ENGINE.use('write', (session) => {
    if (session.stored) {
        store_log('UPDATE -> ' + session.id + ' -> ' + session.expires_at);
        TEST_STORE.update(session.id, session.get(), session.expires_at);
    } else {
        store_log('INSERT -> ' + session.id + ' -> ' + session.expires_at);
        TEST_STORE.insert(session.id, session.get(), session.expires_at);
    }
});

// Handle TOUCH events
TEST_ENGINE.use('touch', (session) => {
    store_log('TOUCH -> ' + session.id + ' -> ' + session.expires_at);
    TEST_STORE.touch(session.id, session.expires_at);
});

// Handle DESTROY events
TEST_ENGINE.use('destroy', (session) => {
    store_log('DESTROY -> ' + session.id);
    TEST_STORE.delete(session.id);
});

// Handle CLEANUP events
TEST_ENGINE.use('cleanup', () => {
    store_log('CLEANUP -> ALL SESSIONS');
    TEST_STORE.cleanup();
});

module.exports = {
    TEST_ENGINE,
    TEST_STORE,
};
