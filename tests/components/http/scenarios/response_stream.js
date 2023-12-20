const path = require('path');
const crypto = require('crypto');
const fs = require('fs');
const { assert_log } = require('../../../scripts/operators.js');
const { HyperExpress, fetch, server } = require('../../../configuration.js');
const router = new HyperExpress.Router();
const endpoint = '/tests/response';
const scenario_endpoint = '/stream';
const endpoint_url = server.base + endpoint + scenario_endpoint;
const test_file_path = path.resolve(path.join(__dirname, '../../../content/large-image.jpg'));
const test_file_stats = fs.statSync(test_file_path);

// Create Backend HTTP Route
router.get(scenario_endpoint, async (request, response) => {
    // Set some headers to ensure we have proper headers being received
    response.header('x-is-streamed', 'true');

    // Create a readable stream for test file and stream it
    const readable = fs.createReadStream(test_file_path);

    // Deliver with chunked encoding if specified by header or fall back to normal handled delivery
    const use_chunked_encoding = request.headers['x-chunked-encoding'] === 'true';
    response.stream(readable, use_chunked_encoding ? undefined : test_file_stats.size);
});

// Bind router to webserver
const { TEST_SERVER } = require('../../Server.js');
TEST_SERVER.use(endpoint, router);

async function test_response_stream_method() {
    const group = 'RESPONSE';
    const candidate = 'HyperExpress.Response.stream()';

    // Read test file's buffer into memory
    const expected_buffer = fs.readFileSync(test_file_path);
    const expected_hash = crypto.createHash('md5').update(expected_buffer).digest('hex');

    // Perform chunked encoding based fetch request to download streamed buffer for test file from server
    const chunked_response = await fetch(endpoint_url, {
        headers: {
            'x-chunked-encoding': 'true',
        },
    });

    // Ensure custom headers are received first
    assert_log(
        group,
        `${candidate} Chunked Transfer Streamed Headers Test`,
        () => chunked_response.headers.get('x-is-streamed') === 'true'
    );

    // Download buffer from request to compare
    let received_buffer = await chunked_response.buffer();
    let received_hash = crypto.createHash('md5').update(received_buffer).digest('hex');

    // Test to see error handler was properly called on expected middleware error
    assert_log(
        group,
        `${candidate} Chunked Transfer Streamed Buffer/Hash Comparison Test - ${expected_hash} - ${test_file_stats.size} bytes`,
        () => {
            const matches = expected_buffer.equals(received_buffer) && expected_hash === received_hash;
            if (!matches) {
                console.log({
                    expected_buffer,
                    received_buffer,
                    expected_hash,
                    received_hash,
                });
            }

            return matches;
        }
    );

    // Perform handled response based fetch request to download streamed buffer for test file from server
    const handled_response = await fetch(endpoint_url);

    // Ensure custom headers are received and a valid content-length is also received
    assert_log(
        group,
        `${candidate} Handled Response Streamed Headers & Content-Length Test`,
        () =>
            handled_response.headers.get('x-is-streamed') === 'true' &&
            +handled_response.headers.get('content-length') === expected_buffer.byteLength
    );

    // Download buffer from request to compare
    received_buffer = await handled_response.buffer();
    received_hash = crypto.createHash('md5').update(received_buffer).digest('hex');

    // Test to see error handler was properly called on expected middleware error
    assert_log(
        group,
        `${candidate} Handled Response Streamed Buffer/Hash Comparison Test - ${expected_hash} - ${test_file_stats.size} bytes`,
        () => expected_buffer.equals(received_buffer) && expected_hash === received_hash
    );
}

module.exports = {
    test_response_stream_method,
};
