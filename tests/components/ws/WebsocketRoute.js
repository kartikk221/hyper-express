const { log, random_string, assert_log } = require('../../scripts/operators.js');
const { HyperExpress, Websocket, server } = require('../../configuration.js');

const Router = new HyperExpress.Router();
const TestPath = '/websocket-route';
const TestPayload = random_string(30);
const TestKey = random_string(30);
const TestOptions = {
    idle_timeout: 500,
    message_type: 'String',
    compression: HyperExpress.compressors.DISABLED,
    max_backpressure: 512 * 1024,
    max_payload_length: 16 * 1024,
};

// Create websocket route for testing default upgrade handler
Router.ws('/unprotected', TestOptions, (ws) => {
    // Send test payload and close if successful
    if (ws.send(TestPayload)) ws.close();
});

// Create upgrade route for testing user assigned upgrade handler
Router.upgrade('/protected', (request, response) => {
    // Reject upgrade request if valid key is not provided
    const key = request.query_parameters['key'];
    if (key !== TestKey) return response.status(403).send();

    // Upgrade request normally
    response.upgrade({
        key,
    });
});

// Create websocket route for handling protected upgrade
Router.ws('/protected', (ws) => {
    // Send test payload and close if successful
    if (ws.send(TestPayload)) ws.close();
});

// Bind router to test server instance
const { TEST_SERVER } = require('../../components/Server.js');
TEST_SERVER.use(TestPath, Router);

async function test_websocket_route() {
    const group = 'WEBSOCKET';
    const candidate = 'HyperExpress.WebsocketRoute';
    const endpoint_base = `${server.base.replace('http', 'ws')}${TestPath}`;
    log(group, 'Testing ' + candidate);

    // Test unprotected websocket route upgrade handling
    const ws_unprotected = new Websocket(`${endpoint_base}/unprotected`);
    await new Promise((resolve, reject) => {
        // Store last message to test payload integrity
        let last_message;
        ws_unprotected.on('message', (message) => {
            last_message = message.toString();
        });

        // Create a reject timeout to throw on hangups
        let timeout = setTimeout(reject, 1000);
        ws_unprotected.on('close', () => {
            // Assert options test on the websocket route
            const websocket_route = TEST_SERVER.routes.ws[`${TestPath}/unprotected`];
            assert_log(
                group,
                `${candidate} Constructor Options`,
                () => JSON.stringify(websocket_route.options) === JSON.stringify(TestOptions)
            );

            // Perform assertion to test for valid last message
            assert_log(
                group,
                `${candidate} Default/Unprotected Upgrade Handler`,
                () => last_message === TestPayload
            );

            // Cancel reject timeout and move on after assertion succeeds
            clearTimeout(timeout);
            resolve();
        });
    });

    // Test protected websocket route upgrade handling (NO KEY)
    const ws_protected_nokey = new Websocket(`${endpoint_base}/protected`);
    await new Promise((resolve, reject) => {
        // Store last error so we can compare the expected error type
        let last_error;
        ws_protected_nokey.on('error', (error) => {
            last_error = error;
        });

        // Create a reject timeout to throw on hangups
        let timeout = setTimeout(reject, 1000);
        ws_protected_nokey.on('close', () => {
            // Perform assertion to test for valid last message
            assert_log(
                group,
                `${candidate} Protected Upgrade Handler Rejection With No Key`,
                () => last_error && last_error.message.indexOf('403') > -1
            );

            // Cancel reject timeout and move on after assertion succeeds
            clearTimeout(timeout);
            resolve();
        });
    });

    // Test protected websocket route upgrade handling (WITH KEY)
    const ws_protected_key = new Websocket(`${endpoint_base}/protected?key=${TestKey}`);
    await new Promise((resolve, reject) => {
        // Store last message to test payload integrity
        let last_message;
        ws_protected_key.on('message', (message) => {
            last_message = message.toString();
        });

        // Create a reject timeout to throw on hangups
        let timeout = setTimeout(reject, 1000);
        ws_protected_key.on('close', () => {
            // Perform assertion to test for valid last message
            assert_log(
                group,
                `${candidate} Protected Upgrade Handler With Key`,
                () => last_message === TestPayload
            );

            // Cancel reject timeout and move on after assertion succeeds
            clearTimeout(timeout);
            resolve();
        });
    });

    log(group, `Finished Testing ${candidate}\n`);
}

module.exports = {
    test_websocket_route,
};
