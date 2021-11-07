const path = require('path');
const crypto = require('crypto');
const fs = require('fs');
const { assert_log } = require('../../../scripts/operators.js');
const { HyperExpress, fetch, server } = require('../../../configuration.js');
const router = new HyperExpress.Router();
const endpoint = '/tests/response';
const scenario_endpoint = '/pipe';
const endpoint_url = server.base + endpoint + scenario_endpoint;
const test_file_path = path.resolve(path.join(__dirname, '../../../content/large-image.jpg'));
const test_file_stats = fs.statSync(test_file_path);

// Create Backend HTTP Route
router.get(scenario_endpoint, async (request, response) => {
    // Set some headers to ensure we have proper headers being received
    response.header('x-is-written', 'true');

    // Create a readable stream for test file and stream it
    const readable = fs.createReadStream(test_file_path);

    // Pipe the readable stream into the response
    readable.pipe(response.writable);
});

// Bind router to webserver
const { TEST_SERVER } = require('../../Server.js');
TEST_SERVER.use(endpoint, router);

async function test_response_piped_write() {
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
        `${candidate} Piped Stream Write Headers Test`,
        () => chunked_response.headers.get('x-is-written') === 'true'
    );

    // Download buffer from request to compare
    let received_buffer = await chunked_response.buffer();
    let received_hash = crypto.createHash('md5').update(received_buffer).digest('hex');

    // Test to see error handler was properly called on expected middleware error
    assert_log(
        group,
        `${candidate} Piped Stream Write Buffer/Hash Comparison Test - ${expected_hash} - ${test_file_stats.size} bytes`,
        () => expected_buffer.equals(received_buffer) && expected_hash === received_hash
    );
}

module.exports = {
    test_response_piped_write,
};
