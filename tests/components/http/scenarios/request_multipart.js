const path = require('path');
const FormData = require('form-data');
const crypto = require('crypto');
const fs = require('fs');
const { assert_log } = require('../../../scripts/operators.js');
const { HyperExpress, fetch, server } = require('../../../configuration.js');
const router = new HyperExpress.Router();
const endpoint = '/tests/request';
const scenario_endpoint = '/multipart-form';
const endpoint_url = server.base + endpoint + scenario_endpoint;

function md5_from_stream(stream) {
    return new Promise((resolve, reject) => {
        const hash = crypto.createHash('md5');
        stream.on('data', (chunk) => hash.update(chunk));
        stream.on('end', () => resolve(hash.digest('hex')));
    });
}

function md5_from_buffer(buffer) {
    return crypto.createHash('md5').update(buffer).digest('hex');
}

// Create Backend HTTP Route
router.post(scenario_endpoint, async (request, response) => {
    const fields = [];
    const ignore_fields = request.headers['ignore-fields'].split(',');
    const use_async_handler = request.headers['x-use-async-handler'] === 'true';
    const async_handler = async (field) => {
        // Do not process fields which should be ignored
        if (ignore_fields.includes(field)) return;

        // Increment the cursor and store locally
        const object = {
            name: field.name,
            value: field.value,
        };

        // Perform integrity verification if this field is a file
        if (field.file) {
            object.file_name = field.file.name;
            object.hash = await md5_from_stream(field.file.stream);
        }

        // Store the object into the server fields array for client side
        fields.push(object);
    };

    let cursor = -1;
    let in_flight = 0;
    const sync_handler = (field) => {
        // Increment and remember current iteration's cursor
        cursor++;
        const position = cursor;
        const object = {
            name: field.name,
            value: field.value,
        };

        if (field.file) {
            // Asynchronously calculate the md5 hash of the incoming file
            in_flight++;
            object.file_name = field.file.name;
            md5_from_stream(field.file.stream).then((hash) => {
                // Decrement the in flight counter and store hash into the server field object
                in_flight--;
                object.hash = hash;
                fields[position] = object;

                // Send response if no more operations in flight
                if (in_flight < 1) response.json(fields);
            });
        } else {
            // Store the server fields into fields object
            // Send response if no operations are in flight
            fields[position] = object;
        }
    };

    // Handle the incoming fields as multipart with the appropriate handler type
    await request.multipart(use_async_handler ? async_handler : sync_handler);

    // Only respond here if we are using the async handler or we have no inflight operations
    if (use_async_handler || in_flight < 0) return response.json(fields);
});

// Bind router to webserver
const { TEST_SERVER } = require('../../Server.js');
TEST_SERVER.use(endpoint, router);

function get_asset_buffer(file_name) {
    return fs.readFileSync(path.resolve(path.join(__dirname, '../../../content/' + file_name)));
}

async function test_request_multipart(use_async_handler = false) {
    const group = 'REQUEST';
    const candidate = 'HyperExpress.Request.multipart()';

    const ignore_fields = ['file3'];
    const fields = [
        {
            name: 'field1',
            value: 'field1',
        },
        {
            name: 'file1',
            value: get_asset_buffer('example.txt'),
            file_name: 'example.txt',
        },
        {
            name: 'file2',
            value: get_asset_buffer('large-image.jpg'),
        },
        {
            name: 'file3',
            value: get_asset_buffer('test.html'),
            file_name: 'something.html',
        },
        {
            name: 'field2',
            value: Math.random().toString(),
        },
    ].map((field) => {
        if (field.value instanceof Buffer) field.hash = md5_from_buffer(field.value);
        return field;
    });

    // Perform a multipart form request that uploads files and fields
    const form = new FormData();
    fields.forEach(({ name, value, file_name }) => form.append(name, value, file_name));

    // Perform multipart uploading with a synchronous handler
    const response = await fetch(endpoint_url, {
        method: 'POST',
        body: form,
        headers: {
            'ignore-fields': ignore_fields.join(','),
            'x-use-async-handler': use_async_handler.toString(),
        },
    });
    const server_fields = await response.json();

    // Assert comparison of each field in order to match with client-side from server-side
    for (let i = 0; i < fields.length; i++) {
        const client_field = fields[i];
        const server_field = server_fields[i];

        // Only perform assertion if we are not ignoring this field
        if (!ignore_fields.includes(client_field.name))
            assert_log(
                group,
                `${candidate} - Multipart Form Field/File Upload Test (${
                    use_async_handler ? 'Asynchronous' : 'Synchronous'
                } Handler) - ${client_field.name} - ${client_field.value.length} bytes`,
                () => {
                    // Assert that the field names match
                    if (client_field.name !== server_field.name) return false;

                    // Asser that the field values match if this is a non file type field
                    if (typeof client_field.value == 'string' && client_field.value !== server_field.value)
                        return false;

                    // Assert that the file names match if it was supplied
                    if (client_field.file_name && client_field.file_name !== server_field.file_name) return false;

                    // Assert the file hashes match if this is a file type field
                    if (client_field.value instanceof Buffer && client_field.hash !== server_field.hash) return false;

                    return true;
                }
            );
    }
}

module.exports = {
    test_request_multipart,
};
