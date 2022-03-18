const { assert_log, async_wait } = require('../../../scripts/operators.js');
const { HyperExpress, server, EventSource } = require('../../../configuration.js');
const router = new HyperExpress.Router();
const endpoint = '/tests/response';
const scenario_endpoint = '/sse';
const endpoint_url = server.base + endpoint + scenario_endpoint;

const test_data = [
    {
        data: 'asdasdasd',
    },
    {
        data: 'xasdxasdxasd',
    },
    {
        event: 'x3123x123x',
        data: 'xasdasdasdxasd',
    },
    {
        event: '3x123x123x',
        data: '123123x123x12',
    },
    {
        id: '3x12x123x123x',
        event: 'x3123x123',
        data: 'x123x123x123x123',
    },
    {
        data: 'x3123x123x1231',
    },
];

// Create Backend HTTP Route to serve test data
router.get(scenario_endpoint, async (request, response) => {
    // Ensure SSE is available for this request
    if (response.sse) {
        // Open the SSE connection to ensure the client is properly connected
        response.sse.open();

        // Serve the appropriate test data after a short delay
        await async_wait(5);
        test_data.forEach(({ id, event, data }) => {
            // Send with the appropriate parameters based on the test data
            let output;
            if (id && event && data) {
                output = response.sse.send(id, event, data);
            } else if (event && data) {
                output = response.sse.send(event, data);
            } else {
                output = response.sse.send(data);
            }

            if (!output) console.log(`Failed to send SSE message: ${id}, ${event}, ${data}`);
        });

        // Close the SSE connection
        setTimeout(() => response.sse.close(), 5);
    }
});

// Bind router to webserver
const { TEST_SERVER } = require('../../Server.js');
TEST_SERVER.use(endpoint, router);

async function test_response_sse() {
    const group = 'RESPONSE';
    const candidate = 'HyperExpress.Response.sse';

    // Open a new SSE connection to the server
    const sse = new EventSource(endpoint_url);

    // Record all of the incoming events to assert against test data
    const recorded_data = [];
    const recorded_ids = [];
    const record_event = (event, customEvent) => {
        // Determine various properties about this event
        const is_custom_id = Number.isNaN(+event.lastEventId);
        const is_recorded_id = recorded_ids.includes(event.lastEventId);
        const data = event.data;

        // Build the event based on recorded properties
        const payload = {};
        if (is_custom_id && !is_recorded_id) payload.id = event.lastEventId;
        if (customEvent) payload.event = customEvent;
        if (data) payload.data = data;
        recorded_data.push(payload);

        // Remember the event ID for future reference as the last event ID does not reset
        if (is_custom_id && !is_recorded_id) recorded_ids.push(event.lastEventId);
    };

    // Bind custom event handlers from test data array
    test_data.forEach(({ event }) => (event ? sse.addEventListener(event, (ev) => record_event(ev, event)) : null));

    // Bind a catch-all message handler
    sse.onmessage = record_event;

    // Wait for the connection to initially open and disconnect
    await new Promise((resolve) => (sse.onopen = resolve));
    await new Promise((resolve) => (sse.onerror = resolve));
    sse.close();

    // Assert that all test data was received successfully
    assert_log(
        group,
        `${candidate} - Server-Sent Events Communiciation Test`,
        () =>
            test_data.find(
                (test) =>
                    recorded_data.find(
                        (recorded) =>
                            test.id === recorded.id && test.event === recorded.event && test.data === recorded.data
                    ) === undefined
            ) === undefined
    );
}

module.exports = {
    test_response_sse,
};
