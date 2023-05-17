const HyperExpress = require('../index.js');
const { log, assert_log } = require('./scripts/operators.js');
const { test_hostmanager_object } = require('./components/features/HostManager.js');
const { test_router_object } = require('./components/router/Router.js');
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
        const group = 'Server';
        const start_time = Date.now();
        await TEST_SERVER.listen(server.port, server.host);
        log('TESTING', `Successfully Started HyperExpress HTTP Server @ ${server.host}:${server.port}`);

        // Assert that the server port matches the configuration port
        assert_log(group, 'Server Listening Port Test', () => +server.port === TEST_SERVER.port);

        // Assert that a server instance with a bad SSL configuration throws an error
        assert_log(group, 'Good SSL Configuration Error Test', () => {
            let result = false;
            try {
                const TEST_GOOD_SERVER = new HyperExpress.Server({
                    key_file_name: './tests/ssl/dummy-key.pem',
                    cert_file_name: './tests/ssl/dummy-cert.pem',
                });
                result = true;
            } catch (error) {
                console.log(error);
                return false;
            }
            return result;
        });

        // Assert that a server instance with a bad SSL configuration throws an error
        assert_log(group, 'Bad SSL Configuration Error Test', () => {
            let result = true;
            try {
                const TEST_BAD_SERVER = new HyperExpress.Server({
                    key_file_name: './error.key',
                    cert_file_name: './error.cert',
                });
                result = false;
            } catch (error) {
                return true;
            }
            return result;
        });

        // Test Server.HostManager Object
        test_hostmanager_object();

        // Test Router Object
        await test_router_object();

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
