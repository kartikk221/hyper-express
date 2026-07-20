const assert = require('node:assert/strict');
const { Readable } = require('stream');

const HyperWebsocket = require('../../../src/components/ws/Websocket.js');
const WebsocketRoute = require('../../../src/components/ws/WebsocketRoute.js');
const { HyperExpress, Websocket: ClientWebsocket, server } = require('../../configuration.js');
const { log } = require('../../scripts/operators.js');
const { TEST_SERVER } = require('../Server.js');

const endpoint = '/websocket-v7';
const endpoint_url = `${server.base.replace('http', 'ws')}${endpoint}`;

TEST_SERVER.ws(
    endpoint + '/arraybuffer-safe',
    {
        message_type: 'ArrayBufferSafe',
        close_on_backpressure_limit: false,
        max_lifetime: 0,
        send_pings_automatically: false,
    },
    (ws) => {
        ws.on('message', async (message, is_binary) => {
            await Promise.resolve();
            const status = ws.send(message, is_binary);
            if (status) ws.close();
        });
    }
);

TEST_SERVER.ws(endpoint + '/subscription', (ws) => {
    ws.on('subscription', (topic, new_count, old_count) => {
        const status = ws.send(JSON.stringify({ topic, new_count, old_count }));
        if (status) ws.close();
    });
    ws.subscribe('v7/topic');
});

TEST_SERVER.ws(endpoint + '/listener-error', (ws) => {
    ws.on('error', (error) => {
        const status = ws.send(error.message);
        if (status) ws.close();
    });
    ws.on('message', async () => {
        await Promise.resolve();
        throw new Error('async listener failure');
    });
});

TEST_SERVER.ws(endpoint + '/unhandled-error', () => {
    throw new Error('unhandled open failure');
});

TEST_SERVER.ws(endpoint + '/empty-stream', async (ws) => {
    await ws.stream(Readable.from([]));
    ws.close();
});

TEST_SERVER.upgrade(endpoint + '/remote-address', (request, response) => {
    setImmediate(() => response.upgrade());
});

TEST_SERVER.ws(endpoint + '/remote-address', (ws) => {
    const status = ws.send(JSON.stringify({ ip: ws.ip, port: ws.remote_port }));
    if (status) ws.close();
});

function array_buffer(value) {
    return Uint8Array.from(Buffer.from(value)).buffer;
}

class FakeSocket {
    context = { test: true };
    sends = [];
    first = [];
    middle = [];
    last = [];
    ends = [];
    closes = 0;
    send_statuses = [];
    first_statuses = [];
    middle_statuses = [];
    last_statuses = [];
    remote_port_calls = 0;
    remote_address_calls = 0;
    buffered_amount = 0;

    getRemoteAddressAsText() {
        this.remote_address_calls++;
        return array_buffer('127.0.0.1');
    }

    getRemotePort() {
        this.remote_port_calls++;
        return 43210;
    }

    cork(handler) {
        handler();
        return this;
    }

    send(message, is_binary, compress) {
        this.sends.push([Buffer.from(message), is_binary, compress]);
        return this.send_statuses.shift() ?? 1;
    }

    ping() {
        return 1;
    }

    end(code, message) {
        this.ends.push([code, message]);
    }

    close() {
        this.closes++;
    }

    sendFirstFragment(message, is_binary, compress) {
        this.first.push([Buffer.from(message), is_binary, compress]);
        return this.first_statuses.shift() ?? 1;
    }

    sendFragment(message, compress) {
        this.middle.push([Buffer.from(message), compress]);
        return this.middle_statuses.shift() ?? 1;
    }

    sendLastFragment(message, compress) {
        this.last.push([Buffer.from(message), compress]);
        return this.last_statuses.shift() ?? 1;
    }

    getBufferedAmount() {
        return this.buffered_amount;
    }

    getTopics() {
        return [];
    }

    isSubscribed() {
        return false;
    }

    subscribe() {
        return true;
    }

    unsubscribe() {
        return true;
    }

    publish() {
        return true;
    }
}

function capture_native_route_options(options = {}) {
    let captured;
    const app = {
        _options: { streaming: {}, max_body_length: 1024 },
        routes: { upgrade: {} },
        _id: 0,
        _get_incremented_id() {
            return ++this._id;
        },
        _create_route(route) {
            const companion = { ...route };
            this.routes.upgrade[route.pattern] = companion;
            return companion;
        },
        uws_instance: {
            ws(pattern, native_options) {
                captured = native_options;
            },
        },
    };

    new WebsocketRoute({ app, pattern: '/capture', handler() {}, options });
    return captured;
}

async function wait_for(predicate) {
    const expires = Date.now() + 1000;
    while (!predicate()) {
        if (Date.now() > expires) throw new Error('Timed out waiting for WebSocket unit state.');
        await new Promise((resolve) => setImmediate(resolve));
    }
}

