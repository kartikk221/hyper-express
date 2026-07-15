'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const http = require('node:http');
const net = require('node:net');
const { Readable, Writable } = require('node:stream');

const FormData = require('form-data');
const fetch = require('node-fetch');
const WebSocketClient = require('ws');
const HyperExpress = require('../index.js');

const LARGE_SIZE = 2 * 1024 * 1024;
const LARGE_BODY = crypto.randomBytes(LARGE_SIZE);
const LARGE_HASH = crypto.createHash('sha256').update(LARGE_BODY).digest('hex');
const PRESSURE_BODY = Buffer.concat(Array.from({ length: 8 }, () => LARGE_BODY));
const PRESSURE_HASH = crypto.createHash('sha256').update(PRESSURE_BODY).digest('hex');
const WEBSOCKET_PRESSURE_BODY = PRESSURE_BODY;
const WEBSOCKET_PRESSURE_HASH = crypto
    .createHash('sha256')
    .update(WEBSOCKET_PRESSURE_BODY)
    .digest('hex');

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

function isolated_agent() {
    return new http.Agent({ keepAlive: false });
}

async function response_buffer(url, options) {
    const response = await fetch(url, { ...options, agent: isolated_agent() });
    assert.equal(response.status, 200);
    return response.buffer();
}

async function wait_for_response_buffer(url, timeout_ms) {
    const started = Date.now();
    let attempts = 0;
    while (Date.now() - started < timeout_ms) {
        attempts++;
        try {
            return { body: await response_buffer(url), attempts, elapsed_ms: Date.now() - started };
        } catch (error) {
            if (error.code !== 'ECONNRESET') throw error;
            await delay(10);
        }
    }
    throw new Error(`server did not accept a health request within ${timeout_ms}ms`);
}

