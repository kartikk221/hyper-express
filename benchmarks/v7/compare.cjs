'use strict';

const assert = require('node:assert/strict');
const { fork } = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const net = require('node:net');
const path = require('node:path');
const { performance } = require('node:perf_hooks');

const project_root = path.resolve(__dirname, '../..');
const baseline_root = path.resolve(process.argv[2] || '/tmp/hyper-express-v6-baseline');
const runs = Number(process.env.HYPER_EXPRESS_BENCHMARK_RUNS || 5);
const duration_ms = Number(process.env.HYPER_EXPRESS_BENCHMARK_DURATION_MS || 2000);
const concurrency = Number(process.env.HYPER_EXPRESS_BENCHMARK_CONCURRENCY || 50);

function median(values) {
    const sorted = [...values].sort((left, right) => left - right);
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function percentile(values, fraction) {
    const sorted = [...values].sort((left, right) => left - right);
    return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)];
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

async function start_server(root) {
    const port = await available_port();
    const child = fork(path.join(__dirname, 'server.cjs'), [root, String(port)], {
        stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
        env: {
            ...process.env,
            NODE_PATH: path.join(project_root, 'node_modules'),
        },
    });

    await new Promise((resolve, reject) => {
        const on_message = (message) => {
            if (message && message.ready) {
                child.removeListener('exit', on_exit);
                resolve();
            }
        };
        const on_exit = (code) => {
            child.removeListener('message', on_message);
            reject(new Error(`Benchmark server exited before listen with code ${code}.`));
        };
        child.on('message', on_message);
        child.once('exit', on_exit);
    });
    return { child, port };
}

function request(port, agent) {
    return new Promise((resolve, reject) => {
        const started_at = performance.now();
        const operation = http.get(
            { host: '127.0.0.1', port, path: '/', agent },
            (response) => {
                response.resume();
                response.once('end', () => {
                    if (response.statusCode !== 200)
                        return reject(new Error(`Unexpected benchmark status ${response.statusCode}.`));
                    resolve(performance.now() - started_at);
                });
            }
        );
        operation.once('error', reject);
    });
}

async function measure(port, milliseconds) {
    const agent = new http.Agent({ keepAlive: true, maxSockets: concurrency });
    const latencies = [];
    const started_at = performance.now();
    const deadline = started_at + milliseconds;

    async function client() {
        while (performance.now() < deadline) latencies.push(await request(port, agent));
    }

    try {
        await Promise.all(Array.from({ length: concurrency }, client));
    } finally {
        agent.destroy();
    }

    const elapsed_seconds = (performance.now() - started_at) / 1000;
    return {
        requests: latencies.length,
        throughput: latencies.length / elapsed_seconds,
        p95_latency_ms: percentile(latencies, 0.95),
    };
}

async function stop_server(server) {
    if (server.child.exitCode !== null) return;
    server.child.send('stop');
    await new Promise((resolve) => server.child.once('exit', resolve));
}

async function main() {
    assert.equal(process.versions.node.split('.')[0], '22', 'The v7 comparison gate must run on Node.js 22.');
    assert.ok(fs.existsSync(path.join(baseline_root, 'index.js')), `Missing baseline at ${baseline_root}.`);

    const baseline = await start_server(baseline_root);
    const candidate = await start_server(project_root);
    const measurements = { baseline: [], candidate: [] };

    try {
        await measure(baseline.port, 1000);
        await measure(candidate.port, 1000);

        for (let index = 0; index < runs; index++) {
            const order = index % 2
                ? [
                      ['candidate', candidate],
                      ['baseline', baseline],
                  ]
                : [
                      ['baseline', baseline],
                      ['candidate', candidate],
                  ];
            for (const [name, server] of order) measurements[name].push(await measure(server.port, duration_ms));
        }
    } finally {
        await Promise.all([stop_server(baseline), stop_server(candidate)]);
    }

    const result = {
        node: process.version,
        runs,
        duration_ms,
        concurrency,
        baseline: {
            median_throughput: median(measurements.baseline.map((entry) => entry.throughput)),
            median_p95_latency_ms: median(measurements.baseline.map((entry) => entry.p95_latency_ms)),
            runs: measurements.baseline,
        },
        candidate: {
            median_throughput: median(measurements.candidate.map((entry) => entry.throughput)),
            median_p95_latency_ms: median(measurements.candidate.map((entry) => entry.p95_latency_ms)),
            runs: measurements.candidate,
        },
    };
    result.throughput_regression_percent =
        ((result.baseline.median_throughput - result.candidate.median_throughput) /
            result.baseline.median_throughput) *
        100;
    result.p95_regression_percent =
        ((result.candidate.median_p95_latency_ms - result.baseline.median_p95_latency_ms) /
            result.baseline.median_p95_latency_ms) *
        100;

    console.log(JSON.stringify(result, null, 2));
    assert.ok(
        result.throughput_regression_percent <= 5,
        `Median throughput regression ${result.throughput_regression_percent.toFixed(2)}% exceeds 5%.`
    );
    assert.ok(
        result.p95_regression_percent <= 10,
        `Median p95 latency regression ${result.p95_regression_percent.toFixed(2)}% exceeds 10%.`
    );
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
