const path = require('path');
const fs = require('fs');
const { assert_log } = require('../../../scripts/operators.js');
const { HyperExpress, fetch, server } = require('../../../configuration.js');
const router = new HyperExpress.Router();
const endpoint = '/tests/request';
const scenario_endpoint = '/chunked-json';
const endpoint_url = server.base + endpoint + scenario_endpoint;
const test_file_path = path.resolve(path.join(__dirname, '../../../content/test-body.json'));

// Create Backend HTTP Route
router.post(scenario_endpoint, async (request, response) => {
    const body = await request.json();
    return response.json(body);
});

// Bind router to webserver
const { TEST_SERVER } = require('../../Server.js');
TEST_SERVER.use(endpoint, router);

async function test_request_chunked_json() {
    const group = 'REQUEST';
    const candidate = 'HyperExpress.Request.json()';

    // Send a buffer of the file in the request body so we have a content-length on server side
    const expected_json = JSON.stringify(JSON.parse(fs.readFileSync(test_file_path).toString('utf8')));
    const json_stream_response = await fetch(endpoint_url, {
        method: 'POST',
        headers: {
            'transfer-encoding': 'chunked',
            'x-file-name': 'request_upload_body.json',
        },
        body: fs.createReadStream(test_file_path),
    });

    // Validate the hash uploaded on the server side with the expected hash from client side
    const uploaded_json = await json_stream_response.text();
    assert_log(group, `${candidate} Chunked Transfer JSON Upload Test`, () => expected_json === uploaded_json);
}

module.exports = {
    test_request_chunked_json,
};
