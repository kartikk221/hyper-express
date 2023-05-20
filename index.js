'use strict';

// Use uWebsockets.js new alien mode in which uWebsockets.js runs on a separate event-loop from Node.js allowing for better performance
// process.env['ALIEN_UWS'] = 1;

// Load uWebSockets.js and fundamental Server/Router classes
const uWebsockets = require('uWebSockets.js');
const Server = require('./src/components/Server.js');
const Router = require('./src/components/router/Router.js');

// Expose Server and Router classes along with uWebSockets.js constants
module.exports = {
    Server,
    Router,
    compressors: uWebsockets,
};
