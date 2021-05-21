const root = '../../';
const { log, assert_log, random_string } = require(root +
    'scripts/operators.js');
const { fetch, server } = require(root + 'scripts/configuration.js');
const { webserver } = require(root + 'setup/webserver.js');
const endpoint = '/tests/response/operators';
const endpoint_url = server.base + endpoint;

// Create Backend HTTP Route
webserver.post(endpoint, async (request, response) => {
    let body = await request.json();

    // Perform Requested Operations For Testing
    if (Array.isArray(body))
        body.forEach((operation) => {
            let method = operation[0];
            let parameters = operation[1];
            if (Array.isArray(parameters)) {
                // Support up to 4 multi parameters
                response[method](
                    parameters[0],
                    parameters[1],
                    parameters[2],
                    parameters[3]
                );
            } else {
                response[method](parameters);
            }
        });

    if (!response.aborted) return response.send();
});

async function test_response_object() {
    let start_time = Date.now();
    let group = 'RESPONSE';
    let candidate = 'HyperExpress.Response';
    log(group, 'Testing HyperExpress.Response Object...');

    // Test HyperExpress.Response Operators
    let test_status_code = 404;
    let test_mime_type = 'html';
    let header_test_name = random_string(10);
    let header_test_value = random_string(10);
    let cookie_test_name = random_string(10);
    let cookie_test_value = random_string(10);
    let test_html_placeholder = random_string(20);
    let test_cookie = {
        name: random_string(10) + '_sess',
        value: random_string(10),
    };

    let response1 = await fetch(endpoint_url, {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
            cookie: `${test_cookie.name}=${test_cookie.value}`,
        },
        body: JSON.stringify([
            ['status', test_status_code],
            ['type', test_mime_type],
            ['header', [header_test_name, header_test_value]],
            ['cookie', [cookie_test_name, cookie_test_value]],
            ['delete_cookie', test_cookie.name],
            ['send', test_html_placeholder],
        ]),
    });
    let body1 = await response1.text();

    // Verify .status()
    assert_log(
        group,
        candidate + '.status()',
        () => test_status_code === response1.status
    );

    // Verify .type()
    assert_log(
        group,
        candidate + '.type()',
        () => response1.headers.get('content-type') === 'text/html'
    );

    // Verify .header()
    assert_log(
        group,
        candidate + '.header()',
        () => response1.headers.get(header_test_name) === header_test_value
    );

    // Verify .cookie()
    assert_log(
        group,
        candidate + '.cookie() AND ' + candidate + '.delete_cookie()',
        () => {
            let cookies = {};
            response1.headers
                .get('set-cookie')
                .split(', ')
                .forEach((chunk) => {
                    if (chunk.indexOf('=') > -1) {
                        chunk = chunk.split('=');
                        let name = chunk[0];
                        let value = chunk[1].split(';')[0];
                        let properties = chunk.join('=').split('; ')[1];
                        cookies[name] = {
                            value: value,
                            properties: properties,
                        };
                    }
                });

            let test_cookie_test =
                cookies[cookie_test_name]?.value === cookie_test_value;
            let delete_cookie_value_test =
                cookies[test_cookie.name]?.value === '';
            let delete_cookie_props_test =
                cookies[test_cookie.name]?.properties === 'Max-Age=0';
            return (
                test_cookie_test &&
                delete_cookie_value_test &&
                delete_cookie_props_test
            );
        }
    );

    // Verify .send()
    assert_log(
        group,
        candidate + '.send()',
        () => body1 === test_html_placeholder
    );

    log(
        group,
        `Finished Testing ${candidate} In ${Date.now() - start_time}ms\n`
    );
}

module.exports = {
    test_response_object: test_response_object,
};
