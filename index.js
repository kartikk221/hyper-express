const uWebsockets = require('uWebSockets.js');
const Server = require('./src/components/Server.js');
const SessionEngine = require('./src/components/session/SessionEngine.js');

module.exports = {
    Server: Server,
    SessionEngine: SessionEngine,
    compressors: {
        DISABLED: uWebsockets.DISABLED,
        SHARED_COMPRESSOR: uWebsockets.SHARED_COMPRESSOR,
        DEDICATED_COMPRESSOR_3KB: uWebsockets.DEDICATED_COMPRESSOR_3KB,
        DEDICATED_COMPRESSOR_4KB: uWebsockets.DEDICATED_COMPRESSOR_4KB,
        DEDICATED_COMPRESSOR_8KB: uWebsockets.DEDICATED_COMPRESSOR_8KB,
        DEDICATED_COMPRESSOR_16KB: uWebsockets.DEDICATED_COMPRESSOR_16KB,
        DEDICATED_COMPRESSOR_32KB: uWebsockets.DEDICATED_COMPRESSOR_32KB,
        DEDICATED_COMPRESSOR_64KB: uWebsockets.DEDICATED_COMPRESSOR_64KB,
        DEDICATED_COMPRESSOR_128KB: uWebsockets.DEDICATED_COMPRESSOR_128KB,
        DEDICATED_COMPRESSOR_256KB: uWebsockets.DEDICATED_COMPRESSOR_256KB,
    },
};
