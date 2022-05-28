const fs = require('fs');
const { log } = require('./scripts/operators.js');
const { server } = require('./configuration.js');
const { TEST_SERVER } = require('./components/Server.js');
(async () => {
    try {
        // Create a simple GET route to stream a large file with chunked encoding
        TEST_SERVER.get('/stream-unsafe', async (request, response) => {
            // Retrieve the dynamic file path and validate it
            const path = `./content/large-files/${request.query_parameters.file}`;
            if (!fs.existsSync(path)) return response.status(404).send('File Not Found');

            // Stream the file to the client
            response.type('mp3');
            const readable = fs.createReadStream(path);
            readable.pipe(response);
            readable.once('close', () => response.send());
        });

        // Create a simple GET route to stream a large file with chunked encoding
        TEST_SERVER.get('/stream-safe', async (request, response) => {
            // Retrieve the dynamic file path and validate it
            const path = `./content/large-files/${request.query_parameters.file}`;
            if (!fs.existsSync(path)) return response.status(404).send('File Not Found');

            // Stream the file to the client
            response.type('mp3');
            const readable = fs.createReadStream(path);
            return response.stream(readable);
        });

        // Initiate Test API Webserver
        await TEST_SERVER.listen(3000);
        log(
            'TESTING',
            `Successfully Started HyperExpress HTTP Server For Local Testing @ ${server.host}:${server.port}`
        );
    } catch (error) {
        console.log(error);
    }
})();
