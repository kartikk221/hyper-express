const assert = require('node:assert/strict');
const FileSystem = require('fs');
const Path = require('path');
const { Readable } = require('stream');
const signature = require('cookie-signature');

const Response = require('../../../src/components/http/Response.js');
const MultipartField = require('../../../src/components/plugins/MultipartField.js');
const SSEventStream = require('../../../src/components/plugins/SSEventStream.js');
const { log, async_wait } = require('../../scripts/operators.js');
const { fetch, server, HyperExpress } = require('../../configuration.js');
const { TEST_SERVER } = require('../Server.js');

const endpoint = '/tests/response/v7';
const endpoint_url = server.base + endpoint;
const file_path = Path.resolve(__dirname, '../../content/test.html');
let evicted_live_file;

TEST_SERVER.get(endpoint + '/helper/:kind', (request, response) => {
    switch (request.path_parameters.kind) {
        case 'html':
            return response.html('<p>✓</p>');
        case 'json':
            return response.json({ value: '✓' });
        case 'jsonp':
            return response.jsonp({ value: 'safe' });
        case 'send':
            return response.send('neutral');
    }
});

TEST_SERVER.get(endpoint + '/headers', (request, response) => {
    const chainable =
        response.set({ 'X-Object': 'object' }) === response &&
        response.setHeader('X-Repeat', 'first') === response &&
        response.append('x-repeat', 'second') === response &&
        response.writeHeaders({ 'X-Written': 'written' }) === response &&
        response.setHeaders({ 'X-Set': 'set' }) === response &&
        response.writeHeaderValues('X-Values', ['one', 'two']) === response;

    response.header('X-Remove', 'removed');
    const removed = response.removeHeader('x-REMOVE') === response;
    return response.json({
        chainable,
        removed,
        repeated: response.getHeader('X-REPEAT'),
        removed_value: response.get('X-Remove'),
    });
});

TEST_SERVER.get(endpoint + '/cookies', (request, response) => {
    response.cookie('signed', 'value', null, { path: '/', secret: 'secret' });
    response.cookie('scoped', 'root', null, { path: '/' });
    response.cookie('scoped', 'admin', null, { path: '/admin' });
    response.cookie('deleted', 'old', null, { path: '/scope', httpOnly: true });
    response.cookie('deleted', null, null, { path: '/scope', httpOnly: true });
    return response.send();
});

TEST_SERVER.get(endpoint + '/attachment', (request, response) => {
    return response.attachment('/tmp/report.txt', 'bad"\r\nInjected: yes.txt').send('file');
});

TEST_SERVER.get(endpoint + '/sse-format', (request, response) => {
    response.sse.comment('one\ntwo');
    response.sse.send('', '', '\nnext');
    response.sse.close();
});

TEST_SERVER.get(endpoint + '/zero-stream', (request, response) => {
    return response.stream(Readable.from([]), 0);
});

TEST_SERVER.get(endpoint + '/file-evict', (request, response) => {
    return response.file(file_path, (pool) => {
        evicted_live_file = pool[file_path];
        delete pool[file_path];
    });
});

function create_response(options = {}) {
    const app = {
        pending: 0,
        _resolve_pending_request() {
            this.pending++;
        },
    };
    const errors = [];
    const request = {
        received: true,
        method: 'GET',
        headers: {},
        query_parameters: {},
        ended: 0,
        stopped: [],
        _mark_ended() {
            this.ended++;
        },
        _body_parser_stop(error) {
            this.stopped.push(error);
        },
        resume() {},
    };
    const native = {
        aborted_handler: undefined,
        writable_handler: undefined,
        end_calls: [],
        end_without_body_calls: [],
        try_end_calls: [],
        write_calls: [],
        close_calls: 0,
        upgrade_calls: 0,
        headers: [],
        offset: 0,
        onAborted(handler) {
            this.aborted_handler = handler;
            return this;
        },
        onWritable(handler) {
            this.writable_handler = handler;
            return this;
        },
        cork(handler) {
            handler();
            return this;
        },
        writeStatus() {
            return this;
        },
        writeHeader(name, value) {
            this.headers.push([name, value]);
            return this;
        },
        end(body) {
            this.end_calls.push(body);
            return this;
        },
        endWithoutBody(length) {
            this.end_without_body_calls.push(length);
            return this;
        },
        write(chunk) {
            this.write_calls.push(Buffer.from(chunk));
            return options.write ? options.write(chunk, this) : true;
        },
        tryEnd(chunk, total_size) {
            const value = Buffer.from(chunk);
            this.try_end_calls.push([value, total_size]);
            return options.try_end ? options.try_end(value, total_size, this) : [true, false];
        },
        getWriteOffset() {
            return this.offset;
        },
        close() {
            this.close_calls++;
        },
        upgrade() {
            this.upgrade_calls++;
        },
    };
    const route = {
        app,
        streaming: { writable: {} },
        handle_error(req, res, error) {
            errors.push(error);
        },
    };
    const response = new Response(native);
    response.route = route;
    response._wrapped_request = request;
    return { app, errors, native, request, response };
}

