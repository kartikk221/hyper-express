const path = require('path');
const crypto = require('crypto');
const fs = require('fs');
const assert = require('node:assert/strict');
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
        const messages = [];
        const timeout = setTimeout(() => reject(new Error(`${candidate} timed out.`)), 1000);

        // Assign a message handler to receive from websocket
        ws_stream.on('message', (message) => messages.push(Buffer.from(message)));
        ws_stream.on('error', reject);

        // Assign a close handler to handle assertion
        ws_stream.on('close', () => {
            clearTimeout(timeout);
            try {
                assert.equal(messages.length, 1, 'stream() must emit exactly one WebSocket message');
                const received_hash = crypto.createHash('md5').update(messages[0]).digest('hex');
                assert_log(
                    group,
                    `${candidate} - Streamed Binary Buffer Integrity - [${expected_hash}] == [${received_hash}]`,
                    () => expected_buffer.equals(messages[0]) && expected_hash === received_hash
                );
                resolve();
            } catch (error) {
                reject(error);
            }
        });
    });
}

module.exports = {
    test_websocket_stream,
};
