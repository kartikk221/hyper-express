const assert = require('node:assert/strict');
const { Writable } = require('stream');
const Request = require('../../../src/components/http/Request.js');
const { log } = require('../../scripts/operators.js');

function create_raw_request(headers) {
    return {
        getQuery: () => '',
        getUrl: () => '/v7-body-lifecycle',
        getMethod: () => 'post',
        getParameter: () => '',
        forEach: (handler) => {
            for (const [name, value] of Object.entries(headers)) handler(name, value);
        },
    };
}

function create_request(headers, options = {}) {
    const callbacks = {};
    const native = {
        pauses: 0,
        resumes: 0,
        onDataV2(handler) {
            callbacks.data = handler;
            return this;
        },
        pause() {
            this.pauses++;
        },
        resume() {
            this.resumes++;
        },
        remote_port_calls: 0,
        proxy_port_calls: 0,
        remote_address_calls: 0,
        proxy_address_calls: 0,
        getRemotePort() {
            this.remote_port_calls++;
            return 43210;
        },
        getProxiedRemotePort() {
            this.proxy_port_calls++;
            return 54321;
        },
        getRemoteAddressAsText() {
            this.remote_address_calls++;
            return array_buffer(options.remote_ip ?? '');
        },
        getProxiedRemoteAddressAsText() {
            this.proxy_address_calls++;
            return array_buffer('');
        },
    };
    const app = {
        _options: {
            fast_abort: false,
            trust_proxy: options.trust_proxy ?? false,
            max_body_buffer: options.max_body_buffer ?? 1,
            streaming: options.streaming ?? {},
        },
    };
    const route = {
        app,
        method: 'POST',
        path: '/v7-body-lifecycle',
        path_parameters_key: [],
        streaming: options.streaming ?? {},
    };
    const request = new Request(route, create_raw_request(headers));
    request._raw_response = native;
    // Mirror Server._handle_uws_request: native connection values are request-entry data.
    request._capture_connection_metadata();

    const response = {
        initiated: false,
        sent: 0,
        status_code: undefined,
        status(code) {
            this.status_code = code;
            return this;
        },
        send() {
            this.initiated = true;
            this.sent++;
            return this;
        },
        close() {
            this.initiated = true;
        },
        throw(error) {
            this.error = error;
            return this;
        },
    };

    return { callbacks, native, request, response };
}

function array_buffer(value) {
    return Uint8Array.from(Buffer.from(value)).buffer;
}

async function wait_for(predicate, label) {
    const expires = Date.now() + 1000;
    while (!predicate()) {
        if (Date.now() > expires) throw new Error(`Timed out waiting for ${label}.`);
        await new Promise((resolve) => setImmediate(resolve));
    }
}

