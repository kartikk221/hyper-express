const fastify = require('fastify');
const test_server = fastify();
const simple_html = require('../tests/simple_html.js');

test_server.get('/benchmark', (request, reply) => {
    reply.header('content-type', 'text/html; charset=utf-8');
    return reply.send(simple_html());
});

module.exports = test_server;
