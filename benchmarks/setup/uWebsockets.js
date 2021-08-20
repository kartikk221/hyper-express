const uWebSockets = require('uWebSockets.js');
const test_server = uWebSockets.App();
const simple_html = require('../tests/simple_html.js');

test_server.get('/benchmark', (response, request) => {
    // This is needed for high stress environments otherwise uWS throws forbidden error
    let is_aborted = false;
    response.onAborted(() => (is_aborted = true));

    // Generate payload
    let payload = simple_html();

    // We must check to ensure request has not been reported otherwise uWS throws error
    if (is_aborted) return;

    // Write content type header and send response
    response.writeHeader('content-type', 'text/html; charset=utf-8');
    return response.end(payload);
});

module.exports = test_server;
