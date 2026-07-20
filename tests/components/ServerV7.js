const assert = require('node:assert/strict');
const { once } = require('events');
const http = require('http');
const https = require('https');
const Path = require('path');

const { HyperExpress, Websocket, fetch } = require('../configuration.js');
const { log, async_wait } = require('../scripts/operators.js');

function with_timeout(operation, label, timeout = 1500) {
    let timer;
    return Promise.race([
        operation,
        new Promise((resolve, reject) => {
            timer = setTimeout(() => reject(new Error(`Timed out during ${label}.`)), timeout);
        }),
    ]).finally(() => clearTimeout(timer));
}

async function test_server_v7() {
    assert.throws(
        () => new HyperExpress.Server({ cert_file_name: 'certificate.pem' }),
        /requires non-empty cert_file_name and key_file_name/
    );
    assert.throws(
        () => new HyperExpress.Server({ max_body_length: Number.NaN }),
        /non-negative safe integer/
    );
    assert.throws(
        () => new HyperExpress.Server({ trust_proxy: 'yes' }),
        /must be a boolean/
    );
    {
        const pollution_key = '__hyper_express_polluted__';
        const options = JSON.parse(`{"__proto__":{"${pollution_key}":true}}`);
        const protected_server = new HyperExpress.Server(options);
        assert.equal(Object.prototype[pollution_key], undefined);
        protected_server.force_close();
    }

    {
        const listener = new HyperExpress.Server({ auto_close: false });
        const foreign_listener = new HyperExpress.Server({ auto_close: false });
        await assert.rejects(listener.listen('1.5', '127.0.0.1'), /decimal digits only/);
        await assert.rejects(listener.listen('65536', '127.0.0.1'), /ports must be integers/);
        await assert.rejects(listener.listen('1e3', '127.0.0.1'), /decimal digits only/);
        await assert.rejects(listener.listen('0x50', '127.0.0.1'), /decimal digits only/);
        const listen_socket = await listener.listen('0', '127.0.0.1');
        const foreign_socket = await foreign_listener.listen(0, '127.0.0.1');
        assert.equal(listener.close(foreign_socket), false, 'foreign native listen tokens must be rejected');
        assert.equal(await listener.shutdown(foreign_socket), false);
        assert.ok(listener.port > 0, 'foreign shutdown tokens must leave the owned listener active');
        assert.ok(foreign_listener.port > 0);
        assert.equal(listener.close(listen_socket), true);
        assert.equal(listener.close(listen_socket), false, 'a native listen socket must close once');
        assert.equal(foreign_listener.close(foreign_socket), true);
        listener.force_close();
        foreign_listener.force_close();
    }

    {
        const listener = new HyperExpress.Server({ auto_close: false });
        let retained_socket;
        await assert.rejects(
            listener.listen(0, '127.0.0.1', (listen_socket) => {
                retained_socket = listen_socket;
                throw new Error('listen callback failure');
            }),
            /listen callback failure/
        );
        assert.equal(listener.close(retained_socket), false, 'failed listeners must already be closed');
        listener.force_close();
    }

    {
        const listener = new HyperExpress.Server({ auto_close: false });
        let retained_socket;
        await assert.rejects(
            listener.listen(0, '127.0.0.1', async (listen_socket) => {
                retained_socket = listen_socket;
                await Promise.resolve();
                throw new Error('async listen callback failure');
            }),
            /async listen callback failure/
        );
        assert.equal(listener.close(retained_socket), false);
        listener.force_close();
    }

    {
        const guarded = new HyperExpress.Server({ auto_close: false });
        assert.equal(guarded.publish('no/topic-tree', 'message'), false);
        assert.equal(guarded.num_of_subscribers('no/topic-tree'), 0);
        let raw_closes = 0;
        const raw_request = {
            getQuery() {
                throw new Error('request construction failure');
            },
        };
        const raw_response = { close: () => raw_closes++ };
        assert.doesNotThrow(() => guarded._handle_uws_request({}, raw_request, raw_response));
        assert.equal(raw_closes, 1, 'entry failures must be contained inside the native callback');
        guarded.force_close();
    }

    {
        const secure = new HyperExpress.Server({
            auto_close: false,
            key_file_name: Path.resolve(__dirname, '../ssl/dummy-key.pem'),
            cert_file_name: Path.resolve(__dirname, '../ssl/dummy-cert.pem'),
        });
        secure.get('/protocol', (request, response) =>
            response.json({ protocol: request.protocol, secure: request.secure })
        );
        try {
            assert.equal(secure.is_ssl, true);
            await with_timeout(secure.listen(0, '127.0.0.1'), 'TLS listen');
            const payload = await with_timeout(
                new Promise((resolve, reject) => {
                    https
                        .get(
                            `https://127.0.0.1:${secure.port}/protocol`,
                            { rejectUnauthorized: false },
                            (response) => {
                                const chunks = [];
                                response.on('data', (chunk) => chunks.push(chunk));
                                response.on('end', () => {
                                    try {
                                        resolve(JSON.parse(Buffer.concat(chunks).toString()));
                                    } catch (error) {
                                        reject(error);
                                    }
                                });
                            }
                        )
                        .on('error', reject);
                }),
                'TLS protocol request'
            );
            assert.deepEqual(payload, { protocol: 'https', secure: true });
        } finally {
            secure.force_close();
        }
    }

    {
        const parent = new HyperExpress.Server({ auto_close: false });
        const child = new HyperExpress.Server({ auto_close: false });
        const native_get_descriptor = child.uws_instance.getDescriptor;
        let descriptor_reads = 0;
        child.uws_instance.getDescriptor = function () {
            descriptor_reads++;
            return native_get_descriptor.call(this);
        };
        const descriptor = child.get_descriptor();
        child.get_descriptor();
        assert.ok(descriptor);
        assert.equal(descriptor_reads, 1, 'stable native descriptors must allocate one persistent only');
        assert.throws(() => parent.add_child_app_descriptor(0), /non-zero finite/);
        assert.throws(() => parent.add_child_app_descriptor(Number.NaN), /non-zero finite/);
        assert.throws(() => parent.remove_child_app_descriptor('invalid'), /non-zero finite/);
        assert.equal(parent.add_child_app_descriptor(descriptor), parent);
        assert.equal(parent.remove_child_app_descriptor(descriptor), parent);
        parent.force_close();
        child.force_close();
    }

    const app = new HyperExpress.Server();
    assert.equal(app.is_ssl, false);
    let release_slow;
    let entered_slow;
    let late_request;

    app.get('/slow', async (request, response) => {
        entered_slow();
        await new Promise((resolve) => (release_slow = resolve));
        response.send('complete');
    });
    app.get('/ports', (request, response) =>
        response.json({ port: request.port, proxy_port: request.proxy_port })
    );
    app.get('/late', (request, response) => {
        late_request = request;
        response.send('late');
    });
    app.ws('/socket', () => {});

    const baseline_sigterm_listeners = process.listenerCount('SIGTERM');
    const keep_alive_agent = new http.Agent({ keepAlive: true, maxSockets: 1 });
    try {
        await with_timeout(app.listen(0, '127.0.0.1'), 'initial listen');
        const first_port = app.port;
        assert.ok(first_port > 0);
        assert.equal(process.listenerCount('SIGTERM'), baseline_sigterm_listeners + 1);
        await assert.rejects(app.listen(0, '127.0.0.1'), Error);

        await with_timeout(
            fetch(`http://127.0.0.1:${first_port}/ports`, { agent: keep_alive_agent }).then(
                (response) => response.text()
            ),
            'keep-alive warmup'
        );

        const entered = new Promise((resolve) => (entered_slow = resolve));
        const request = fetch(`http://127.0.0.1:${first_port}/slow`, { agent: keep_alive_agent });
        await with_timeout(entered, 'slow request entry');

        const shutdown = app.shutdown();
        assert.equal(app.shutdown(), shutdown, 'shutdown must be idempotent');
        assert.equal(app.socket, null, 'graceful shutdown must stop accepting before draining');
        assert.throws(() => app.port, /not available/);
        assert.equal(process.listenerCount('SIGTERM'), baseline_sigterm_listeners);

        release_slow();
        assert.equal(await with_timeout(request.then((response) => response.text()), 'slow response'), 'complete');
        assert.equal(await with_timeout(shutdown, 'graceful HTTP drain'), true);
        assert.equal(app.close(), false);

        await assert.rejects(
            with_timeout(
                fetch(`http://127.0.0.1:${first_port}/ports`, { agent: keep_alive_agent }),
                'post-shutdown keep-alive rejection'
            )
        );

        await with_timeout(app.listen(0, '127.0.0.1'), 'relisten');
        const second_port = app.port;

        const ports = await with_timeout(
            fetch(`http://127.0.0.1:${second_port}/ports`).then((response) => response.json()),
            'port request'
        );
        assert.ok(ports.port > 0);
        assert.ok(Number.isInteger(ports.proxy_port));

        assert.equal(
            await with_timeout(
                fetch(`http://127.0.0.1:${second_port}/late`).then((response) => response.text()),
                'late request'
            ),
            'late'
        );
        assert.ok(late_request.port > 0);
        assert.equal(late_request.ip, '127.0.0.1');
        assert.ok(Number.isInteger(late_request.proxy_port));
        assert.equal(late_request.proxy_ip, '');

        const client = new Websocket(`ws://127.0.0.1:${second_port}/socket`);
        await with_timeout(once(client, 'open'), 'WebSocket open');
        const client_closed = once(client, 'close');

        assert.equal(await with_timeout(app.shutdown(), 'WebSocket-preserving shutdown'), true);
        await async_wait(5);
        assert.equal(client.readyState, Websocket.OPEN, 'graceful HTTP shutdown must retain WebSockets');

        assert.equal(app.force_close(), true);
        await with_timeout(client_closed, 'forced WebSocket close');
        assert.equal(app.close(), false);
        assert.equal(process.listenerCount('SIGTERM'), baseline_sigterm_listeners);
    } finally {
        keep_alive_agent.destroy();
        app.force_close();
    }

    log('SERVER', 'Verified v7 Relisten, Graceful Drain, Force Close, Ports, And Descriptors');
}

module.exports = { test_server_v7 };