async function test_response_lifecycle_units() {
    {
        const temporary_server = new HyperExpress.Server({ auto_close: false });
        let closed = 0;
        temporary_server._file_pool['/cached'] = {
            close() {
                closed++;
            },
        };
        assert.equal(temporary_server.close(), false);
        assert.equal(closed, 1);
        assert.equal(temporary_server._file_pool['/cached'], undefined);
    }

    {
        const { app, native, request, response } = create_response();
        const events = [];
        response.on('finish', () => events.push(['finish', response.completed]));
        response.on('close', () => events.push(['close', response.completed]));
        response.send('body').send('ignored').close();

        assert.equal(native.end_calls.length, 1);
        assert.equal(app.pending, 1);
        assert.equal(request.ended, 1);
        assert.deepEqual(events, [
            ['finish', true],
            ['close', true],
        ]);
        assert.equal(response._aborted, false);
        assert.equal(response.aborted, true, 'public aborted retains completed compatibility semantics');
    }

    {
        const { app, native, response } = create_response();
        const events = [];
        const closed = new Promise((resolve) => response.once('close', resolve));
        response.on('finish', () => events.push(['finish', response.completed]));
        response.on('close', () => events.push(['close', response.completed]));
        response.write('first');
        response.send('last');
        await closed;

        assert.equal(Buffer.concat(native.write_calls).toString(), 'firstlast');
        assert.equal(app.pending, 1);
        assert.deepEqual(events, [
            ['finish', true],
            ['close', true],
        ]);
    }

    {
        const { app, native, request, response } = create_response();
        const events = [];
        response.on('abort', () => events.push('abort'));
        response.on('finish', () => events.push('finish'));
        response.on('close', () => events.push('close'));
        native.aborted_handler();
        native.aborted_handler();

        assert.equal(app.pending, 1);
        assert.equal(request.stopped[0].code, 'ERR_REQUEST_ABORTED');
        assert.deepEqual(events, ['abort', 'close']);
        assert.equal(response._aborted, true);
    }

    {
        const { errors, native, response } = create_response();
        assert.equal(response.upgrade({ invalid: true }), response);
        assert.equal(native.upgrade_calls, 0);
        assert.match(errors[0].message, /cannot upgrade/i);
    }

    {
        const { errors, native, response } = create_response();
        assert.equal(response.drain(() => undefined), response);
        assert.equal(native.writable_handler(0), true);
        assert.match(errors[0].message, /must return a boolean/i);
    }

    {
        const expected = new Error('atomic rejection');
        const { errors, response } = create_response();
        assert.doesNotThrow(() => response.atomic(() => Promise.reject(expected)));
        await Promise.resolve();
        await Promise.resolve();
        assert.equal(errors[0], expected);
    }

    {
        const expected = new Error('prepare failure');
        const { errors, native, response } = create_response();
        response._cork = true;
        response.once('prepare', () => {
            throw expected;
        });

        assert.doesNotThrow(() => response.send('body'));
        assert.equal(errors[0], expected);
        assert.equal(native.end_calls.length, 0);
    }

    {
        const writes = [];
        const headers = [];
        const response = {
            completed: false,
            initiated: false,
            header(name, value) {
                headers.push([name, value]);
                return this;
            },
            write(value) {
                writes.push(value);
                return false;
            },
        };
        const events = new SSEventStream();
        events._response = response;

        assert.equal(events.send('a\nb\0', 'up\r\ndate', 'one\r\ntwo'), false);
        assert.deepEqual(headers, [
            ['content-type', 'text/event-stream; charset=utf-8'],
            ['cache-control', 'no-cache'],
        ]);
        assert.equal(writes[0], 'id: ab\nevent: update\ndata: one\ndata: two\n\n');
    }

    {
        const { app, native, response } = create_response({
            try_end: () => [true, true],
        });
        await response.stream(Readable.from([Buffer.from('done')]), 4);
        assert.equal(response.completed, true);
        assert.equal(app.pending, 1);
        assert.equal(native.try_end_calls.length, 1);
    }

    {
        const { app, native, response } = create_response();
        await response.stream(Readable.from([]), 0);
        assert.deepEqual(native.end_without_body_calls, [0]);
        assert.equal(app.pending, 1);
        assert.equal(response.completed, true);
    }

    {
        const { native, response } = create_response({
            try_end: () => [true, false],
        });
        await assert.rejects(
            response.stream(Readable.from([Buffer.from('ab')]), 3),
            /closed after 2 of 3/
        );
        assert.equal(native.close_calls, 1);
        assert.equal(response.completed, true);
    }

    {
        const expected = new Error('read failure');
        const readable = new Readable({
            read() {
                this.destroy(expected);
            },
        });
        const { native, response } = create_response();
        await assert.rejects(response.stream(readable), (error) => error === expected);
        assert.equal(native.close_calls, 1);
    }

    {
        let writes = 0;
        const { native, response } = create_response({
            try_end: () => (++writes === 1 ? [false, false] : [true, true]),
        });
        const operation = response._stream_chunk(Buffer.from('abc'), 3);
        assert.equal(typeof native.writable_handler, 'function');
        assert.equal(native.writable_handler(1), true);
        await operation;
        assert.equal(native.try_end_calls[1][0].toString(), 'bc');
        assert.equal(response.completed, true);
    }
}

