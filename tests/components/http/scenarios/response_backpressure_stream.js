const path = require('path');
const crypto = require('crypto');
const fs = require('fs');
const { assert_log } = require('../../../scripts/operators.js');
const { HyperExpress, server } = require('../../../configuration.js');
const router = new HyperExpress.Router();
const endpoint = '/tests/response';
const scenario_endpoint = '/backpressure-stream';
const endpoint_url = server.base + endpoint + scenario_endpoint;
const nativeHttp = server.base.startsWith('http:') ? require('http') : require('https');
const test_file_path = path.resolve(path.join(__dirname, '../../../content/large-image.jpg'));
const test_file_stats = fs.statSync(test_file_path);
const backpressure_range_ms = [1, 15];

// Create Backend HTTP Route
router.get(scenario_endpoint, (request, response) => {
    // Determine the streaming method to use
    const method = request.headers['x-streaming-method'];
    const readable = fs.createReadStream(test_file_path);
    switch (method) {
        case 'content-length':
            // Stream the file with a total size of the file
            return response.stream(readable, test_file_stats.size);
        case 'chunked-encoding':
            // Stream the file with a chunked encoding
            return response.stream(readable);
        default:
            // Simply pipe the file to the response
            return readable.pipe(response);
    }
});

// Bind router to webserver
const { TEST_SERVER } = require('../../Server.js');
TEST_SERVER.use(endpoint, router);

async function test_response_backpressure_stream() {
    const group = 'RESPONSE';
    const candidate = 'HyperExpress.Response';

    // Determine the expected buffer and md5 hash
    const expected_buffer = fs.readFileSync(test_file_path);
    const expected_hash = crypto.createHash('md5').update(expected_buffer).digest('hex');

    // Test all three streaming methods in parallel
    const promises = ['content-length', 'chunked-encoding', 'pipe'].map(
        (method) =>
            new Promise((resolve) => {
                // Perform the request
                const request = nativeHttp.request(
                    endpoint_url,
                    {
                        method: 'GET',
                        timeout: 2500, // Should never really take this long
                        headers: {
                            'x-streaming-method': method,
                        },
                    },
                    (response) => {
                        // Record all incoming data chunks
                        const chunks = [];
                        response.on('data', (chunk) => {
                            // Simulate backpressure by pausing/resuming request after a random amount of time
                            const [min, max] = backpressure_range_ms;
                            const backpressure_ms = min + Math.floor(Math.random() * (max - min));
                            setTimeout(() => response.resume(), backpressure_ms);
                            response.pause();

                            // Push the chunk to the chunks array
                            chunks.push(chunk);
                        });

                        // Compile the body and assert it against the expected hash
                        response.on('end', () => {
                            // Determine the buffer and md5 hash
                            const received_buffer = Buffer.concat(chunks);
                            const received_hash = crypto.createHash('md5').update(received_buffer).digest('hex');

                            // Assert the received hash against the expected hash
                            assert_log(
                                group,
                                `${candidate} Simulated Backpressure Stream Using '${method}' Method Over ${chunks.length} Chunks`,
                                () => expected_hash === received_hash
                            );

                            // Resolve the promise
                            resolve();
                        });
                    }
                );

                // Send the request
                request.end();
            })
    );

    // Wait for all promises to resolve
    await Promise.all(promises);
}

module.exports = {
    test_response_backpressure_stream,
};
