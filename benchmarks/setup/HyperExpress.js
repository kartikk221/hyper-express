const HyperExpress = require('../../index.js');
const test_server = new HyperExpress.Server();
const simple_html = require('../tests/simple_html.js');

test_server.get('/benchmark', (request, response) => {
    return response.html(simple_html());
});

module.exports = test_server;
