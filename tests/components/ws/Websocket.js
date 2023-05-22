const { log, random_string, assert_log } = require('../../scripts/operators.js');
const { HyperExpress, Websocket, server } = require('../../configuration.js');
const { test_websocket_stream } = require('./scenarios/stream.js');
const { test_websocket_writable } = require('./scenarios/writable.js');

const Router = new HyperExpress.Router();
const TestPath = '/websocket-component';
const TestCode = 1000;
const TestKey = random_string(30);

// Create websocket route for handling protected upgrade
let remote_ws;
let remote_closed = false;
Router.ws('/echo', (ws) => {
    // Store websocket object for checking throught tests
    remote_ws = ws;

    // Bind message handler
    ws.on('message', (message) => {
        // Echo messages until we receive 'CLOSE' message
        if (message === 'CLOSE') {
            ws.close(TestCode);
        } else {
            ws.send(message);
        }
    });

    // This will test that close event fires properly
    ws.on('close', () => (remote_closed = true));
});

// Create upgrade route for testing user assigned upgrade handler
Router.upgrade('/echo', (request, response) => {
    // Reject upgrade request if valid key is not provided
    const key = request.query_parameters['key'];
    const delay = +request.query_parameters['delay'] || 0;
    if (key !== TestKey) return response.status(403).send();

    // Upgrade request with delay to simulate async upgrade handler or not
    if (delay) {
        setTimeout(
            () =>
                response.upgrade({
                    key,
                }),
            delay
        );
    } else {
        response.upgrade({
            key,
        });
    }
});

// Bind router to test server instance
const { TEST_SERVER } = require('../../components/Server.js');
TEST_SERVER.use(TestPath, Router);

async function test_websocket_component() {
    const group = 'WEBSOCKET';
    const candidate = 'HyperExpress.Websocket';
    const endpoint_base = `${server.base.replace('http', 'ws')}${TestPath}`;
    log(group, 'Testing ' + candidate);

    // Test with No delay and random delay between 30-60ms for upgrade handler
    await Promise.all(
        [0, Math.floor(Math.random() * 30) + 30].map((delay) => {
            // Test protected websocket route upgrade handling (NO KEY)
            let count = 5;
            const delay_message = `With ${delay}ms Delay`;
            const ws_echo = new Websocket(`${endpoint_base}/echo?key=${TestKey}&delay=${delay}`);
            return new Promise((resolve, reject) => {
                let expecting;
                ws_echo.on('open', () => {
                    // Assert that remote upgrade context was accessible from polyfill component
                    assert_log(
                        group,
                        `${candidate} ${delay_message} Upgrade Context Integrity`,
                        () => remote_ws.context.key === TestKey
                    );

                    // Start of echo chain with an expected random string
                    expecting = random_string(10);
                    ws_echo.send(expecting);
                });

                ws_echo.on('message', (message) => {
                    // Perform assertion to compare expected value with received value
                    message = message.toString();
                    assert_log(
                        group,
                        `${candidate} ${delay_message} Echo Test > [${expecting} === ${message}]`,
                        () => expecting === message
                    );

                    // Perform echo tests until count is 0
                    count--;
                    if (count > 0) {
                        expecting = random_string(10);
                        ws_echo.send(expecting);
                    } else {
                        // Tell remote to close connection
                        ws_echo.send('CLOSE');
                    }
                });

                // Create a reject timeout to throw on hangups
                let timeout = setTimeout(reject, 1000);
                ws_echo.on('close', (code) => {
                    // Assert that close code matches the test code
                    assert_log(group, `${candidate} ${delay_message} Connection Close Code`, () => code === TestCode);

                    clearTimeout(timeout);
                    resolve();
                });
            });
        })
    );

    // Assert that remote server also closed connection/update polyfill state appropriately
    assert_log(group, `${candidate} Remote Polyfill Close`, () => remote_ws.closed === true && remote_closed === true);

    // Test websocket .stream() method
    await test_websocket_stream();

    // Test websocket .writable property
    await test_websocket_writable();

    log(group, `Finished Testing ${candidate}\n`);
}

module.exports = {
    test_websocket_component,
};
