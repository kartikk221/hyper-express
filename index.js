const uWebsockets = require('uWebSockets.js');
const Server = require('./src/components/Server.js');
const SessionEngine = require('./src/components/session/SessionEngine.js');

module.exports = {
    Server,
    SessionEngine,
    compressors: uWebsockets, // This will expose all compressors from uws directly
};
