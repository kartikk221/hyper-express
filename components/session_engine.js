module.exports = class SessionEngine {
    cookie = {
        name: 'he_sess',
        domain: '',
        path: '/',
        httpOnly: true,
        secure: true,
        sameSite: true,
    };
    session_expiry = '45 minutes';
    session_cleanup_interval_msecs = 1000 * 60 * 45;
    require_manual_touch = false;
    session_gen_id = () => {
        return 'some_id';
    };
    session_touch = (session_id, timestamp_ms) => {
        return 'promise';
    };
    session_read = (session_id) => {
        return 'promise';
    };
    session_write = (session_id, data_string, context) => {
        return 'promise';
    };
    session_destroy = (session_id, context) => {
        return 'promise';
    };
    session_cleanup = () => {
        return 'promise';
    };
};
