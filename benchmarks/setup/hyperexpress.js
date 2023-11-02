import HyperExpress from '../../index.js';
import { get_simple_html_page } from '../scenarios/simple_html_page.js';

// Initialize the Express app instance
const app = new HyperExpress.Server();

// Generate the scenario payload
const { status, headers, body } = get_simple_html_page({ server_name: 'HyperExpress' });

// Bind the 'simple_html_page' scenario route
app.get('/', (request, response) => {
    // Write the status and headers
    response.status(status);

    for (const key in headers) response.header(key, headers[key]);

    // Write the body and end the response
    response.send(body);
});

export default app;
