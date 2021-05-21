const root = '../../../';
const { WebSocket } = require(root + 'scripts/configuration.js');
const { log } = require(root + 'scripts/operators.js');

function test_invalid_auth(endpoint_url) {
    return new Promise((resolve, reject) => {
        const group = 'WEBSOCKET';
        const candidate = 'HyperExpress.ws';
        log(group, 'Testing ' + candidate + ' - Invalid Authentication Test');

        let rejected = false;
        let proper_error = false;
        const ws = new WebSocket(endpoint_url);

        // Open event is bad behavior as this should be an upgrade rejection
        ws.on('open', () => {
            rejected = true;
            reject(
                candidate +
                    ' - Invalid Authentication Test - Connection Opened But Upgrade Rejection Was Expected'
            );
        });

        // Enforce an 'Unexpected 403' error
        ws.on('error', (error) => {
            error = error.toString();
            if (error.indexOf('Unexpected server response: 403') > -1) {
                proper_error = true;
            } else {
                proper_error = error;
            }
        });

        // Handle proper closure of connection
        ws.on('close', () => {
            if (rejected) return;
            if (typeof proper_error == 'string' || proper_error === false)
                return reject(proper_error);

            log(
                group,
                'Websocket Connection Upgrade Rejected As Expected With 403 Status Code'
            );
            log(
                group,
                'Finished Testing ' +
                    candidate +
                    ' - Invalid Authentication Test\n'
            );
            resolve();
        });
    });
}

module.exports = {
    test_invalid_auth: test_invalid_auth,
};
