const { assert_log } = require('../../scripts/operators.js');
const { fetch, server } = require('../../configuration.js');
const { TEST_SERVER } = require('../Server.js');
const fs = require('fs');
const path = require('path');
const endpoint = '/tests/response/send-file';
const endpoint_url = server.base + endpoint;
const test_file_path = path.resolve(__dirname, '../../../tests/content/test.html');

// Create Backend HTTP Route
TEST_SERVER.get(endpoint, async (request, response) => {
    // We purposely delay 100ms so cached vs. uncached does not rely too much on system disk
    return response.download(test_file_path, 'something.html');
});

async function test_livefile_object() {
    let group = 'RESPONSE';
    let candidate = 'HyperExpress.Response';

    // Read the test file into memory
    const test_file_string = fs.readFileSync(test_file_path).toString();

    // Perform fetch request
    const response = await fetch(endpoint_url);
    const body = await response.text();

    // Test initial content type and length test for file
    const headers = response.headers.raw();
    const content_type = headers['content-type'];
    const content_length = headers['content-length'];
    assert_log(group, candidate + '.file()', () => {
        return (
            content_type == 'text/html' &&
            content_length == test_file_string.length.toString() &&
            body.length == test_file_string.length
        );
    });

    // Test Content-Disposition header to validate .attachment()
    assert_log(
        group,
        `${candidate}.attachment() & ${candidate}.download()`,
        () => headers['content-disposition'][0] == 'attachment; filename="something.html"'
    );
}

module.exports = {
    test_livefile_object: test_livefile_object,
};
