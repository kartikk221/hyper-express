const assert = require('node:assert/strict');
const { once } = require('events');
const http = require('http');

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
        assert.equal(descriptor_reads, 2, 'server descriptors must be read live rather than cached');
        assert.equal(parent.add_child_app_descriptor(descriptor), parent);
        assert.equal(parent.remove_child_app_descriptor(descriptor), parent);
        parent.force_close();
        child.force_close();
    }

    const app = new HyperExpress.Server();
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
        assert.throws(() => late_request.port, /after the Request\/Response has ended/);

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
