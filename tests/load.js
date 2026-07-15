'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const http = require('node:http');
const net = require('node:net');
const { Readable } = require('node:stream');

const FormData = require('form-data');
const fetch = require('node-fetch');
const WebSocketClient = require('ws');
const HyperExpress = require('../index.js');

const LARGE_SIZE = 2 * 1024 * 1024;
const LARGE_BODY = crypto.randomBytes(LARGE_SIZE);
const LARGE_HASH = crypto.createHash('sha256').update(LARGE_BODY).digest('hex');

function hash(value) {
    return crypto.createHash('sha256').update(value).digest('hex');
}

function stream_hash(readable) {
    return new Promise((resolve, reject) => {
        const digest = crypto.createHash('sha256');
        readable.on('data', (chunk) => digest.update(chunk));
        readable.once('end', () => resolve(digest.digest('hex')));
        readable.once('error', reject);
    });
}

function available_port() {
    return new Promise((resolve, reject) => {
        const probe = net.createServer();
        probe.once('error', reject);
        probe.listen(0, '127.0.0.1', () => {
            const { port } = probe.address();
            probe.close((error) => (error ? reject(error) : resolve(port)));
        });
    });
}

function delay(milliseconds) {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function response_buffer(url, options) {
    const response = await fetch(url, options);
    assert.equal(response.status, 200);
    return response.buffer();
}

function slow_upload(port, body) {
    return new Promise((resolve, reject) => {
        const request = http.request(
            {
                host: '127.0.0.1',
                port,
                path: '/body',
                method: 'POST',
                headers: {
                    'content-length': body.length,
                    'content-type': 'application/octet-stream',
                },
            },
            (response) => {
                const chunks = [];
                response.on('data', (chunk) => chunks.push(chunk));
                response.once('end', () => resolve(Buffer.concat(chunks)));
            }
        );
        request.once('error', reject);

        let offset = 0;
        const write = () => {
            if (offset === body.length) return request.end();
            const end = Math.min(offset + 8192, body.length);
            request.write(body.subarray(offset, end));
            offset = end;
            setTimeout(write, 1);
        };
        write();
    });
}

function abort_upload(port) {
    return new Promise((resolve) => {
        const request = http.request({
            host: '127.0.0.1',
            port,
            path: '/body',
            method: 'POST',
            headers: {
                'content-length': LARGE_SIZE,
                'content-type': 'application/octet-stream',
            },
        });
        request.once('error', () => resolve());
        request.once('close', resolve);
        request.write(LARGE_BODY.subarray(0, 32 * 1024));
        request.destroy();
    });
}

async function multipart_upload(base, index) {
    const form = new FormData();
    const expected = [];
    form.append('request', String(index));

    for (let file = 0; file < 3; file++) {
        const value = crypto.randomBytes(128 * 1024 + index + file);
        expected.push(hash(value));
        form.append(`file_${file}`, value, `load-${index}-${file}.bin`);
    }

    const response = await fetch(`${base}/multipart`, {
        method: 'POST',
        headers: form.getHeaders(),
        body: form,
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), expected);
}

function next_ws_message(socket) {
    return new Promise((resolve, reject) => {
        socket.once('message', resolve);
        socket.once('error', reject);
    });
}

async function websocket_load(port) {
    const socket = new WebSocketClient(`ws://127.0.0.1:${port}/load`);
    await new Promise((resolve, reject) => {
        socket.once('open', resolve);
        socket.once('error', reject);
    });

    try {
        const typed = new Uint8Array(LARGE_BODY.buffer, LARGE_BODY.byteOffset, LARGE_BODY.byteLength);
        let message = next_ws_message(socket);
        socket.send(typed);
        assert.equal(hash(await message), LARGE_HASH);

        message = next_ws_message(socket);
        socket.send('stream');
        assert.equal(hash(await message), LARGE_HASH);
    } finally {
        socket.close();
        await Promise.race([
            new Promise((resolve) => socket.once('close', resolve)),
            delay(1000),
        ]);
    }
}

async function main() {
    const app = new HyperExpress.Server({
        auto_close: false,
        fast_buffers: true,
        max_body_length: 8 * 1024 * 1024,
    });

    app.post('/body', async (request, response) => {
        const body = await request.buffer();
        response.json({ length: body.length, hash: hash(body) });
    });
    app.get('/known', (request, response) => {
        const chunks = [LARGE_BODY.subarray(0, 17), LARGE_BODY.subarray(17)];
        response.stream(Readable.from(chunks), LARGE_BODY.length);
    });
    app.get('/chunked', (request, response) => {
        response.stream(Readable.from([LARGE_BODY.subarray(0, 65537), LARGE_BODY.subarray(65537)]));
    });
    app.post('/multipart', async (request, response) => {
        const hashes = [];
        await request.multipart(async (field) => {
            if (!field.file) return;
            await delay(1);
            hashes.push(await stream_hash(field.file.stream));
        });
        response.json(hashes);
    });
    app.ws(
        '/load',
        {
            message_type: 'Buffer',
            max_payload_length: 8 * 1024 * 1024,
            max_backpressure: 8 * 1024 * 1024,
        },
        (socket) => {
            socket.on('message', (message, is_binary) => {
                if (!is_binary && message.toString() === 'stream') {
                    return socket.stream(
                        Readable.from([LARGE_BODY.subarray(0, 31), LARGE_BODY.subarray(31)]),
                        true
                    );
                } else {
                    const status = socket.send(message, true);
                    assert.ok(status === 0 || status === 1 || status === 2);
                }
            });
        }
    );

    const port = await available_port();
    const base = `http://127.0.0.1:${port}`;
    const rss_samples = [];
    const started_at = process.hrtime.bigint();

    try {
        await app.listen(port, '127.0.0.1');

        for (let round = 0; round < 4; round++) {
            const requests = [];
            for (let index = 0; index < 25; index++) {
                requests.push(
                    fetch(`${base}/body`, {
                        method: 'POST',
                        headers: { 'content-type': 'application/octet-stream' },
                        body: LARGE_BODY,
                    }).then(async (response) => {
                        assert.equal(response.status, 200);
                        assert.deepEqual(await response.json(), {
                            length: LARGE_SIZE,
                            hash: LARGE_HASH,
                        });
                    })
                );
                requests.push(
                    response_buffer(`${base}/${index % 2 ? 'known' : 'chunked'}`).then((body) =>
                        assert.equal(hash(body), LARGE_HASH)
                    )
                );
            }
            await Promise.all(requests);
            if (global.gc) global.gc();
            await delay(25);
            rss_samples.push(process.memoryUsage().rss);
        }

        const slow_result = JSON.parse((await slow_upload(port, LARGE_BODY.subarray(0, 256 * 1024))).toString());
        assert.deepEqual(slow_result, {
            length: 256 * 1024,
            hash: hash(LARGE_BODY.subarray(0, 256 * 1024)),
        });

        await Promise.all(Array.from({ length: 20 }, () => abort_upload(port)));
        await Promise.all(Array.from({ length: 8 }, (_, index) => multipart_upload(base, index)));
        await websocket_load(port);

        const health = await response_buffer(`${base}/known`);
        assert.equal(hash(health), LARGE_HASH);

        // Native write buffers grow to the observed concurrency high-water mark and are retained
        // for reuse. Detect continued growth after that warm-up rather than treating reuse as a leak.
        const warmup_growth = rss_samples[rss_samples.length - 1] - rss_samples[0];
        const sustained_growth = rss_samples[rss_samples.length - 1] - rss_samples[rss_samples.length - 2];
        assert.ok(
            sustained_growth < 64 * 1024 * 1024,
            `Sustained RSS growth exceeded 64 MiB: ${sustained_growth} bytes (${rss_samples.join(', ')})`
        );

        const elapsed_ms = Number(process.hrtime.bigint() - started_at) / 1e6;
        console.log(
            JSON.stringify({
                status: 'passed',
                elapsed_ms: Math.round(elapsed_ms),
                rss_samples,
                warmup_growth,
                sustained_growth,
                completed_http_requests: 210,
                aborted_uploads: 20,
                multipart_uploads: 8,
                websocket_payload_bytes: LARGE_SIZE * 2,
            })
        );
    } finally {
        app.force_close();
    }
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
