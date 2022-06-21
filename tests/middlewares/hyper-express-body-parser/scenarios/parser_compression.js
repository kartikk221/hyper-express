const fs = require('fs');
const zlib = require('zlib');
const BodyParser = require('../../../../middlewares/hyper-express-body-parser/index.js');
const { log, assert_log, md5_from_buffer } = require('../../../scripts/operators.js');
const { fetch, server } = require('../../../configuration.js');
const { TEST_SERVER } = require('../../../components/Server.js');
const { path } = require('../configuration.json');
const endpoint = `${path}/scenarios/parser-compression`;
const endpoint_url = server.base + endpoint;
const test_file_path = './content/large-image.jpg';

// Bind a raw parser to the endpoint which does not uncompress the body
TEST_SERVER.use(
    endpoint,
    BodyParser.raw({
        limit: '5mb',
        inflate: false,
        type: 'application/octet-stream-strict',
    })
);

// Bind a raw parser to the endpoint which does uncompress the body
TEST_SERVER.use(
    endpoint,
    BodyParser.raw({
        limit: '5mb',
        type: 'application/octet-stream',
    })
);

// Create Backend HTTP Route
TEST_SERVER.post(endpoint, (request, response) => {
    // Echo the body back to the client
    return response.send(request.body);
});

let file_length_cache = {};
function get_test_file_length(encoding = 'identity') {
    // Return value from cache if it exists
    if (file_length_cache[encoding]) {
        return file_length_cache[encoding];
    }

    // Otherwise, calculate the length of the file
    const buffer = fs.readFileSync(test_file_path);
    switch (encoding) {
        case 'identity':
            file_length_cache[encoding] = buffer.length;
            break;
        case 'gzip':
            file_length_cache[encoding] = zlib.gzipSync(buffer).length;
            break;
        case 'deflate':
            file_length_cache[encoding] = zlib.deflateSync(buffer).length;
            break;
        default:
            throw new Error('Unsupported encoding: ' + encoding);
    }

    return file_length_cache[encoding];
}

function get_test_file_stream(encoding = 'identity') {
    const readable = fs.createReadStream(test_file_path);
    switch (encoding) {
        case 'gzip':
            const gzip = zlib.createGzip();
            return readable.pipe(gzip);
        case 'deflate':
            const deflate = zlib.createDeflate();
            return readable.pipe(deflate);
        default:
            return readable;
    }
}

async function test_parser_compression() {
    // User Specified ID Brute Vulnerability Test
    let group = 'MIDDLEWARE';
    let candidate = 'Middleware.BodyParser';
    log(group, 'Testing ' + candidate + ' - Parser Compression Test');

    // Determine the expected md5 hash of the test file
    const expected_md5 = md5_from_buffer(await fs.promises.readFile(test_file_path));

    // Perform fetch requests with the strict type but different compression types
    const [strict_response_1, strict_response_2] = await Promise.all([
        fetch(endpoint_url, {
            method: 'POST',
            body: get_test_file_stream(),
            headers: {
                'content-type': 'application/octet-stream-strict',
                'content-length': get_test_file_length(),
            },
        }),
        fetch(endpoint_url, {
            method: 'POST',
            body: get_test_file_stream('gzip'),
            headers: {
                'content-type': 'application/octet-stream-strict',
                'content-encoding': 'gzip',
                'content-length': get_test_file_length('gzip'),
            },
        }),
    ]);

    // Retrieve the response bodies of the strict responses
    const strict_body_1 = await strict_response_1.buffer();

    // Assert that the strict response 1 was successful with matching bodies
    assert_log(
        group,
        candidate + ' - Strict Parser Echo With Normal Body Test',
        () => strict_response_1.status == 200 && md5_from_buffer(strict_body_1) == expected_md5
    );

    // Assert that the strict response 2 was unsuccessful with a 415 status code
    assert_log(
        group,
        candidate + ' - Strict Parser Reject With Compressed Body Test',
        () => strict_response_2.status == 415
    );

    // Test the integrity of buffer with different compressions with server
    const [normal_response_1, normal_response_2, normal_response_3] = await Promise.all([
        fetch(endpoint_url, {
            method: 'POST',
            body: get_test_file_stream(),
            headers: {
                'content-type': 'application/octet-stream',
                'content-length': get_test_file_length(),
            },
        }),
        fetch(endpoint_url, {
            method: 'POST',
            body: get_test_file_stream('deflate'),
            headers: {
                'content-type': 'application/octet-stream',
                'content-encoding': 'deflate',
                'content-length': get_test_file_length('deflate'),
            },
        }),
        fetch(endpoint_url, {
            method: 'POST',
            body: get_test_file_stream('gzip'),
            headers: {
                'content-type': 'application/octet-stream',
                'content-encoding': 'gzip',
                'content-length': get_test_file_length('gzip'),
            },
        }),
    ]);

    // Assert that all of the normal responses returned a 200 status code
    assert_log(
        group,
        candidate + ' - Normal Parser Identity/Deflated/Gzipped HTTP Response Test',
        () => normal_response_1.status == 200 && normal_response_2.status == 200 && normal_response_3.status == 200
    );

    // Retrieve the response bodies of the normal responses
    const [normal_body_1, normal_body_2, normal_body_3] = await Promise.all([
        normal_response_1.buffer(),
        normal_response_2.buffer(),
        normal_response_3.buffer(),
    ]);

    // Assert that all normal bodies match the expected body
    assert_log(
        group,
        candidate + ' - Normal Parser Identity/Deflated/Gzipped Body Integrity Test',
        () =>
            md5_from_buffer(normal_body_1) == expected_md5 &&
            md5_from_buffer(normal_body_2) == expected_md5 &&
            md5_from_buffer(normal_body_3) == expected_md5
    );

    // Wait for all the promises to resolve
    log(group, 'Finished ' + candidate + ' - Parser Compression Test\n');
}

module.exports = {
    test_parser_compression,
};
