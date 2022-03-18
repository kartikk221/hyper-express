const fetch = require('node-fetch');
const Websocket = require('ws');
const HyperExpress = require('../index.js');
const AbortController = require('abort-controller');

module.exports = {
    fetch,
    Websocket,
    HyperExpress,
    AbortController,
    server: {
        host: '127.0.0.1',
        port: 8080,
        base: 'http://127.0.0.1:8080',
    },
};
