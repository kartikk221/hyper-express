'use strict';
const uWebsockets = require('uWebSockets.js');
const Server = require('./src/components/Server.js');
const Router = require('./src/components/router/Router.js');

module.exports = {
    Server,
    Router,
    compressors: uWebsockets, // This will expose all compressors from uws directly
};
