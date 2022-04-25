import uWebsockets from 'uWebSockets.js';
import { get_simple_html_page } from '../scenarios/simple_html_page.js';

// Initialize an app instance which will be used to create the server
const app = uWebsockets.App();

// Bind the 'simple_html_page' scenario route
app.get('/', (response, request) => {
    // Generate the scenario payload
    const { status, headers, body } = get_simple_html_page({ server_name: 'uWebSockets.js' });

    // Write the status and headers
    response.writeStatus(`${status} OK`);
    Object.keys(headers).forEach((header) => response.writeHeader(header, headers[header]));

    // Write the body and end the response
    return response.end(body);
});

export default app;
