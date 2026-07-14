import NanoExpress from 'nanoexpress';
import { get_simple_html_page } from '../scenarios/simple_html_page.js';

// Initialize the Express app instance
const app = NanoExpress();

// Bind the 'simple_html_page' scenario route
app.get('/', (request, response) => {
    // Generate the scenario payload
    const { status, headers, body } = get_simple_html_page({ server_name: 'NanoExpress' });

    response.status(status);
    for (const header_key in headers) {
        const header_value = headers[header_key];
        response.header(header_key, header_value);
    }

    return response.send(body);
});

export default app;
