const crypto = require('crypto');
const BodyParser = require('../../../../middlewares/hyper-express-body-parser/index.js');
const { log, assert_log } = require('../../../scripts/operators.js');
const { fetch, server } = require('../../../configuration.js');
const { TEST_SERVER } = require('../../../components/Server.js');
const { path } = require('../configuration.json');
const endpoint = `${path}/scenarios/parser-limit`;
const endpoint_url = server.base + endpoint;

// Bind a raw parser to the endpoint
const TEST_LIMIT_BYTES = Math.floor(Math.random() * 100) + 100;
TEST_SERVER.use(
    endpoint,
    BodyParser.raw({
        limit: TEST_LIMIT_BYTES,
    })
);

// Create Backend HTTP Route
TEST_SERVER.post(endpoint, (request, response) => {
    return response.send();
});

async function test_parser_limit() {
    // User Specified ID Brute Vulnerability Test
    let group = 'MIDDLEWARE';
    let candidate = 'Middleware.BodyParser';
    log(group, 'Testing ' + candidate + ' - Parser Body Size Limit Test');

    // Perform fetch requests with various body sizes
    const promises = [
        Math.floor(Math.random() * TEST_LIMIT_BYTES), // Smaller than max size
        TEST_LIMIT_BYTES, // Max size
        Math.floor(Math.random() * TEST_LIMIT_BYTES) + TEST_LIMIT_BYTES, // Larger than max size
        TEST_LIMIT_BYTES * Math.floor(Math.random() * 5), // Random Factor Larger than max size
        Math.floor(TEST_LIMIT_BYTES * 0.1), // Smaller than max size
    ].map(
        (size_bytes) =>
            new Promise(async (resolve) => {
                // Generate a random buffer of bytes size
                const buffer = crypto.randomBytes(size_bytes);

                // Make the fetch request
                const response = await fetch(endpoint_url, {
                    method: 'POST',
                    body: buffer,
                    headers: {
                        'content-type': 'application/octet-stream',
                    },
                });

                // Assert that the response status code is 413 for the large body
                assert_log(
                    group,
                    candidate +
                        ` - Body Size Limit Test With ${size_bytes} / ${TEST_LIMIT_BYTES} Bytes Limit -> HTTP ${response.status}`,
                    () => response.status == (size_bytes > TEST_LIMIT_BYTES ? 413 : 200)
                );

                resolve();
            })
    );

    // Wait for all the promises to resolve
    await Promise.all(promises);
    log(group, 'Finished ' + candidate + ' - Parser Body Size Limit Test\n');
}

module.exports = {
    test_parser_limit,
};
