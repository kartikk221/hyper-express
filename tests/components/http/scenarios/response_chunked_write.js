const path = require('path');
const crypto = require('crypto');
const fs = require('fs');
const { Writable } = require('stream');
const { assert_log } = require('../../../scripts/operators.js');
const { HyperExpress, fetch, server } = require('../../../configuration.js');
const router = new HyperExpress.Router();
const endpoint = '/tests/response';
const scenario_endpoint = '/write';
const endpoint_url = server.base + endpoint + scenario_endpoint;
const test_file_path = path.resolve(path.join(__dirname, '../../../content/large-image.jpg'));
const test_file_stats = fs.statSync(test_file_path);

function safe_write_chunk(response, chunk, callback) {
    return response.write(chunk, 'utf8', callback);
}

// Create Backend HTTP Route
router.get(scenario_endpoint, async (request, response) => {
    // Set some headers to ensure we have proper headers being received
    response.header('x-is-written', 'true');

    // Create a readable stream for test file and stream it
    const readable = fs.createReadStream(test_file_path);

    // Create a Writable which we will pipe the readable into
    const writable = new Writable({
        write: (chunk, encoding, callback) => {
            // Safe write a chunk until it has FULLY been served
            safe_write_chunk(response, chunk, callback);
        },
    });

    // Bind event handlers for ending the request once Writable has ended or closed
    writable.on('close', () => response.send());

    // Pipe the readable into the writable we created
    readable.pipe(writable);
});

// Bind router to webserver
const { TEST_SERVER } = require('../../Server.js');
TEST_SERVER.use(endpoint, router);

async function test_response_chunked_write() {
    const group = 'RESPONSE';
    const candidate = 'HyperExpress.Response.write()';

    // Read test file's buffer into memory
    const expected_buffer = fs.readFileSync(test_file_path);
    const expected_hash = crypto.createHash('md5').update(expected_buffer).digest('hex');

    // Perform chunked encoding based fetch request to download streamed buffer for test file from server
    const chunked_response = await fetch(endpoint_url);

    // Ensure custom headers are received first
    assert_log(
        group,
        `${candidate} Custom Chunked Transfer Write Headers Test`,
        () => chunked_response.headers.get('x-is-written') === 'true'
    );

    // Download buffer from request to compare
    let received_buffer = await chunked_response.buffer();
    let received_hash = crypto.createHash('md5').update(received_buffer).digest('hex');

    // Test to see error handler was properly called on expected middleware error
    assert_log(
        group,
        `${candidate} Custom Chunked Transfer Write Buffer/Hash Comparison Test - ${expected_hash} - ${test_file_stats.size} bytes`,
        () => expected_buffer.equals(received_buffer) && expected_hash === received_hash
    );
}

module.exports = {
    test_response_chunked_write,
};
