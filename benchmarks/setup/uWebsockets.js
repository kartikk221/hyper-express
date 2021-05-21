const uWebSockets = require('uWebSockets.js');
const test_server = uWebSockets.App();
const simple_html = require('../tests/simple_html.js');

test_server.get('/benchmark', (response, request) => {
    response.writeHeader('content-type', 'text/html; charset=utf-8');
    return response.end(simple_html());
});

module.exports = test_server;
