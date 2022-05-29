const fs = require('fs');
const crypto = require('crypto');
const { log } = require('./scripts/operators.js');
const { server, fetch } = require('./configuration.js');
const { TEST_SERVER } = require('./components/Server.js');

(async () => {
    try {
        // Define information about the test file
        const test_file_path = './content/large-files/song.mp3';
        const test_file_checksum = crypto.createHash('md5').update(fs.readFileSync(test_file_path)).digest('hex');
        const test_file_stats = fs.statSync(test_file_path);

        // Create a simple GET route to stream a large file with chunked encoding
        TEST_SERVER.get('/stream', async (request, response) => {
            // Write appropriate headers
            response.header('md5-checksum', test_file_checksum).type('mp3');

            // Stream the file to the client
            const readable = fs.createReadStream(test_file_path);

            // Stream the file to the client with a random streaming method
            const random = Math.floor(Math.random() * 3);
            switch (random) {
                case 0:
                    // Use Chunked Transfer
                    readable.once('close', () => response.send());
                    readable.pipe(response);
                    break;
                case 1:
                    // Use Chunked-Transfer With Built In Streaming
                    response.stream(readable);
                    break;
                case 2:
                    // Use Streaming With Content-Length
                    response.stream(readable, test_file_stats.size);
                    break;
            }
        });

        // Initiate Test API Webserver
        await TEST_SERVER.listen(server.port, server.host);
        log(
            'TESTING',
            `Successfully Started HyperExpress HTTP Server For Local Testing @ ${server.host}:${server.port}`
        );

        // Perform a stress test of the endpoint
        let completed = 0;
        let start_ts = Date.now();
        const test_endpoint = async () => {
            // Make a request to the endpoint
            const response = await fetch(`${server.base}/stream`);

            // Retrieve both the expected and received checksums
            const expected_checksum = response.headers.get('md5-checksum');
            const received_checksum = crypto
                .createHash('md5')
                .update(await response.buffer())
                .digest('hex');

            // Assert that the checksums match
            if (expected_checksum !== received_checksum)
                throw new Error(
                    `Checksums Do Not Match! Expected: ${expected_checksum} Received: ${received_checksum}`
                );
            completed++;
        };

        setInterval(test_endpoint, 0);
        setInterval(
            () => console.log(`Requests/Second: ${(completed / ((Date.now() - start_ts) / 1000)).toFixed(2)}`),
            1000
        );
    } catch (error) {
        console.log(error);
    }
})();
