const fetch = require('node-fetch');
const Websocket = require('ws');
const HyperExpress = require('../index.js');

module.exports = {
    fetch,
    Websocket,
    HyperExpress,
    server: {
        host: '127.0.0.1',
        port: 8080,
        base: 'http://127.0.0.1:8080',
    },
};