function slow_upload(port, body) {
    return new Promise((resolve, reject) => {
        const request = http.request(
            {
                host: '127.0.0.1',
                port,
                path: '/body',
                method: 'POST',
                agent: false,
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

function slow_download(port, path) {
    return new Promise((resolve, reject) => {
        const request = http.get({ host: '127.0.0.1', port, path, agent: false }, (response) => {
            const chunks = [];
            let paused_once = false;
            response.on('data', (chunk) => {
                chunks.push(chunk);
                if (!paused_once) {
                    paused_once = true;
                    response.pause();
                    setTimeout(() => response.resume(), 50);
                }
            });
            response.once('end', () => resolve(Buffer.concat(chunks)));
            response.once('error', reject);
        });
        request.once('error', reject);
    });
}

function pressure_download(port, path, inspect) {
    return new Promise((resolve, reject) => {
        const request = http.get({ host: '127.0.0.1', port, path, agent: false }, (response) => {
            const chunks = [];
            let snapshot;
            let inspecting = false;
            response.on('data', (chunk) => {
                chunks.push(chunk);
                if (inspecting) return;
                inspecting = true;
                response.pause();
                setTimeout(async () => {
                    try {
                        snapshot = await inspect();
                        response.resume();
                    } catch (error) {
                        request.destroy();
                        reject(error);
                    }
                }, 150);
            });
            response.once('end', () => resolve({ body: Buffer.concat(chunks), snapshot }));
            response.once('error', reject);
        });
        request.once('error', reject);
    });
}

function abort_download(port, path) {
    return new Promise((resolve, reject) => {
        const request = http.get({ host: '127.0.0.1', port, path, agent: false }, (response) => {
            response.once('data', () => {
                response.pause();
                request.destroy();
            });
            response.once('close', resolve);
            response.once('error', (error) => {
                if (error.code === 'ECONNRESET') resolve();
                else reject(error);
            });
        });
        request.once('error', (error) => {
            if (error.code === 'ECONNRESET') resolve();
            else reject(error);
        });
    });
}

function abort_upload(port) {
    return new Promise((resolve) => {
        const request = http.request({
            host: '127.0.0.1',
            port,
            path: '/body',
            method: 'POST',
            agent: false,
            headers: {
                'content-length': LARGE_SIZE,
                'content-type': 'application/octet-stream',
            },
        });
        request.once('error', () => resolve());
        request.once('close', resolve);
        request.once('socket', (socket) => {
            const abort_connected_upload = () => {
                request.write(LARGE_BODY.subarray(0, 32 * 1024));
                setImmediate(() => request.destroy());
            };
            if (socket.connecting) socket.once('connect', abort_connected_upload);
            else abort_connected_upload();
        });
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
        agent: isolated_agent(),
        headers: form.getHeaders(),
        body: form,
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), expected);
}

function next_ws_message(socket, timeout_ms = 5000, inspect) {
    return new Promise((resolve, reject) => {
        const cleanup = () => {
            clearTimeout(timeout);
            socket.removeListener('message', on_message);
            socket.removeListener('error', on_error);
        };
        const on_message = (message) => {
            cleanup();
            resolve(message);
        };
        const on_error = (error) => {
            cleanup();
            reject(error);
        };
        const timeout = setTimeout(() => {
            cleanup();
            reject(
                new Error(
                    `WebSocket message timed out after ${timeout_ms}ms: ${JSON.stringify(inspect?.())}`
                )
            );
        }, timeout_ms);
        socket.once('message', on_message);
        socket.once('error', on_error);
    });
}

async function websocket_load(port, inspect_writable) {
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

        message = next_ws_message(socket, 5000, inspect_writable);
        socket.send('stream');
        assert.equal(hash(await message), LARGE_HASH);

        message = next_ws_message(socket, 5000, inspect_writable);
        const pressure_snapshot = await new Promise((resolve, reject) => {
            socket.send('writable', (error) => {
                if (error) return reject(error);
                socket._socket.pause();
                setTimeout(() => {
                    try {
                        resolve(inspect_writable());
                    } catch (inspect_error) {
                        reject(inspect_error);
                    } finally {
                        socket._socket.resume();
                    }
                }, 150);
            });
        });
        assert.ok(
            pressure_snapshot.produced_bytes < WEBSOCKET_PRESSURE_BODY.length,
            'WebSocket writable producer must stop while its peer is paused'
        );
        assert.ok(
            pressure_snapshot.drain_events > 0,
            'WebSocket writable must reach native drain backpressure'
        );
        assert.equal(hash(await message), WEBSOCKET_PRESSURE_HASH);
        await delay(20);
        const completed_metrics = inspect_writable();
        assert.equal(completed_metrics.produced_bytes, WEBSOCKET_PRESSURE_BODY.length);
        assert.equal(completed_metrics.source_closed, true);
        assert.equal(completed_metrics.writable_finished, true);
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
    let aborted_upload_errors = 0;
    app.set_error_handler((request, response, error) => {
        if (request.path === '/body' && error.code === 'ERR_REQUEST_ABORTED') {
            aborted_upload_errors++;
            return;
        }
        console.error(`[load server ${request.method} ${request.path}]`, error);
        if (!response.completed) response.close();
    });
    let upload_pipe_metrics;
    let response_pipe_metrics;
    let aborted_response_pipe_metrics;
    let websocket_pipe_metrics;

    app.post('/body', async (request, response) => {
        const body = await request.buffer();
        response.json({ length: body.length, hash: hash(body) });
    });
    app.get('/health', (request, response) => response.send('ok'));
    app.post('/body-pipe', async (request, response) => {
        const digest = crypto.createHash('sha256');
        let length = 0;
        let active_writes = 0;
        upload_pipe_metrics = {
            pauses: 0,
            resumes: 0,
            writes: 0,
            max_active_writes: 0,
        };
        const native_pause = request._pause_native.bind(request);
        request._pause_native = () => {
            const paused = native_pause();
            if (paused) upload_pipe_metrics.pauses++;
            return paused;
        };
        const resume = request.resume.bind(request);
        request.resume = () => {
            const should_resume_native = request._paused && !request.received;
            const output = resume();
            if (should_resume_native) upload_pipe_metrics.resumes++;
            return output;
        };
        const destination = new Writable({
            highWaterMark: 1,
            write(chunk, encoding, callback) {
                active_writes++;
                upload_pipe_metrics.writes++;
                upload_pipe_metrics.max_active_writes = Math.max(
                    upload_pipe_metrics.max_active_writes,
                    active_writes
                );
                length += chunk.length;
                digest.update(chunk);
                setTimeout(() => {
                    active_writes--;
                    callback();
                }, 2);
            },
        });
        const completed = new Promise((resolve, reject) => {
            destination.once('finish', resolve);
            destination.once('error', reject);
            request.once('error', reject);
        });
        request.pipe(destination);
        await completed;
        response.json({ length, hash: digest.digest('hex'), metrics: upload_pipe_metrics });
    });
    app.get('/known', (request, response) => {
        const chunks = [LARGE_BODY.subarray(0, 17), LARGE_BODY.subarray(17)];
        return response.stream(Readable.from(chunks), LARGE_BODY.length);
    });
    app.get('/chunked', (request, response) => {
        return response.stream(
            Readable.from([LARGE_BODY.subarray(0, 65537), LARGE_BODY.subarray(65537)])
        );
    });
    app.get('/pipe', (request, response) => {
        const chunks = [];
        for (let offset = 0; offset < LARGE_BODY.length; offset += 16 * 1024)
            chunks.push(LARGE_BODY.subarray(offset, offset + 16 * 1024));
        Readable.from(chunks, { highWaterMark: 16 * 1024 }).pipe(response);
    });
    const pipe_pressure = (request, response, aborted) => {
        const metrics = {
            backpressure_waits: 0,
            produced_bytes: 0,
            source_closed: false,
            response_closed: false,
        };
        if (aborted) aborted_response_pipe_metrics = metrics;
        else response_pipe_metrics = metrics;

        const drain = response.drain.bind(response);
        response.drain = (handler) => {
            metrics.backpressure_waits++;
            return drain(handler);
        };
        const source = new Readable({
            highWaterMark: 16 * 1024,
            read() {
                if (metrics.produced_bytes === PRESSURE_BODY.length) return this.push(null);
                const end = Math.min(metrics.produced_bytes + 16 * 1024, PRESSURE_BODY.length);
                const chunk = PRESSURE_BODY.subarray(metrics.produced_bytes, end);
                metrics.produced_bytes = end;
                this.push(chunk);
            },
        });
        source.once('close', () => {
            metrics.source_closed = true;
        });
        response.once('close', () => {
            metrics.response_closed = true;
        });
        source.pipe(response);
    };
    app.get('/pipe-pressure', (request, response) => pipe_pressure(request, response, false));
    app.get('/pipe-pressure-abort', (request, response) => pipe_pressure(request, response, true));
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
            max_backpressure: 32 * 1024 * 1024,
        },
        (socket) => {
            socket.on('message', async (message, is_binary) => {
                if (!is_binary && message.toString() === 'stream') {
                    return socket.stream(
                        Readable.from([LARGE_BODY.subarray(0, 31), LARGE_BODY.subarray(31)]),
                        true
                    );
                } else if (!is_binary && message.toString() === 'writable') {
                    websocket_pipe_metrics = {
                        drain_events: 0,
                        produced_bytes: 0,
                        buffered_bytes: 0,
                        source_closed: false,
                        writable_finished: false,
                    };
                    socket.on('drain', () => websocket_pipe_metrics.drain_events++);
                    const buffered_sampler = setInterval(() => {
                        websocket_pipe_metrics.buffered_bytes = socket.buffered;
                    }, 10);
                    const source = new Readable({
                        highWaterMark: 16 * 1024,
                        read() {
                            if (
                                websocket_pipe_metrics.produced_bytes ===
                                WEBSOCKET_PRESSURE_BODY.length
                            )
                                return this.push(null);
                            const end = Math.min(
                                websocket_pipe_metrics.produced_bytes + 16 * 1024,
                                WEBSOCKET_PRESSURE_BODY.length
                            );
                            const chunk = WEBSOCKET_PRESSURE_BODY.subarray(
                                websocket_pipe_metrics.produced_bytes,
                                end
                            );
                            websocket_pipe_metrics.produced_bytes = end;
                            this.push(chunk);
                        },
                    });
                    source.once('close', () => {
                        websocket_pipe_metrics.source_closed = true;
                    });
                    const writable = socket.writable;
                    try {
                        await new Promise((resolve, reject) => {
                            writable.once('finish', resolve);
                            writable.once('error', reject);
                            source.once('error', reject);
                            source.pipe(writable);
                        });
                        websocket_pipe_metrics.writable_finished = true;
                    } finally {
                        clearInterval(buffered_sampler);
                    }
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
    let stage = 'listen';
    const enter_stage = (value) => {
        console.log(
            `[load] ${stage} completed after ${Math.round(
                Number(process.hrtime.bigint() - started_at) / 1e6
            )}ms; starting ${value}`
        );
        stage = value;
    };

    try {
        await app.listen(port, '127.0.0.1');

        enter_stage('concurrent HTTP body and response streams');
        for (let round = 0; round < 4; round++) {
            const requests = [];
            for (let index = 0; index < 25; index++) {
                requests.push(
                    fetch(`${base}/body`, {
                        method: 'POST',
                        agent: isolated_agent(),
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

        enter_stage('slow request upload');
        const slow_result = JSON.parse((await slow_upload(port, LARGE_BODY.subarray(0, 256 * 1024))).toString());
        assert.deepEqual(slow_result, {
            length: 256 * 1024,
            hash: hash(LARGE_BODY.subarray(0, 256 * 1024)),
        });

        enter_stage('backpressured request pipe');
        const piped_upload = await fetch(`${base}/body-pipe`, {
            method: 'POST',
            agent: isolated_agent(),
            headers: { 'content-type': 'application/octet-stream' },
            body: LARGE_BODY,
        });
        assert.equal(piped_upload.status, 200);
        const piped_upload_result = await piped_upload.json();
        assert.equal(piped_upload_result.length, LARGE_SIZE);
        assert.equal(piped_upload_result.hash, LARGE_HASH);
        assert.equal(piped_upload_result.metrics.max_active_writes, 1);
        assert.ok(piped_upload_result.metrics.writes > 1);
        assert.ok(piped_upload_result.metrics.pauses > 0);
        assert.ok(
            piped_upload_result.metrics.pauses - piped_upload_result.metrics.resumes >= 0 &&
                piped_upload_result.metrics.pauses - piped_upload_result.metrics.resumes <= 1
        );

        enter_stage('live slow-peer response pipe pressure');
        const pressured_result = await pressure_download(port, '/pipe-pressure', async () => ({
            ...response_pipe_metrics,
        }));
        assert.equal(pressured_result.body.length, PRESSURE_BODY.length);
        assert.equal(hash(pressured_result.body), PRESSURE_HASH);
        assert.ok(
            pressured_result.snapshot.produced_bytes < PRESSURE_BODY.length,
            'the response producer must stop while the network peer is paused'
        );
        assert.ok(
            pressured_result.snapshot.backpressure_waits > 0,
            'the live response must reach uWS writable backpressure'
        );
        await delay(20);
        const completed_pipe_metrics = response_pipe_metrics;
        assert.equal(completed_pipe_metrics.produced_bytes, PRESSURE_BODY.length);
        assert.equal(completed_pipe_metrics.source_closed, true);
        assert.equal(completed_pipe_metrics.response_closed, true);

        enter_stage('backpressured response pipe');
        const piped_download = await slow_download(port, '/pipe');
        assert.equal(piped_download.length, LARGE_SIZE);
        assert.equal(hash(piped_download), LARGE_HASH);

        enter_stage('aborted uploads');
        await Promise.all(Array.from({ length: 20 }, () => abort_upload(port)));
        // Client close precedes the corresponding native abort callbacks. Bound the recovery
        // window and require a complete streamed response before starting the next load phase.
        const post_abort_health = await wait_for_response_buffer(`${base}/health`, 1000);
        assert.equal(post_abort_health.body.toString(), 'ok');
        assert.equal(post_abort_health.attempts, 1, 'the server must accept immediately after aborts');
        assert.ok(post_abort_health.elapsed_ms < 1000);
        assert.equal(aborted_upload_errors, 20);
        enter_stage('concurrent multipart uploads');
        await Promise.all(Array.from({ length: 8 }, (_, index) => multipart_upload(base, index)));
        enter_stage('WebSocket load');
        await websocket_load(port, () => ({ ...websocket_pipe_metrics }));

        enter_stage('aborted live response pipe pressure');
        await abort_download(port, '/pipe-pressure-abort');
        await delay(20);
        const aborted_pipe_metrics = aborted_response_pipe_metrics;
        assert.ok(aborted_pipe_metrics.produced_bytes < PRESSURE_BODY.length);
        assert.equal(aborted_pipe_metrics.source_closed, true);
        assert.equal(aborted_pipe_metrics.response_closed, true);

        enter_stage('final streamed health check');
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
                completed_http_requests: 214,
                aborted_uploads: 20,
                multipart_uploads: 8,
                websocket_payload_bytes: LARGE_SIZE * 2 + WEBSOCKET_PRESSURE_BODY.length,
            })
        );
    } catch (error) {
        throw new Error(`${stage}: ${error.message}`, { cause: error });
    } finally {
        app.force_close();
    }
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
