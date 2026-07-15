const assert = require('node:assert/strict');
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
    };
    const app = {
        _options: {
            fast_abort: false,
            max_body_buffer: options.max_body_buffer ?? 1,
        },
    };
    const route = {
        app,
        method: 'POST',
        path: '/v7-body-lifecycle',
        path_parameters_key: [],
    };
    const request = new Request(route, create_raw_request(headers));
    request._raw_response = native;

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
    };

    return { callbacks, native, request, response };
}

function array_buffer(value) {
    return Uint8Array.from(Buffer.from(value)).buffer;
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

        assert.equal((await first).toString(), 'abcd');
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
        assert.deepEqual(await first, JSON.parse(value));
    }

    {
        const { request, response } = create_request({});
        request._body_parser_run(response, 8);
        assert.equal(request.buffer(), request.buffer());
        assert.equal(request.text(), request.text());
        assert.equal(request.urlencoded(), request.urlencoded());
        assert.deepEqual(await request.buffer(), Buffer.alloc(0));
        assert.equal(await request.text(), '');
        assert.deepEqual(Object.assign({}, await request.urlencoded()), {});

        assert.equal(request._mark_ended(), true);
        assert.equal(request._mark_ended(), false);
        assert.throws(() => request.ip, /cannot be consumed after/);
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

    log('REQUEST', 'Verified v7 Body Receiver, Parser Caching, Limits, And Abort Settlement');
}

module.exports = { test_request_body_v7 };
