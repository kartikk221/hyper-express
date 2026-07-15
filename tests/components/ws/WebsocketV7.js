const assert = require('node:assert/strict');
const { Readable } = require('stream');

const HyperWebsocket = require('../../../src/components/ws/Websocket.js');
const { HyperExpress, Websocket: ClientWebsocket, server } = require('../../configuration.js');
const { log } = require('../../scripts/operators.js');
const { TEST_SERVER } = require('../Server.js');

const endpoint = '/websocket-v7';
const endpoint_url = `${server.base.replace('http', 'ws')}${endpoint}`;

TEST_SERVER.ws(
    endpoint + '/arraybuffer',
    {
        message_type: 'ArrayBuffer',
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

TEST_SERVER.ws(endpoint + '/remote-port', (ws) => {
    const status = ws.send(String(ws.remote_port));
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

    getRemoteAddressAsText() {
        return array_buffer('127.0.0.1');
    }

    getRemotePort() {
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
        return 0;
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
        assert.equal(ws.ip, '127.0.0.1');
        assert.equal(ws.atomic(() => Promise.reject(new Error('atomic failure'))), ws);
        await Promise.resolve();
        await Promise.resolve();
        assert.equal(errors[0].message, 'atomic failure');
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
        const ws = new HyperWebsocket(raw);
        let resolved = false;
        const operation = ws
            .stream(Readable.from([Buffer.from('a'), Buffer.from('b'), Buffer.from('c')]))
            .then(() => (resolved = true));

        await wait_for(() => raw.first.length === 1);
        ws.emit('drain');
        await wait_for(() => raw.last.length === 1);
        assert.equal(resolved, false, 'the final backpressured fragment must be awaited');
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
        const ws = new HyperWebsocket(raw);
        const writable = ws.writable;
        writable.write('a');
        writable.write('b');
        writable.end('c');
        await new Promise((resolve, reject) => {
            writable.once('finish', resolve);
            writable.once('error', reject);
        });

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

    const retained = await exchange('/arraybuffer', (client) => client.send(Buffer.from('retained')));
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

    const remote_port = await exchange('/remote-port');
    assert.ok(Number(remote_port.messages[0].toString()) > 0);

    log('WEBSOCKET', 'Verified v7 Fragment, Error, Event, Port, And Retained-Message Behavior');
}

module.exports = { test_websocket_v7 };