async function test_request_body_v7() {
    {
        const { callbacks, native, request, response } = create_request({
            'content-length': '4',
        });
        assert.equal(request._body_parser_run(response, 8), true);
        assert.equal(typeof callbacks.data, 'function');

        const first = request.buffer();
        const second = request.buffer();
        assert.equal(first, second, 'buffer() must cache its in-flight promise');

        callbacks.data(array_buffer('ab'), 2n);
        request.pause();
        callbacks.data(array_buffer('c'), 1n); // uWS may emit this despite pause()
        callbacks.data(array_buffer('d'), 0n);

        const cached = await first;
        assert.equal(cached.toString(), 'abcd');
        request._body_parser_get_received_data = () => {
            throw new Error('buffer() missed its settled value cache');
        };
        const later = request.buffer();
        assert.notEqual(later, first, 'settled buffer() calls must read the value cache');
        assert.equal(await later, cached, 'the cached Buffer object must remain reusable');
        assert.equal(request._body_expected_bytes, 4);
        assert.equal(native.pauses, 1);
        assert.equal(native.resumes, 0);

        // Clearing a late pause must not call native resume after the body completed.
        request.resume();
        assert.equal(native.resumes, 0);
    }

    for (const value of ['false', '0', 'null']) {
        const { callbacks, request, response } = create_request({
            'content-length': Buffer.byteLength(value).toString(),
        });
        request._body_parser_run(response, 8);
        const first = request.json(null);
        const second = request.json(null);
        assert.equal(first, second, `json() must cache the ${value} parser promise`);
        callbacks.data(array_buffer(value), 0n);
        const parsed = await first;
        assert.deepEqual(parsed, JSON.parse(value));
        request._body_parser_get_received_data = () => {
            throw new Error(`json() missed its settled ${value} value cache`);
        };
        const later = request.json(null);
        assert.notEqual(later, first, `settled ${value} must be served from the value cache`);
        assert.deepEqual(await later, parsed);
    }

    {
        const { native, request, response } = create_request({});
        request._body_parser_run(response, 8);
        assert.equal(request.buffer(), request.buffer());
        assert.equal(request.text(), request.text());
        assert.equal(request.urlencoded(), request.urlencoded());
        const buffer = await request.buffer();
        const text = await request.text();
        const urlencoded = await request.urlencoded();
        assert.deepEqual(buffer, Buffer.alloc(0));
        assert.equal(text, '');
        assert.deepEqual(Object.assign({}, urlencoded), {});
        request._body_parser_get_received_data = () => {
            throw new Error('an empty body helper missed its settled value cache');
        };
        assert.equal(await request.buffer(), buffer);
        assert.equal(await request.text(), text);
        assert.equal(await request.urlencoded(), urlencoded);

        assert.equal(request._mark_ended(), true);
        assert.equal(request._mark_ended(), false);
        assert.equal(request.ip, '');
        const pauses = native.pauses;
        request.pause().resume();
        assert.equal(native.pauses, pauses, 'post-completion flow control must not touch uWS');
        assert.equal(request.param('missing', 'fallback'), 'fallback');
    }

    {
        const { request, response } = create_request({ 'content-length': '4' });
        request._body_parser_run(response, 8);
        const expected = new Error('aborted');
        const parser = request.text();
        request._body_parser_stop(expected);
        await assert.rejects(parser, (error) => error === expected);
    }

    {
        const { callbacks, request, response } = create_request({ 'content-length': '1' });
        request._body_parser_run(response, 8);
        const expected = new Error('readable listener failure');
        request.on('data', () => {
            throw expected;
        });
        await new Promise((resolve) => setImmediate(resolve));

        assert.doesNotThrow(() => callbacks.data(array_buffer('x'), 0n));
        assert.equal(response.error, expected);
        assert.equal(request.received, true, 'terminal native callbacks must settle after listener errors');
    }

    {
        const { callbacks, request, response } = create_request({
            'transfer-encoding': 'chunked',
        });
        request._body_parser_run(response, 3);
        const parser = request.buffer();
        const rejection = assert.rejects(parser, (error) => error.code === 'ERR_BODY_LIMIT');

        callbacks.data(array_buffer('ab'), 0xffffffffffffffffn);
        callbacks.data(array_buffer('cd'), 0xffffffffffffffffn);
        callbacks.data(array_buffer(''), 0n);

        await rejection;
        assert.equal(response.status_code, 413);
        assert.equal(response.sent, 1);
    }

    {
        const value = 'false';
        const { callbacks, request, response } = create_request({
            'content-length': String(value.length),
        });
        request._body_parser_run(response, 8);

        // Every helper representation can share the same body concurrently and after settlement.
        const buffer = request.buffer();
        const text = request.text();
        const json = request.json(null);
        callbacks.data(array_buffer(value), 0n);

        assert.equal((await buffer).toString(), value);
        assert.equal(await text, value);
        assert.equal(await json, false);
        request._body_parser_get_received_data = () => {
            throw new Error('a cross-representation helper missed its settled value cache');
        };
        assert.equal((await request.buffer()).toString(), value);
        assert.equal(await request.text(), value);
        assert.equal(await request.json(null), false);
    }

    {
        const { callbacks, request, response } = create_request({ 'content-length': '4' });
        request._body_parser_run(response, 8);
        const parser = request.buffer();
        const first = new Uint8Array(array_buffer('ab'));

        callbacks.data(first.buffer, 2n);
        first.fill('z'.charCodeAt(0));
        callbacks.data(array_buffer('cd'), 0n);

        assert.equal((await parser).toString(), 'abcd');
        assert.equal(request._body_parser_mode, 1);
        assert.equal(request._body_parser_buffered, null);
    }

    {
        const { callbacks, request, response } = create_request({ 'content-length': '4' });
        request._body_parser_run(response, 8);
        const first = new Uint8Array(array_buffer('ab'));

        // Native chunks arriving before a consumer are copied because callback memory is volatile.
        callbacks.data(first.buffer, 2n);
        first.fill('z'.charCodeAt(0));
        callbacks.data(array_buffer('cd'), 0n);
        assert.equal((await request.buffer()).toString(), 'abcd');
    }

    {
        const { callbacks, native, request, response } = create_request(
            { 'content-length': '4' },
            { max_body_buffer: 1, streaming: { readable: { highWaterMark: 1 } } }
        );
        request._body_parser_run(response, 8);
        callbacks.data(array_buffer('ab'), 2n);
        assert.equal(native.pauses, 1, 'unconsumed body buffering must apply backpressure');

        const chunks = [];
        const destination = new Writable({
            write(chunk, encoding, callback) {
                chunks.push(Buffer.from(chunk));
                callback();
            },
        });
        const finished = new Promise((resolve, reject) => {
            destination.once('finish', resolve);
            destination.once('error', reject);
        });
        assert.equal(request.pipe(destination), request);
        assert.equal(native.resumes, 1, 'binding a pipe must resume an incomplete paused upload');

        callbacks.data(array_buffer('c'), 1n);
        callbacks.data(array_buffer('d'), 0n);
        await finished;
        assert.equal(Buffer.concat(chunks).toString(), 'abcd');

        request.pause();
        request.resume();
        assert.equal(native.resumes, 1, 'completed bodies must never call native resume again');
    }

    {
        const { callbacks, native, request, response } = create_request(
            { 'content-length': '4' },
            { max_body_buffer: 1, streaming: { readable: { highWaterMark: 1 } } }
        );
        request._body_parser_run(response, 8);

        const chunks = [];
        const pending_writes = [];
        const destination = new Writable({
            highWaterMark: 1,
            write(chunk, encoding, callback) {
                chunks.push(Buffer.from(chunk));
                pending_writes.push(callback);
            },
        });
        const finished = new Promise((resolve, reject) => {
            destination.once('finish', resolve);
            destination.once('error', reject);
        });

        request.pipe(destination);
        callbacks.data(array_buffer('a'), 3n);
        await wait_for(() => pending_writes.length === 1, 'first slow request pipe write');
        callbacks.data(array_buffer('b'), 2n);
        assert.equal(request._paused, true, 'a saturated request pipe must pause native intake');
        assert.equal(
            native.pauses,
            native.resumes + 1,
            'native intake must have one unmatched pause while downstream is saturated'
        );

        // uWS may deliver a callback already in flight after pause(); it must be retained exactly once.
        const pauses_before_spurious_chunk = native.pauses;
        callbacks.data(array_buffer('c'), 1n);
        assert.equal(chunks.length, 1, 'downstream backpressure must stop destination writes');
        assert.equal(
            native.pauses,
            pauses_before_spurious_chunk,
            'spurious paused chunks must not duplicate native pause calls'
        );

        pending_writes.shift()();
        await wait_for(() => native.resumes === 1, 'native request intake resume');
        await wait_for(() => pending_writes.length === 1, 'second slow request pipe write');
        callbacks.data(array_buffer('d'), 0n);

        while (chunks.length < 4 || pending_writes.length) {
            if (pending_writes.length) pending_writes.shift()();
            if (chunks.length < 4) await wait_for(
                () => pending_writes.length > 0,
                'next slow request pipe write'
            );
        }
        await finished;

        assert.equal(Buffer.concat(chunks).toString(), 'abcd');
        assert.ok(native.pauses >= 1, 'slow downstream consumption must exercise native pause');
        assert.equal(
            native.pauses,
            native.resumes + 1,
            'the terminal paused state must not issue an unsafe native resume after completion'
        );
        assert.equal(request.received, true);
        assert.equal(destination.writableFinished, true);
    }

    {
        const { native, request } = create_request({});
        assert.equal(request.port, 43210);
        assert.equal(request.port, 43210);
        assert.equal(request.proxy_port, 54321);
        assert.equal(request.proxy_port, 54321);
        assert.equal(request.ip, '');
        assert.equal(request.ip, '');
        assert.equal(request.proxy_ip, '');
        assert.equal(request.proxy_ip, '');
        assert.equal(native.remote_port_calls, 1);
        assert.equal(native.proxy_port_calls, 1);
        assert.equal(native.remote_address_calls, 1);
        assert.equal(native.proxy_address_calls, 1);

        request._mark_ended();
        assert.equal(request.port, 43210, 'cached native values remain readable after lifecycle end');
        assert.equal(request.proxy_port, 54321);
        assert.equal(request.ip, '');
        assert.equal(request.proxy_ip, '');
    }

    {
        const { native, request } = create_request(
            { 'x-forwarded-for': ' 203.0.113.9 , 198.51.100.2 ' },
            { trust_proxy: true }
        );
        request._mark_ended();
        assert.equal(request.ip, '203.0.113.9');
        assert.deepEqual(request.ips, ['203.0.113.9', '198.51.100.2']);
        assert.equal(native.remote_address_calls, 1);
        assert.equal(native.remote_port_calls, 1);
        assert.equal(native.proxy_address_calls, 1);
        assert.equal(native.proxy_port_calls, 1);
    }

    {
        const { request } = create_request(
            { 'x-forwarded-for': '   , 198.51.100.2 ' },
            { trust_proxy: true, remote_ip: '192.0.2.10' }
        );
        assert.equal(request.ip, '192.0.2.10', 'an empty forwarded client must use the socket IP');
    }

    {
        const headers = JSON.parse('{"__proto__":"request-data","constructor":"header-data"}');
        const { request } = create_request(headers);
        assert.equal(Object.getPrototypeOf(request.headers), null);
        assert.equal(request.headers.__proto__, 'request-data');
        assert.equal(request.headers.constructor, 'header-data');
    }

    log('REQUEST', 'Verified v7 Body, Backpressure, And Stable Connection Metadata Lifecycles');
}

module.exports = { test_request_body_v7 };
