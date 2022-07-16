const { assert_log } = require('../../scripts/operators.js');
const { TEST_SERVER } = require('../Server.js');

function test_hostmanager_object() {
    let group = 'Server';
    let candidate = 'HyperExpress.HostManager';

    // Retrieve the host manager
    const manager = TEST_SERVER.hosts;

    // Define random host configurations
    const hostnames = [
        [
            'example.com',
            {
                passphrase: 'passphrase',
            },
        ],
        [
            'google.com',
            {
                passphrase: 'passphrase',
            },
        ],
    ];

    // Add the host names to the host manager
    for (const [hostname, options] of hostnames) {
        manager.add(hostname, options);
    }

    // Assert that the host manager contains the host names
    for (const [hostname, options] of hostnames) {
        assert_log(
            group,
            candidate + ` - Host Registeration Test For ${hostname}`,
            () => JSON.stringify(manager.registered[hostname]) === JSON.stringify(options)
        );
    }

    // Remove the host names from the host manager
    for (const [hostname, options] of hostnames) {
        manager.remove(hostname);
    }

    // Assert that the host manager does not contain the host names
    for (const [hostname, options] of hostnames) {
        assert_log(
            group,
            candidate + ` - Host Un-Registeration Test For ${hostname}`,
            () => !(hostname in manager.registered)
        );
    }
}

module.exports = {
    test_hostmanager_object,
};
