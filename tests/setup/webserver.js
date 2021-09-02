const { log } = require('../scripts/operators.js');
const { HyperExpress, server } = require('../scripts/configuration.js');

// Simple HTTP server for testing purposes only
const test_server = new HyperExpress.Server({
    fast_buffers: true,
    max_body_length: 1000 * 1000 * 7,
});

// Bind error handler for catch-all logging
test_server.set_error_handler((request, response, error) => {
    log(
        'UNCAUGHT_ERROR_REQUEST',
        `${request.method} | ${request.url}\n ${JSON.stringify(request.headers, null, 2)}`
    );
    console.log(error);
    return response.send('Uncaught Error Occured');
});

// Bind not found handler for unexpected incoming requests
test_server.set_not_found_handler((request, response) => {
    log(
        'NOT_FOUND_REQUEST',
        `${request.method} | ${request.url}\n ${JSON.stringify(request.headers, null, 2)}`
    );
    return response.status(404).send('Not Found');
});

async function initiate_http_server(port) {
    await test_server.listen(port);
    log('WEBSERVER', 'Successfully Started Testing HTTP Server On Port ' + port);
}

module.exports = {
    initiate_http_server: () => initiate_http_server(server.port),
    webserver: test_server,
};
