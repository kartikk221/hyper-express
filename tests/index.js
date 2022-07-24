const { log, assert_log } = require('./scripts/operators.js');
const { test_hostmanager_object } = require('./components/features/HostManager.js');
const { test_request_object } = require('./components/http/Request.js');
const { test_response_object } = require('./components/http/Response.js');
const { test_websocket_route } = require('./components/ws/WebsocketRoute.js');
const { test_session_middleware } = require('./middlewares/hyper-express-session/index.js');
const { test_websocket_component } = require('./components/ws/Websocket.js');
// const { test_body_parser_middleware } = require('./middlewares/hyper-express-body-parser/index.js');

const { server } = require('./configuration.js');
const { TEST_SERVER } = require('./components/Server.js');
(async () => {
    try {
        // Initiate Test API Webserver
        const start_time = Date.now();
        await TEST_SERVER.listen(server.port, server.host);
        log('TESTING', `Successfully Started HyperExpress HTTP Server @ ${server.host}:${server.port}`);

        // Assert that the server port matches the configuration port
        assert_log(
            'Server',
            'Server.port - Server Listening Port Accuracy Test',
            () => +server.port === TEST_SERVER.port
        );

        // Test Server.HostManager Object
        test_hostmanager_object();

        // Test Request Object
        await test_request_object();

        // Test Response Object
        await test_response_object();

        // Test WebsocketRoute Object
        await test_websocket_route();

        // Test Websocket Polyfill Object
        await test_websocket_component();

        // Test SessionEngine Middleware
        await test_session_middleware();

        // Test BodyParser Middleware
        // await test_body_parser_middleware();

        log('TESTING', `Successfully Tested All Specified Tests For HyperExpress In ${Date.now() - start_time}ms!`);
        process.exit();
    } catch (error) {
        console.log(error);
    }
})();
