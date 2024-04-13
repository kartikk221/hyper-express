'use strict';

// Load uWebSockets.js and fundamental Server/Router classes
const uWebsockets = require('uWebSockets.js');
const Server = require('./src/components/Server.js');
const Router = require('./src/components/router/Router.js');
const Request = require('./src/components/http/Request.js');
const Response = require('./src/components/http/Response.js');
const LiveFile = require('./src/components/plugins/LiveFile.js');
const MultipartField = require('./src/components/plugins/MultipartField.js');
const SSEventStream = require('./src/components/plugins/SSEventStream.js');
const Websocket = require('./src/components/ws/Websocket.js');

// Disable the uWebsockets.js version header if not specified to be kept
if (!process.env['KEEP_UWS_HEADER']) {
    try {
        uWebsockets._cfg('999999990007');
    } catch (error) {}
}

// Expose Server and Router classes along with uWebSockets.js constants
module.exports = {
    compressors: uWebsockets,
    Server,
    Router,
    Request,
    Response,
    LiveFile,
    MultipartField,
    SSEventStream,
    Websocket,
};