async function test_websocket_units() {
    {
        const raw = new FakeSocket();
        const ws = new HyperWebsocket(raw);
        const errors = [];
        ws.on('error', (error) => errors.push(error));

        raw.send_statuses.push(2);
        assert.equal(ws.send('dropped'), 2);
        assert.equal(ws.remote_port, 43210);
        assert.equal(ws.remote_port, 43210);
        assert.equal(raw.remote_port_calls, 1, 'stable native port data must be read only once');
        assert.equal(ws.ip, '127.0.0.1');
        assert.equal(raw.remote_address_calls, 1, 'stable native address data must be read only once');
        assert.equal(ws.atomic(() => Promise.reject(new Error('atomic failure'))), ws);
        await Promise.resolve();
        await Promise.resolve();
        assert.equal(errors[0].message, 'atomic failure');
    }

    {
        const raw = new FakeSocket();
        raw.remote_ip = '203.0.113.10';
        raw.remote_port = 54321;
        const ws = new HyperWebsocket(raw);

        assert.equal(ws.ip, '203.0.113.10');
        assert.equal(ws.remote_port, 54321);
        assert.equal(raw.remote_address_calls, 0, 'upgrade metadata must bypass the broken native address getter');
        assert.equal(raw.remote_port_calls, 0, 'upgrade metadata must bypass the native port getter');
    }

    {
        const parser_host = Object.create(WebsocketRoute.prototype);
        const volatile = array_buffer('volatile');
        const zero_copy = parser_host._get_message_parser('ArrayBuffer')(volatile);
        const retained = parser_host._get_message_parser('ArrayBufferSafe')(volatile);

        assert.equal(zero_copy, volatile, 'ArrayBuffer must preserve the v6 zero-copy contract');
        assert.notEqual(retained, volatile, 'ArrayBufferSafe must copy volatile native memory');
        assert.equal(Buffer.from(retained).toString(), 'volatile');
        assert.throws(() => parser_host._get_message_parser('invalid'), /ArrayBufferSafe/);
    }

    {
        const defaults = capture_native_route_options();
        assert.equal('closeOnBackpressureLimit' in defaults, false);
        assert.equal('maxLifetime' in defaults, false);
        assert.equal('sendPingsAutomatically' in defaults, false);

        const explicit = capture_native_route_options({
            close_on_backpressure_limit: false,
            max_lifetime: 0,
            send_pings_automatically: false,
        });
        assert.equal(explicit.closeOnBackpressureLimit, false);
        assert.equal(explicit.maxLifetime, 0);
        assert.equal(explicit.sendPingsAutomatically, false);
    }

    {
        const raw = new FakeSocket();
        const ws = new HyperWebsocket(raw);
        ws.on('message', () => {
            throw new Error('unhandled listener failure');
        });

        assert.doesNotThrow(() => ws.emit('message', 'value'));
        assert.deepEqual(raw.ends, [[1011, 'Internal server error']]);
    }

    {
        const raw = new FakeSocket();
        raw.first_statuses.push(0);
        raw.middle_statuses.push(1);
        raw.last_statuses.push(0);
        raw.buffered_amount = 128 * 1024;
        const ws = new HyperWebsocket(raw);
        let resolved = false;
        const operation = ws
            .stream(Readable.from([Buffer.from('a'), Buffer.from('b'), Buffer.from('c')]))
            .then(() => (resolved = true));

        await wait_for(() => raw.first.length === 1);
        raw.buffered_amount = 0;
        ws.emit('drain');
        raw.buffered_amount = 128 * 1024;
        await wait_for(() => raw.last.length === 1);
        assert.equal(resolved, false, 'the final backpressured fragment must be awaited');
        raw.buffered_amount = 0;
        ws.emit('drain');
        await operation;

        assert.deepEqual(raw.first.map(([chunk]) => chunk.toString()), ['a']);
        assert.deepEqual(raw.middle.map(([chunk]) => chunk.toString()), ['b']);
        assert.deepEqual(raw.last.map(([chunk]) => chunk.toString()), ['c']);
    }

    {
        const raw = new FakeSocket();
        const ws = new HyperWebsocket(raw);
        await ws.stream(Readable.from([]));
        assert.equal(raw.sends.length, 1);
        assert.equal(raw.sends[0][0].byteLength, 0);
    }

    {
        const raw = new FakeSocket();
        raw.send_statuses.push(0);
        raw.buffered_amount = 1;
        const ws = new HyperWebsocket(raw);
        await ws.stream(Readable.from([Buffer.from('small queued message')]));
        assert.equal(raw.sends.length, 1, 'small residual native buffering must not deadlock');
    }

    {
        const raw = new FakeSocket();
        raw.send_statuses.push(2);
        const ws = new HyperWebsocket(raw);
        await assert.rejects(ws.stream(Readable.from([])), {
            code: 'ERR_WEBSOCKET_MESSAGE_DROPPED',
        });
    }

    {
        const expected = new Error('source failed');
        const readable = new Readable({
            read() {
                this.destroy(expected);
            },
        });
        const ws = new HyperWebsocket(new FakeSocket());
        await assert.rejects(ws.stream(readable), (error) => error === expected);
    }

    {
        const readable = new Readable({ read() {} });
        const ws = new HyperWebsocket(new FakeSocket());
        const operation = ws.stream(readable);
        await Promise.resolve();
        ws._destroy();
        ws.emit('close', 1000, 'closed');
        await assert.rejects(operation, { code: 'ERR_WEBSOCKET_CLOSED' });
    }

    {
        const raw = new FakeSocket();
        raw.first_statuses.push(0);
        raw.middle_statuses.push(0);
        raw.last_statuses.push(0);
        raw.buffered_amount = 128 * 1024;
        const ws = new HyperWebsocket(raw);
        const writable = ws.writable;
        let finished = false;
        writable.write('a');
        writable.write('b');
        writable.end('c');
        const completion = new Promise((resolve, reject) => {
            writable.once('finish', resolve);
            writable.once('error', reject);
        }).then(() => (finished = true));

        await wait_for(() => raw.first.length === 1);
        assert.equal(finished, false);
        raw.buffered_amount = 0;
        ws.emit('drain');
        raw.buffered_amount = 128 * 1024;
        await wait_for(() => raw.middle.length === 1);
        assert.equal(finished, false);
        raw.buffered_amount = 0;
        ws.emit('drain');
        raw.buffered_amount = 128 * 1024;
        await wait_for(() => raw.last.length === 1);
        assert.equal(finished, false, 'writable finish must await its final fragment drain');
        raw.buffered_amount = 0;
        ws.emit('drain');
        await completion;

        assert.deepEqual(raw.first.map(([chunk]) => chunk.toString()), ['a']);
        assert.deepEqual(raw.middle.map(([chunk]) => chunk.toString()), ['b']);
        assert.deepEqual(raw.last.map(([chunk]) => chunk.toString()), ['c']);

        const empty = ws.writable;
        empty.end();
        await new Promise((resolve, reject) => {
            empty.once('finish', resolve);
            empty.once('error', reject);
        });
        assert.equal(raw.sends.at(-1)[0].byteLength, 0);
    }

    {
        const raw = new FakeSocket();
        raw.first_statuses.push(0);
        raw.buffered_amount = 128 * 1024;
        const ws = new HyperWebsocket(raw);
        const writable = ws.writable;
        writable.write('a');
        writable.write('b');
        await wait_for(() => raw.first.length === 1);

        const failed = new Promise((resolve) => writable.once('error', resolve));
        ws._destroy();
        ws.emit('close', 1000, 'closed');
        const error = await failed;
        assert.equal(error.code, 'ERR_WEBSOCKET_CLOSED');
        assert.equal(writable.destroyed, true);
        assert.equal(raw.first.length, 1, 'socket close must not retry a pending fragment');
    }
}

