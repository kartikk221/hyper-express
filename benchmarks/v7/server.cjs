'use strict';

const path = require('node:path');

const root = path.resolve(process.argv[2]);
const port = Number(process.argv[3]);
const HyperExpress = require(path.join(root, 'index.js'));
const app = new HyperExpress.Server({ auto_close: false });

const body = Buffer.from(
    JSON.stringify({
        framework: 'hyper-express',
        release: 7,
        message: 'The same static payload is used for baseline and candidate measurements.',
    })
);

app.get('/', (request, response) => {
    response.header('content-type', 'application/json');
    response.header('cache-control', 'no-cache');
    response.send(body);
});

const pass = (request, response, next) => next();
app.get('/middleware', pass, pass, pass, pass, pass, pass, pass, pass, (request, response) => {
    response.send(body);
});

app.post('/json', async (request, response) => {
    const value = await request.json(null);
    response.json(value);
});

process.on('message', (message) => {
    if (message === 'rss' && process.send) process.send({ rss: process.memoryUsage().rss });
    if (message === 'stop') {
        if (typeof app.force_close === 'function') app.force_close();
        else app.close();
        process.exit(0);
    }
});

app.listen(port, '127.0.0.1').then(
    () => process.send && process.send({ ready: true }),
    (error) => {
        console.error(error);
        process.exit(1);
    }
);
