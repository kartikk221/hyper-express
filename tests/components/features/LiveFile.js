const root = '../../';
const { log, assert_log, random_string } = require(root + 'scripts/operators.js');
const { fetch, server } = require(root + 'scripts/configuration.js');
const { webserver } = require(root + 'setup/webserver.js');
const endpoint = '/tests/response/send-file';
const endpoint_url = server.base + endpoint;

// Create Backend HTTP Route
webserver.get(endpoint, async (request, response) => {
    // We purposely delay 100ms so cached vs. uncached does not rely too much on system disk
    return response.download('./content/test.html', 'something.html');
});

async function test_livefile_object() {
    let group = 'RESPONSE';
    let candidate = 'HyperExpress.Response';

    // Perform fetch request
    const response = await fetch(endpoint_url);
    const body = await response.text();

    // Test initial content type and length test for file
    const headers = response.headers.raw();
    const content_type = headers['content-type'];
    const content_length = headers['content-length'];
    assert_log(group, candidate + '.file()', () => {
        return content_type == 'text/html' && content_length == '120' && body.length == 120;
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
