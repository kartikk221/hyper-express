const group = 'Server';
const { HyperExpress } = require('../configuration.js');
const { log, assert_log } = require('../scripts/operators.js');

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
    if (typeof request.expected_error == 'function') return request.expected_error(error);

    // Treat as global error and log to console
    log('UNCAUGHT_ERROR_REQUEST', `${request.method} | ${request.url}\n ${JSON.stringify(request.headers, null, 2)}`);
    console.log(error);
    return response.send('Uncaught Error Occured');
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

module.exports = {
    TEST_SERVER,
    not_found_handler,
};
