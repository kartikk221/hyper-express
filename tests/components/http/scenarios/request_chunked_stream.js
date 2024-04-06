const path = require('path');
const crypto = require('crypto');
const fs = require('fs');
const { assert_log } = require('../../../scripts/operators.js');
const { HyperExpress, fetch, server } = require('../../../configuration.js');
const router = new HyperExpress.Router();
const endpoint = '/tests/request';
const scenario_endpoint = '/chunked-stream';
const endpoint_url = server.base + endpoint + scenario_endpoint;
const test_file_path = path.resolve(path.join(__dirname, '../../../content/large-image.jpg'));
const test_file_stats = fs.statSync(test_file_path);

function get_file_write_path(file_name) {
    return path.resolve(path.join(__dirname, '../../../content/written/' + file_name));
}

// Create Backend HTTP Route
router.post(scenario_endpoint, async (request, response) => {
    // Create a writable stream to specified file name path
    const file_name = request.headers['x-file-name'];
    const path = get_file_write_path(file_name);
    const writable = fs.createWriteStream(path);

    // Pipe the readable body stream to the writable and wait for it to finish
    request.pipe(writable);
    await new Promise((resolve) => writable.once('finish', resolve));

    // Read the written file's buffer and calculate its md5 hash
    const written_buffer = fs.readFileSync(path);
    const written_hash = crypto.createHash('md5').update(written_buffer).digest('hex');

    // Cleanup the written file for future testing
    fs.rmSync(path);

    // Return the written hash to be validated on client side
    return response.json({
        hash: written_hash,
    });
});

// Bind router to webserver
const { TEST_SERVER } = require('../../Server.js');
TEST_SERVER.use(endpoint, router);

async function test_request_chunked_stream() {
    const group = 'REQUEST';
    const candidate = 'HyperExpress.Request.stream';

    // Send a buffer of the file in the request body so we have a content-length on server side
    const expected_buffer = fs.readFileSync(test_file_path);
    const expected_hash = crypto.createHash('md5').update(expected_buffer).digest('hex');
    const buffer_upload_response = await fetch(endpoint_url, {
        method: 'POST',
        headers: {
            'transfer-encoding': 'chunked',
            'x-file-name': 'request_upload_buffer.jpg',
        },
        body: fs.createReadStream(test_file_path),
    });

    // Validate the hash uploaded on the server side with the expected hash from client side
    const buffer_upload_body = await buffer_upload_response.json();
    assert_log(
        group,
        `${candidate} Chunked Transfer Piped Upload With Content Length - ${expected_hash} === ${buffer_upload_body.hash} - ${test_file_stats.size} bytes`,
        () => expected_hash === buffer_upload_body.hash
    );
}

module.exports = {
    test_request_chunked_stream,
};