function exchange(path, on_open) {
    return new Promise((resolve, reject) => {
        const client = new ClientWebsocket(endpoint_url + path);
        const messages = [];
        const timeout = setTimeout(() => reject(new Error(`WebSocket exchange timed out: ${path}`)), 1000);
        client.on('open', () => {
            if (on_open) on_open(client);
        });
        client.on('message', (message) => messages.push(Buffer.from(message)));
        client.on('error', reject);
        client.on('close', (code) => {
            clearTimeout(timeout);
            resolve({ code, messages });
        });
    });
}

async function test_websocket_v7() {
    await test_websocket_units();

    const retained = await exchange('/arraybuffer-safe', (client) => client.send(Buffer.from('retained')));
    assert.equal(retained.messages[0].toString(), 'retained');

    const subscription = await exchange('/subscription');
    assert.deepEqual(JSON.parse(subscription.messages[0].toString()), {
        topic: 'v7/topic',
        new_count: 1,
        old_count: 0,
    });

    const listener_error = await exchange('/listener-error', (client) => client.send('trigger'));
    assert.equal(listener_error.messages[0].toString(), 'async listener failure');

    const unhandled = await exchange('/unhandled-error');
    assert.equal(unhandled.code, 1011);

    const empty = await exchange('/empty-stream');
    assert.equal(empty.messages.length, 1);
    assert.equal(empty.messages[0].byteLength, 0);

    const remote_address = await exchange('/remote-address');
    const { ip, port } = JSON.parse(remote_address.messages[0].toString());
    assert.equal(ip, '127.0.0.1');
    assert.ok(port > 0);

    log('WEBSOCKET', 'Verified v7 Fragment, Error, Addresses, Opt-In Options, And Message Lifetimes');
}

module.exports = { test_websocket_v7 };
