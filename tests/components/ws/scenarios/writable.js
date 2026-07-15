const path = require('path');
const crypto = require('crypto');
const fs = require('fs');
const assert = require('node:assert/strict');
const { pipeline } = require('node:stream/promises');
const { assert_log } = require('../../../scripts/operators.js');
const { HyperExpress, Websocket, server } = require('../../../configuration.js');

const Router = new HyperExpress.Router();
const TestPath = '/websocket-component';
const TestFilePath = path.resolve(path.join(__dirname, '../../../content/large-image.jpg'));

// Create an endpoint for serving a file
Router.ws('/writable', async (ws) => {
    // Each writable represents exactly one WebSocket message. pipeline() makes source,
    // destination, and error completion part of the assertion path.
    await pipeline(fs.createReadStream(TestFilePath), ws.writable);
    await pipeline(fs.createReadStream(TestFilePath), ws.writable);
    ws.close();
});

// Bind router to test server instance
const { TEST_SERVER } = require('../../../components/Server.js');
TEST_SERVER.use(TestPath, Router);

async function test_websocket_writable() {
    const group = 'WEBSOCKET';
    const candidate = 'HyperExpress.Websocket.writable';
    const endpoint_base = `${server.base.replace('http', 'ws')}${TestPath}`;

    // Read test file's buffer into memory
    const expected_buffer = fs.readFileSync(TestFilePath);
    const expected_hash = crypto.createHash('md5').update(expected_buffer).digest('hex');

    // Test protected websocket route upgrade handling (NO KEY)
    const ws_writable = new Websocket(`${endpoint_base}/writable`);
    await new Promise((resolve, reject) => {
        const messages = [];
        const timeout = setTimeout(() => reject(new Error(`${candidate} timed out.`)), 1000);

        // Assign a message handler to receive from websocket
        ws_writable.on('message', (message) => messages.push(Buffer.from(message)));
        ws_writable.on('error', reject);

        // Assign a close handler to handle assertion
        ws_writable.on('close', () => {
            clearTimeout(timeout);
            try {
                assert.equal(messages.length, 2, 'two pipes must produce exactly two messages');
                for (let index = 0; index < messages.length; index++) {
                    const received_hash = crypto
                        .createHash('md5')
                        .update(messages[index])
                        .digest('hex');
                    assert_log(
                        group,
                        `${candidate} - Piped Binary Buffer Integrity #${index + 1} - [${expected_hash}] == [${received_hash}]`,
                        () =>
                            expected_buffer.equals(messages[index]) &&
                            expected_hash === received_hash
                    );
                }
                resolve();
            } catch (error) {
                reject(error);
            }
        });
    });
}

module.exports = {
    test_websocket_writable,
};
