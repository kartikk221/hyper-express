import uWebsockets from 'uWebSockets.js';
import { get_simple_html_page } from '../scenarios/simple_html_page.js';

// Initialize an app instance which will be used to create the server
const app = uWebsockets.App();

// Bind the 'simple_html_page' scenario route
app.get('/', (response, request) => {
    // Generate the scenario payload
    const { status, headers, body } = get_simple_html_page({ server_name: 'uWebSockets.js' });

    response.writeStatus(`${status} OK`);
    for (const header_key in headers) {
        const header_value = headers[header_key];
        response.writeHeader(header_key, header_value);
    }

    return response.end(body);
});

export default app;
