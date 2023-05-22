'use strict';
// Use uWebsockets.js new alien mode in which uWebsockets.js runs on a separate event-loop from Node.js allowing for better performance
// This mode seems to only be supported on Linux at the moment
const supported_platforms = ['linux'];
const alien_mode_allowed = process.env['ALIEN_UWS_FORBIDDEN'] === undefined;
if (supported_platforms.includes(process.platform) && alien_mode_allowed) process.env['ALIEN_UWS'] = 1;

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
