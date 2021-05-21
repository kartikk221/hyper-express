const fetch = require('node-fetch');
const HyperExpress = require('../../index.js');
const WebSocket = require('ws');

module.exports = {
    fetch: fetch,
    HyperExpress: HyperExpress,
    WebSocket: WebSocket,
    server: {
        host: 'localhost',
        port: 8080,
        base: 'http://localhost:8080',
    },
    log_store_events: false,
    log_ws_events: false,
};
