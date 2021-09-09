const root = '../../';
const { log, assert_log, random_string } = require(root + 'scripts/operators.js');
const { fetch, server } = require(root + 'scripts/configuration.js');
const { webserver } = require(root + 'setup/webserver.js');
const endpoint = '/tests/response/send-file';
const endpoint_url = server.base + endpoint;

// Create Backend HTTP Route
webserver.get(endpoint, async (request, response) => {
    return response.file('./content/test.html');
});

async function test_livefile_object() {
    let group = 'RESPONSE';
    let candidate = 'HyperExpress.Response.file()';

    // Perform fetch request
    let start_time = Date.now();
    const response = await fetch(endpoint_url);
    const body = await response.text();
    const end_time = Date.now() - start_time;

    // Test initial content type and length test for file
    const headers = response.headers.raw();
    const content_type = headers['content-type'];
    const content_length = headers['content-length'];
    assert_log(group, candidate, () => {
        return content_type == 'text/html' && content_length == '120' && body.length == 120;
    });

    start_time = Date.now();
    const response2 = await fetch(endpoint_url);
    await response2.text();
    let end_time_cached = Date.now() - start_time;
    assert_log(group, candidate + ' - From Cache', () => {
        return end_time_cached < end_time;
    });
}

module.exports = {
    test_livefile_object: test_livefile_object,
};
