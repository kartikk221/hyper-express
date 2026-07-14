import HyperExpress from '../../index.js';
import { get_simple_html_page } from '../scenarios/simple_html_page.js';

// Initialize the Express app instance
const app = new HyperExpress.Server();

// Generate the scenario payload
const { status, headers, body } = get_simple_html_page({ server_name: 'HyperExpress' });

// Bind the 'simple_html_page' scenario route
app.get('/', (request, response) => {
    response.status(status);

    for (const header_key in headers) {
        const header_value = headers[header_key];
        response.header(header_key, header_value);
    }

    response.send(body);
});

export default app;
