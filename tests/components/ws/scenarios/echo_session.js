const root = '../../../';
const { WebSocket } = require(root + 'scripts/configuration.js');
const { log, assert_log, random_string } = require(root +
    'scripts/operators.js');

function test_echo_session(endpoint_url, connection_pool, auth_key) {
    return new Promise((resolve, reject) => {
        const group = 'WEBSOCKET';
        const candidate = 'HyperExpress.ws';
        const echo_data = random_string(20);
        const some_data = random_string(20);
        let rejected = false;
        let opened = false;
        log(group, 'Testing ' + candidate + ' - Echo Session Test');

        log(
            group,
            `Creating WebSocket Connection With key[${auth_key}] some_data[${some_data}]`
        );
        const ws = new WebSocket(
            endpoint_url + `?key=${auth_key}&some_data=${some_data}`
        );

        // Log a connection open as a successful checkpoint
        ws.on('open', () => {
            opened = true;
            log(group, 'Successfully Connected With WebSockets!');
        });

        // Handle incoming JSON Messages From Server
        ws.on('message', (message) => {
            try {
                message = JSON.parse(message);

                // Handle Incoming Initial Data
                if (message.type === 'initial_data') {
                    assert_log(
                        group,
                        candidate + ' - Initial Data Test',
                        () => {
                            let id_test =
                                typeof connection_pool[message.id] == 'object';
                            let some_data_test =
                                message.some_data === some_data;
                            return opened && id_test && some_data_test;
                        }
                    );

                    // Send test echo message
                    return ws.send(
                        JSON.stringify({
                            type: 'echo_test',
                            data: echo_data,
                        })
                    );
                }

                if (message.type === 'echo_test') {
                    assert_log(
                        group,
                        candidate + ' - Echo Data Test',
                        () => message.data === echo_data
                    );

                    // Close websocket connection
                    return ws.close();
                }
            } catch (error) {
                rejected = true;
                reject(error);
            }
        });

        // No errors should be picked up
        ws.on('error', (error) => {
            rejected = true;
            reject(error);
        });

        // Handle proper closure of connection
        ws.on('close', () => {
            if (rejected) return;
            setTimeout(
                (resolve_test) => {
                    assert_log(
                        group,
                        candidate + ' - Graceful Close Test',
                        () => Object.keys(connection_pool).length == 0
                    );

                    log(
                        group,
                        'Finished Testing ' +
                            candidate +
                            ' - Echo Session Test\n'
                    );
                    resolve_test();
                },
                100,
                resolve
            );
        });
    });
}

module.exports = {
    test_echo_session: test_echo_session,
};