async function test_multipart_field_write() {
    const info = { filename: 'file.txt', encoding: '7bit', mimeType: 'text/plain' };
    const output_path = Path.resolve(__dirname, `../../content/multipart-write.${process.pid}.temp`);
    const source_error_path = Path.resolve(
        __dirname,
        `../../content/multipart-source-error.${process.pid}.temp`
    );

    try {
        const field = new MultipartField('file', Readable.from(['written']), info);
        await field.write(output_path);
        assert.equal(FileSystem.readFileSync(output_path, 'utf8'), 'written');

        const expected = new Error('multipart source failed');
        const failed_source = new Readable({
            read() {
                this.destroy(expected);
            },
        });
        const failed_field = new MultipartField('file', failed_source, info);
        await assert.rejects(failed_field.write(source_error_path), (error) => error === expected);

        const destination_field = new MultipartField('file', Readable.from(['value']), info);
        await assert.rejects(
            destination_field.write(Path.join(output_path, 'missing', 'file.txt')),
            /ENOENT|ENOTDIR/
        );
    } finally {
        for (const target of [output_path, source_error_path]) {
            try {
                FileSystem.unlinkSync(target);
            } catch (error) {
                if (error.code !== 'ENOENT') throw error;
            }
        }
    }
}

async function test_response_v7() {
    await test_response_lifecycle_units();
    await test_multipart_field_write();

    const html = await fetch(endpoint_url + '/helper/html');
    assert.equal(html.headers.get('content-type'), 'text/html; charset=utf-8');
    assert.equal(await html.text(), '<p>✓</p>');

    const json = await fetch(endpoint_url + '/helper/json');
    assert.equal(json.headers.get('content-type'), 'application/json; charset=utf-8');

    const jsonp = await fetch(endpoint_url + '/helper/jsonp?callback=client.handle');
    assert.equal(jsonp.headers.get('content-type'), 'application/javascript; charset=utf-8');
    assert.equal(await jsonp.text(), 'client.handle({"value":"safe"})');

    for (const suffix of ['/helper/jsonp', '/helper/jsonp?callback=alert(1)//']) {
        const fallback = await fetch(endpoint_url + suffix);
        assert.equal(fallback.headers.get('content-type'), 'application/json; charset=utf-8');
        assert.deepEqual(await fallback.json(), { value: 'safe' });
    }

    const neutral = await fetch(endpoint_url + '/helper/send');
    assert.equal(neutral.headers.get('content-type'), null);
    assert.equal(neutral.headers.get('etag'), null);
    assert.equal(neutral.headers.get('x-powered-by'), null);

    const headers = await (await fetch(endpoint_url + '/headers')).json();
    assert.equal(headers.chainable, true);
    assert.equal(headers.removed, true);
    assert.deepEqual(headers.repeated, ['first', 'second']);
    assert.equal(headers.removed_value, undefined);

    const cookie_response = await fetch(endpoint_url + '/cookies');
    const cookies = cookie_response.headers.raw()['set-cookie'];
    assert.equal(cookies.filter((value) => value.startsWith('scoped=')).length, 2);
    assert.ok(cookies.some((value) => value.startsWith('scoped=root; Path=/')));
    assert.ok(cookies.some((value) => value.startsWith('scoped=admin; Path=/admin')));
    assert.ok(cookies.some((value) => /deleted=; Max-Age=0; Path=\/scope; HttpOnly/.test(value)));
    const signed = cookies.find((value) => value.startsWith('signed=')).split(';')[0].slice('signed='.length);
    assert.equal(signature.unsign(signed, 'secret'), 'value');

    const attachment = await fetch(endpoint_url + '/attachment');
    const disposition = attachment.headers.get('content-disposition');
    assert.equal(disposition.includes('\r'), false);
    assert.equal(disposition.includes('\n'), false);
    assert.equal(disposition, 'attachment; filename="bad___Injected: yes.txt"');

    const sse = await fetch(endpoint_url + '/sse-format');
    assert.equal(sse.headers.get('content-type'), 'text/event-stream; charset=utf-8');
    assert.equal(
        await sse.text(),
        ': one\n: two\n\nid:\nevent:\ndata:\ndata: next\n\n'
    );

    const zero = await fetch(endpoint_url + '/zero-stream');
    assert.equal((await zero.buffer()).byteLength, 0);

    const file = await fetch(endpoint_url + '/file-evict');
    assert.equal(file.status, 200);
    await file.buffer();
    await async_wait(5);
    assert.equal(TEST_SERVER._file_pool[file_path], undefined);
    assert.equal(evicted_live_file.closed, true);
    assert.equal(evicted_live_file.watcher, undefined);
    assert.equal(evicted_live_file.close(), false);

    log('RESPONSE', 'Verified v7 Response Lifecycle, Helpers, Cookies, Files, Multipart Writes, And SSE');
}

module.exports = { test_response_v7 };
