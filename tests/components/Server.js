const { server, HyperExpress } = require('../configuration.js');
const { log, assert_log } = require('../scripts/operators.js');
const net = require('net');

function get_available_port() {
    return new Promise((resolve, reject) => {
        const socket = net.createServer();

        socket.once('error', reject);
        socket.listen(0, '0.0.0.0', () => {
            const port = socket.address().port;
            socket.close((error) => (error ? reject(error) : resolve(port)));
        });
    });
}

async function test_server_exclusive_port() {
    const server = new HyperExpress.Server({
        auto_close: false,
        exclusive_port: true,
    });
    const port = await get_available_port();
    let listening = false;
    let custom_host_rejected = false;

    try {
        await server.listen(port);
        listening = server.port === port;
    } finally {
        server.close();
    }

    try {
        await server.listen(port, '127.0.0.1');
    } catch (error) {
        custom_host_rejected = String(error).includes('custom host');
    }

    assert_log(
        'Server',
        'Server Exclusive Port Listen Option Test',
        () => listening && custom_host_rejected
    );
    server.force_close();
}

// Create a test HyperExpress instance
const TEST_SERVER = new HyperExpress.Server({
    fast_buffers: true,
    max_body_length: 1000 * 1000 * 7,
});

// Set some value into the locals object to be checked in the future
// through the Request/Response app property
TEST_SERVER.locals.some_reference = {
    some_data: true,
};

// Bind error handler for catch-all logging
TEST_SERVER.set_error_handler((request, response, error) => {
    // Handle expected errors with their appropriate callbacks
    if (typeof request.expected_error == 'function') {
        request.expected_error(error);
    } else {
        // Treat as global error and log to console
        log(
            'UNCAUGHT_ERROR_REQUEST',
            `${request.method} | ${request.url}\n ${JSON.stringify(request.headers, null, 2)}`
        );
        console.log(error);
        response.send('Uncaught Error Occured');
    }
});

function not_found_handler(request, response) {
    // Handle dynamic middleware executions to the requester
    if (Array.isArray(request.middleware_executions)) {
        request.middleware_executions.push('not-found');
        return response.json(request.middleware_executions);
    }

    // Return a 404 response
    return response.status(404).send('Not Found');
}

// Bind not found handler for unexpected incoming requests
TEST_SERVER.set_not_found_handler((request, response) => {
    console.warn(
        'This handler should not actually be called as one of the tests binds a Server.all("*") route which should prevent this handler from ever being ran.'
    );
    not_found_handler(request, response);
});

// Bind a test route which returns a response with a delay
// This will be used to simulate long running requests
TEST_SERVER.get('/echo/:delay', async (request, response) => {
    // Wait for the specified delay and return a response
    const delay = Number(request.path_parameters.delay) || 0;
    await new Promise((resolve) => setTimeout(resolve, delay));
    return response.send(delay.toString());
});

async function test_server_shutdown() {
    let group = 'SERVER';

    // Make a fetch request to the echo endpoint with a delay of 100ms
    const delay = 100;
    const started_at = Date.now();

    // Send the request and time the response
    const response = await fetch(`${server.base}/echo/${delay}`);

    // Begin the server shutdown process and time the shutdown
    let shutdown_time_ms = 0;
    const shutdown_promise = TEST_SERVER.shutdown();
    shutdown_promise.then(() => (shutdown_time_ms = Date.now() - started_at));

    // Send a second fetch which should be immediately closed
    let response2_error;
    try {
        const response2 = await fetch(`${server.base}/echo/${delay}`);
    } catch (error) {
        response2_error = error;
    }

    // Begin processing the response body
    const body = await response.text();
    const request_time_ms = Date.now() - started_at;

    // Wait for the server shutdown to complete
    await shutdown_promise;

    // Verify middleware functionalitiy and property binding
    assert_log(
        group,
        'Graceful Shutdown Test In ' + (Date.now() - started_at) + 'ms',
        // Ensure that the response body matches the delay
        // Ensure that the request time is greater than the delay (The handler artificially waited for the delay)
        // Ensure that the shutdown time is greater than the delay (The server shutdown took longer than the delay)
        // Ensure that response2 failed over network as the server shutdown was in process which would immediately close the request
        () =>
            body === delay.toString() &&
            request_time_ms >= delay &&
            shutdown_time_ms >= delay &&
            response2_error !== undefined
    );
}

module.exports = {
    TEST_SERVER,
    not_found_handler,
    test_server_exclusive_port,
    test_server_shutdown,
};
