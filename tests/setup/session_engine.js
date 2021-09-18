const MemoryStore = require('../scripts/MemoryStore.js');
const { random_string, log } = require('../scripts/operators.js');
const { HyperExpress, log_store_events } = require('../scripts/configuration.js');

function store_log(message) {
    if (!log_store_events) return;
    log('SESSION_STORE', message);
}

// Create session to be bound to test webserver
const session_engine = new HyperExpress.SessionEngine({
    default_duration: 1000 * 60 * 45,
    signature_secret: random_string(20),
    cookie_options: {
        name: 'test_sess',
        httpOnly: false,
        secure: false,
        sameSite: 'none',
    },
});

// Use simulated sql-like memory store
const session_store = new MemoryStore();

// Handle READ events
session_engine.on('read', (session) => {
    store_log('READ -> ' + session.id);
    return session_store.select(session.id);
});

// Handle WRITE events
session_engine.on('write', (session) => {
    if (session.stored) {
        store_log('UPDATE -> ' + session.id + ' -> ' + session.expires_at);
        session_store.update(session.id, session.get_all(), session.expires_at);
    } else {
        store_log('INSERT -> ' + session.id + ' -> ' + session.expires_at);
        session_store.insert(session.id, session.get_all(), session.expires_at);
    }
});

// Handle TOUCH events
session_engine.on('touch', (session) => {
    store_log('TOUCH -> ' + session.id + ' -> ' + session.expires_at);
    session_store.touch(session.id, session.expires_at);
});

// Handle DESTROY events
session_engine.on('destroy', (session) => {
    store_log('DESTROY -> ' + session.id);
    session_store.delete(session.id);
});

// Handle CLEANUP events
session_engine.on('cleanup', () => {
    store_log('CLEANUP -> ALL SESSIONS');
    session_store.cleanup();
});

module.exports = {
    session_engine: session_engine,
    session_store: session_store,
};
