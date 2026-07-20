const assert = require('node:assert/strict');
const { assert_log } = require('../../scripts/operators.js');
const { TEST_SERVER } = require('../Server.js');
const HostManager = require('../../../src/components/plugins/HostManager.js');

function test_hostmanager_object() {
    let group = 'Server';
    let candidate = 'HyperExpress.HostManager';

    // Retrieve the host manager
    const manager = TEST_SERVER.hosts;

    let native_missing_handler;
    let native_host_options;
    const isolated = new HostManager({
        uws_instance: {
            missingServerName(handler) {
                native_missing_handler = handler;
            },
            addServerName(hostname, options) {
                native_host_options = [hostname, options];
            },
        },
    });
    const expected_error = new Error('missing host listener failure');
    let observed_error;
    isolated.on('error', (error) => (observed_error = error));
    isolated.on('missing', () => {
        throw expected_error;
    });
    assert.doesNotThrow(() => native_missing_handler('missing.example'));
    assert.equal(observed_error, expected_error);

    let option_reads = 0;
    const accessor_options = {};
    Object.defineProperty(accessor_options, 'passphrase', {
        get() {
            option_reads++;
            if (option_reads > 1) throw new Error('native option getter was read twice');
            return 'safe-passphrase';
        },
    });
    assert.doesNotThrow(() => isolated.add('accessor.example', accessor_options));
    assert.equal(option_reads, 1);
    assert.equal(native_host_options[0], 'accessor.example');
    assert.equal(native_host_options[1].passphrase, 'safe-passphrase');

    assert.throws(() => manager.add('', {}), /non-empty hostname/);
    assert.throws(
        () => manager.add('invalid.example', { cert_file_name: 'certificate.pem' }),
        /cert_file_name and key_file_name/
    );
    assert.throws(
        () => manager.add('invalid.example', { ssl_prefer_low_memory_usage: 1 }),
        /must be a boolean/
    );
    assert.throws(
        () => manager.add('invalid.example', { passphrase: 'bad\0value' }),
        /without null bytes/
    );
    assert.equal(manager.registered['invalid.example'], undefined);

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
