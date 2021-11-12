const path = require('path');
const crypto = require('crypto');
const fs = require('fs');
const { assert_log } = require('../../../scripts/operators.js');
const { HyperExpress, Websocket, server } = require('../../../configuration.js');

const Router = new HyperExpress.Router();
const TestPath = '/websocket-component';
const TestFilePath = path.resolve(path.join(__dirname, '../../../content/large-image.jpg'));

// Create an endpoint for serving a file
Router.ws('/stream', async (ws) => {
    // Create a readable stream to serve to the receiver
    const readable = fs.createReadStream(TestFilePath);

    // Stream the readable stream to the receiver
    await ws.stream(readable);

    // Close the connection once we are done streaming
    ws.close();
});

// Bind router to test server instance
const { TEST_SERVER } = require('../../../components/Server.js');
TEST_SERVER.use(TestPath, Router);

async function test_websocket_stream() {
    const group = 'WEBSOCKET';
    const candidate = 'HyperExpress.Websocket.stream()';
    const endpoint_base = `${server.base.replace('http', 'ws')}${TestPath}`;

    // Read test file's buffer into memory
    const expected_buffer = fs.readFileSync(TestFilePath);
    const expected_hash = crypto.createHash('md5').update(expected_buffer).digest('hex');

    // Test protected websocket route upgrade handling (NO KEY)
    const ws_stream = new Websocket(`${endpoint_base}/stream`);
    await new Promise((resolve, reject) => {
        let received_buffer;
        let received_hash;

        // Assign a message handler to receive from websocket
        ws_stream.on('message', (message) => {
            // Store the received buffer and its hash
            received_buffer = message;
            received_hash = crypto.createHash('md5').update(received_buffer).digest('hex');
        });

        // Assign a close handler to handle assertion
        ws_stream.on('close', () => {
            // Perform assertion to compare buffers and hashes
            assert_log(
                group,
                `${candidate} - Streamed Binary Buffer Integrity - [${expected_hash}] == [${received_hash}]`,
                () => expected_buffer.equals(received_buffer) && expected_hash === received_hash
            );
            resolve();
        });
    });
}

module.exports = {
    test_websocket_stream,
};
