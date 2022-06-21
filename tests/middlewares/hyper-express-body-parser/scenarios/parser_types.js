const crypto = require('crypto');
const BodyParser = require('../../../../middlewares/hyper-express-body-parser/index.js');
const { log, assert_log } = require('../../../scripts/operators.js');
const { fetch, server } = require('../../../configuration.js');
const { TEST_SERVER } = require('../../../components/Server.js');
const { path } = require('../configuration.json');
const endpoint = `${path}/scenarios/parser-types`;
const endpoint_url = server.base + endpoint;

// Bind all parser types to the endpoint
TEST_SERVER.use(endpoint, BodyParser.raw(), BodyParser.text());

// Create Backend HTTP Route
TEST_SERVER.post(endpoint, (request, response) => {
    const content_type = request.headers['content-type'];
    switch (content_type) {
        case 'application/json':
            return response.json(request.body);
        default:
            return response.send(request.body);
    }
});

async function test_parser_types() {
    // User Specified ID Brute Vulnerability Test
    let group = 'MIDDLEWARE';
    let candidate = 'Middleware.BodyParser';
    log(group, 'Testing ' + candidate + ' - Parser Body Types Test');

    // Test the empty bodies

    // Perform fetch requests with various body types
    const promises = [
        [crypto.randomBytes(1000), 'application/octet-stream'],
        [crypto.randomBytes(1000).toString('hex'), 'text/plain'],
        [
            {
                payload: crypto.randomBytes(1000),
            },
            'application/json',
        ],
    ].map(
        ([request_body, content_type]) =>
            new Promise(async (resolve) => {
                // Make the fetch request
                const response = await fetch(endpoint_url, {
                    method: 'POST',
                    headers: {
                        'content-type': content_type,
                    },
                    body: request_body,
                });

                // Parse the incoming body as the appropriate type
                let response_body;
                switch (content_type) {
                    case 'application/octet-stream':
                        response_body = await response.buffer();
                        break;
                    case 'text/plain':
                        response_body = await response.text();
                        break;
                }

                // Assert that the response status code is 413 for the large body
                assert_log(group, candidate + ` - Body Type Test With '${content_type}'`, () => {
                    switch (content_type) {
                        case 'application/octet-stream':
                            return Buffer.compare(request_body, response_body) === 0;
                        case 'text/plain':
                            return request_body === response_body;
                        case 'application/json':
                            return JSON.stringify(request_body) === JSON.stringify(response_body);
                        default:
                            return false;
                    }
                });

                resolve();
            })
    );

    // Wait for all the promises to resolve
    await Promise.all(promises);
    log(group, 'Finished ' + candidate + ' - Parser Body Types Test\n');
}

module.exports = {
    test_parser_types,
};
