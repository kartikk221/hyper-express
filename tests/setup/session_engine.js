const MemoryStore = require('../scripts/MemoryStore.js');
const { random_string, log } = require('../scripts/operators.js');
const {
    HyperExpress,
    log_store_events,
} = require('../scripts/configuration.js');

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
session_engine.handle('read', (session_id) => {
    store_log('READ -> ' + session_id);
    return session_store.select(session_id);
});

// Handle WRITE events
session_engine.handle('write', (session_id, data, expiry_ts, from_db) => {
    if (from_db) {
        store_log('UPDATE -> ' + session_id + ' -> ' + expiry_ts);
        session_store.update(session_id, data, expiry_ts);
    } else {
        store_log('INSERT -> ' + session_id + ' -> ' + expiry_ts);
        session_store.insert(session_id, data, expiry_ts);
    }
});

// Handle TOUCH events
session_engine.handle('touch', (session_id, expiry_ts) => {
    store_log('TOUCH -> ' + session_id + ' -> ' + expiry_ts);
    session_store.touch(session_id, expiry_ts);
});

// Handle DESTROY events
session_engine.handle('destroy', (session_id) => {
    store_log('DESTROY -> ' + session_id);
    session_store.delete(session_id);
});

// Handle CLEANUP events
session_engine.handle('cleanup', () => {
    store_log('CLEANUP -> ALL SESSIONS');
    session_store.cleanup();
});

module.exports = {
    session_engine: session_engine,
    session_store: session_store,
};
