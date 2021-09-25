const root = '../../';
const { log, assert_log, random_string } = require(root + 'scripts/operators.js');
const { fetch, server, WebSocket, log_ws_events } = require(root + 'scripts/configuration.js');
const { webserver } = require(root + 'setup/webserver.js');
const endpoint = '/tests/websocket/connect';
const endpoint_url = server.base.replace('http:', 'ws:') + endpoint;
const auth_key = random_string(10);
const connection_pool = {};

function ws_log(message) {
    if (!log_ws_events) return;
    log('WEBSOCKET_ROUTE', message);
}

// Create Backend WS Route with default options
const WebsocketRoute = webserver.ws(endpoint);

// Bind UPGRADE event handler
WebsocketRoute.handle('upgrade', (request, response) => {
    let parameters = request.query_parameters;
    ws_log('UPGRADE -> ' + JSON.stringify(parameters));

    // Authenticate Incoming Request
    if (parameters.key === auth_key) {
        // Upgrade request with some user data
        ws_log('UPGRADING -> ' + JSON.stringify(parameters));
        return response.upgrade({
            id: random_string(20),
            some_data: parameters.some_data,
        });
    } else {
        ws_log('UPGRADE REJECTED -> ' + JSON.stringify(parameters));
        return response.status(403).send();
    }
});

// Bind OPEN event handler
WebsocketRoute.handle('open', (ws) => {
    ws_log('OPEN -> ' + JSON.stringify(ws));
    connection_pool[ws.id] = ws;
    // Echo initial data to user for confirmation
    ws.send(
        JSON.stringify({
            type: 'initial_data',
            id: ws.id,
            some_data: ws.some_data,
        })
    );
});

// Bind MESSAGE event handler
WebsocketRoute.handle('message', (ws, message) => {
    ws_log(
        'MESSAGE -> ' +
            JSON.stringify({
                ws: ws,
                message: message,
            })
    );
    // Echo incoming message to verify data consistency
    ws.send(message);
});

// Bind Close Event Handler
WebsocketRoute.handle('close', (ws, code, message) => {
    ws_log('CLOSE -> ' + JSON.stringify(ws));
    delete connection_pool[ws.id];
});

// Load scenarios
const { test_invalid_auth } = require('./scenarios/invalid_auth.js');
const { test_echo_session } = require('./scenarios/echo_session.js');

async function test_websocket_route() {
    await test_invalid_auth(endpoint_url);
    await test_echo_session(endpoint_url, connection_pool, auth_key);
}

module.exports = {
    test_websocket_route: test_websocket_route,
};
