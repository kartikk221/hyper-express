'use strict';

// Load uWebSockets.js and fundamental Server/Router classes
const uWebsockets = require('uWebSockets.js');
const Server = require('./src/components/Server.js');
const Router = require('./src/components/router/Router.js');

// Disable the uWebsockets.js version header
try {
    uWebsockets._cfg('999999990007');
} catch (error) {}

// Expose Server and Router classes along with uWebSockets.js constants
module.exports = {
    Server,
    Router,
    compressors: uWebsockets,
};
