const crypto = require('crypto');
const BodyParser = require('../../../../middlewares/hyper-express-body-parser/index.js');
const { log, assert_log } = require('../../../scripts/operators.js');
const { fetch, server } = require('../../../configuration.js');
const { TEST_SERVER } = require('../../../components/Server.js');
const { path } = require('../configuration.json');
const endpoint = `${path}/scenarios/parser-validation`;
const endpoint_url = server.base + endpoint;

const TEST_PAYLOAD_SIZE = Math.floor(Math.random() * 250) + 250;

// Bind a raw parser that will only parse if the content type matches
TEST_SERVER.use(
    endpoint,
    BodyParser.raw({
        type: 'application/octet-stream',
        verify: (req, res, buffer) => {
            return buffer.length > TEST_PAYLOAD_SIZE * 0.5;
        }, // Reject bodies that are less than half size of the payload
    })
);

// Create Backend HTTP Route
TEST_SERVER.post(endpoint, (request, response) => {
    // Send a 200 if we have some body content else send a 204
    response.status(request.body.length > 0 ? 200 : 204).send();
});

async function test_parser_validation() {
    // User Specified ID Brute Vulnerability Test
    let group = 'MIDDLEWARE';
    let candidate = 'Middleware.BodyParser';
    log(group, 'Testing ' + candidate + ' - Parser Body Validation Test');

    // Perform fetch requests with various body sizes
    const promises = [
        ['application/json', TEST_PAYLOAD_SIZE, 204], // ~100% of the payload size but incorrect content type
        ['application/octet-stream', Math.floor(TEST_PAYLOAD_SIZE * 0.25), 403], // ~25% of the payload size
        ['application/octet-stream', Math.floor(TEST_PAYLOAD_SIZE * 0.75), 200], // ~75% of the payload size
        ['application/octet-stream', TEST_PAYLOAD_SIZE, 200], // ~75% of the payload size
    ].map(
        ([content_type, size_bytes, status_code]) =>
            new Promise(async (resolve) => {
                // Generate a random buffer of bytes size
                const buffer = crypto.randomBytes(size_bytes);

                // Make the fetch request
                const response = await fetch(endpoint_url, {
                    method: 'POST',
                    body: buffer,
                    headers: {
                        'content-type': content_type,
                    },
                });

                // Assert that the response status code is 413 for the large body
                assert_log(
                    group,
                    candidate +
                        ` - Content Type & Verify Function Test With "${content_type}" @ ${size_bytes} Bytes Payload`,
                    () => response.status === status_code
                );

                resolve();
            })
    );

    // Wait for all the promises to resolve
    await Promise.all(promises);
    log(group, 'Finished ' + candidate + ' - Parser Body Validation Test\n');
}

module.exports = {
    test_parser_validation,
};
