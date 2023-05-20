const http = require('http');
const fetch = require('node-fetch');
const Websocket = require('ws');
const EventSource = require('eventsource');
const HyperExpress = require('../index.js');
const AbortController = require('abort-controller');

const patchedFetch = (url, options = {}) => {
    // Use a different http agent for each request to prevent connection pooling
    options.agent = new http.Agent({ keepAlive: false });
    return fetch(url, options);
};

module.exports = {
    fetch: patchedFetch,
    Websocket,
    EventSource,
    HyperExpress,
    AbortController,
    server: {
        host: '127.0.0.1',
        port: 8080,
        secure_port: 8443,
        base: 'http://127.0.0.1:8080',
    },
};
