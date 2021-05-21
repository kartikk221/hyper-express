const { log } = require('./scripts/operators.js');
const { initiate_http_server } = require('./setup/webserver.js');
const { test_request_object } = require('./components/http/Request.js');
const { test_response_object } = require('./components/http/Response.js');
const { test_session_object } = require('./components/session/Session.js');
const { test_websocket_route } = require('./components/ws/WebsocketRoute.js');

(async () => {
    try {
        // Initiate Test API Webserver
        await initiate_http_server();

        // Test Request Object
        await test_request_object();

        // Test Response Object
        await test_response_object();

        // Test Session Object
        await test_session_object();

        // Test Websocket & WebsocketRoute Object
        await test_websocket_route();

        log(
            'TESTING',
            'Successfully Tested All Specified Tests For HyperExpress!'
        );
        process.exit();
    } catch (error) {
        console.log(error);
    }
})();
