const path = require('path');
const crypto = require('crypto');
const fs = require('fs');
const { assert_log } = require('../../../scripts/operators.js');
const { HyperExpress, Websocket, server } = require('../../../configuration.js');

const Router = new HyperExpress.Router();
const TestPath = '/websocket-component';
const TestFilePath = path.resolve(path.join(__dirname, '../../../content/large-image.jpg'));

// Create an endpoint for serving a file
Router.ws('/writable', async (ws) => {
    // Create a readable stream to serve to the receiver
    let readable = fs.createReadStream(TestFilePath);

    // Pipe the readable into the websocket writable
    readable.pipe(ws.writable);

    // Bind a handler for once readable is finished
    readable.once('close', () => {
        // Repeat the same process as above to test twice
        readable = fs.createReadStream(TestFilePath);
        readable.pipe(ws.writable);

        // Bind the end handler again to close the connection this time
        readable.once('close', () => ws.close());
    });
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
        // Assign a message handler to receive from websocket
        let counter = 1;
        ws_writable.on('message', (message) => {
            // Derive the retrieved buffer and its hash
            const received_buffer = message;
            const received_hash = crypto.createHash('md5').update(received_buffer).digest('hex');

            // Assert the received data against the expected data
            assert_log(
                group,
                `${candidate} - Piped Binary Buffer Integrity #${counter} - [${expected_hash}] == [${received_hash}]`,
                () => expected_buffer.equals(received_buffer) && expected_hash === received_hash
            );
            counter++;
        });

        // Assign a close handler to handle assertion
        ws_writable.on('close', () => resolve());
    });
}

module.exports = {
    test_websocket_writable,
};
