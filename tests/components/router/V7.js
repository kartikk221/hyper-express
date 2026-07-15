const assert = require('node:assert/strict');
const { HyperExpress, fetch } = require('../../configuration.js');
const { log } = require('../../scripts/operators.js');

const wait = (delay) => new Promise((resolve) => setTimeout(resolve, delay));

async function fetch_from(app, path, options) {
    return fetch(`http://127.0.0.1:${app.port}${path}`, options);
}

async function test_registration_validation() {
    const app = new HyperExpress.Server({ auto_close: false });

    assert.throws(() => app.get('/missing-handler'), /handler function is required/);
    assert.throws(
        () => app.get('/invalid-array', [() => {}, 'invalid'], () => {}),
        /middleware arrays may only contain functions/i
    );
    assert.throws(
        () => app.get('/invalid-options', { middlewares: [null] }, () => {}),
        /options\.middlewares may only contain functions/i
    );
    assert.throws(
        () => app.get('/ambiguous-options', {}, {}, () => {}),
        /only specify one options object/i
    );
    assert.throws(
        () => app.use('/invalid-use-array', [() => {}, null]),
        /middleware arrays may only contain functions/i
    );

    app.get('/zero-limit', { max_body_length: 0 }, (request, response) => response.send());
    app.connect('/connect', (request, response) => response.send());

    assert.equal(app.routes.get['/missing-handler'], undefined);
    assert.equal(app.routes.get['/ambiguous-options'], undefined);
    assert.equal(app.routes.get['/zero-limit'].max_body_length, 0);
    assert.ok(app.routes.connect['/connect']);

    app.force_close();
    log('ROUTER', 'Verified v7 Route Registration Validation And CONNECT');
}

async function test_middleware_completion() {
    const app = new HyperExpress.Server({ auto_close: false });
    const router = new HyperExpress.Router();

    router.set_error_handler((request, response, error) =>
        response.status(500).send(`scoped:${error.message}`)
    );

    const cases = [
        ['/thrown', () => { throw new Error('thrown'); }, 'scoped:thrown'],
        ['/rejected', () => Promise.reject(new Error('rejected')), 'scoped:rejected'],
        ['/next-error', (request, response, next) => next(new Error('next-error')), 'scoped:next-error'],
        [
            '/fulfilled-error',
            () => Promise.resolve(new Error('fulfilled-error')),
            'scoped:fulfilled-error',
        ],
    ];

    for (const [path, middleware] of cases) {
        router.get(path, middleware, (request, response) => response.send('unexpected'));
    }

    router.get(
        '/thenable',
        () => ({ then: (resolve) => queueMicrotask(resolve) }),
        (request, response) => response.send('thenable-complete')
    );
    router.get(
        '/async-next',
        async (request, response, next) => {
            next();
        },
        (request, response) => response.send('async-next-complete')
    );
    router.get(
        '/late-settlement',
        (request, response, next) => {
            next();
            return wait(20);
        },
        (request, response) => response.send('late-settlement-complete')
    );
    router.get('/route-rejection', async () => {
        throw new Error('route-rejection');
    });

    app.use('/middleware', router);
    await app.listen(0, '127.0.0.1');

    try {
        for (const [path, , expected] of cases) {
            const response = await fetch_from(app, '/middleware' + path);
            assert.equal(response.status, 500);
            assert.equal(await response.text(), expected);
        }

        assert.equal(
            await (await fetch_from(app, '/middleware/thenable')).text(),
            'thenable-complete'
        );
        assert.equal(
            await (await fetch_from(app, '/middleware/async-next')).text(),
            'async-next-complete'
        );
        assert.equal(
            await (await fetch_from(app, '/middleware/late-settlement')).text(),
            'late-settlement-complete'
        );
        assert.equal(
            await (await fetch_from(app, '/middleware/route-rejection')).text(),
            'scoped:route-rejection'
        );
        await wait(25);
    } finally {
        app.force_close();
    }

    let strict_errors = 0;
    let first_completion;
    let duplicate_completion;
    const strict_app = new HyperExpress.Server({
        auto_close: false,
        strict_middleware: true,
    });
    strict_app.set_error_handler((request, response, error) => {
        assert.match(error.message, /ERR_DUPLICATE_MIDDLEWARE_COMPLETION/);
        strict_errors++;
    });
    strict_app.get(
        '/strict',
        async (request, response, next) => {
            first_completion = next();
            duplicate_completion = next();
        },
        (request, response) => response.send('strict-complete')
    );
    await strict_app.listen(0, '127.0.0.1');

    try {
        assert.equal(await (await fetch_from(strict_app, '/strict')).text(), 'strict-complete');
        await wait(10);
        assert.equal(first_completion, true);
        assert.equal(duplicate_completion, false);
        assert.equal(strict_errors, 1);
    } finally {
        strict_app.force_close();
    }

    log('ROUTER', 'Verified v7 Middleware Completion Contract');
}

async function test_scoped_handlers_and_mounts() {
    const app = new HyperExpress.Server({ auto_close: false });
    const parent = new HyperExpress.Router();
    const child = new HyperExpress.Router();
    const empty_child = new HyperExpress.Router();
    const late_router = new HyperExpress.Router();
    const tie_first = new HyperExpress.Router();
    const tie_second = new HyperExpress.Router();
    const chain = app.route('/chain');

    child.get('/error', () => {
        throw new Error('child-error');
    });
    child.get('/handler-failure', () => {
        throw new Error('trigger-handler-failure');
    });
    parent.get('/parent-error', () => {
        throw new Error('parent-error');
    });

    parent.use('/v1', child);
    app.use('/api', parent);
    app.use('/mirror', child);
    app.use('/late', late_router);
    app.use('/tie', tie_first);
    app.use('/tie', tie_second);

    // All of these registrations happen after their routers have already been mounted.
    parent.use('/empty', empty_child);
    late_router.use('/route', (request, response, next) => {
        request.late_middleware = true;
        next();
    });
    late_router.get('/route', (request, response) => response.send(String(request.late_middleware)));

    child.set_error_handler((request, response, error) => {
        if (request.path.endsWith('/handler-failure')) {
            return Promise.reject(new Error('child-handler-failed'));
        }
        return response.status(500).send(`child:${error.message}`);
    });
    parent.set_error_handler((request, response, error) =>
        response.status(500).send(`parent:${error.message}`)
    );

    child.set_not_found_handler((request, response) => response.status(404).send('child-not-found'));
    parent.set_not_found_handler((request, response) => response.status(404).send('parent-not-found'));
    tie_first.set_not_found_handler((request, response) => response.status(404).send('tie-first'));
    tie_second.set_not_found_handler((request, response) => response.status(404).send('tie-second'));
    chain.set_error_handler((request, response, error) =>
        response.status(500).send(`chain:${error.message}`)
    );
    chain.set_not_found_handler((request, response) => response.status(404).send('chain-not-found'));
    chain.get('/error', () => {
        throw new Error('chain-error');
    });

    app.get('/server-error', () => {
        throw new Error('server-error');
    });
    app.set_error_handler((request, response, error) =>
        response.status(500).send(`server:${error.message}`)
    );
    app.set_not_found_handler((request, response) => response.status(404).send('server-not-found'));

    await app.listen(0, '127.0.0.1');
    try {
        assert.equal(await (await fetch_from(app, '/api/v1/error')).text(), 'child:child-error');
        assert.equal(await (await fetch_from(app, '/mirror/error')).text(), 'child:child-error');
        assert.equal(
            await (await fetch_from(app, '/api/v1/handler-failure')).text(),
            'parent:child-handler-failed'
        );
        assert.equal(await (await fetch_from(app, '/api/parent-error')).text(), 'parent:parent-error');
        assert.equal(await (await fetch_from(app, '/server-error')).text(), 'server:server-error');
        assert.equal(await (await fetch_from(app, '/chain/error')).text(), 'chain:chain-error');

        assert.equal(await (await fetch_from(app, '/api/v1/missing')).text(), 'child-not-found');
        assert.equal(await (await fetch_from(app, '/mirror/missing')).text(), 'child-not-found');
        assert.equal(await (await fetch_from(app, '/api/empty/missing')).text(), 'parent-not-found');
        assert.equal(await (await fetch_from(app, '/api/missing')).text(), 'parent-not-found');
        assert.equal(await (await fetch_from(app, '/api-not-a-boundary')).text(), 'server-not-found');
        assert.equal(await (await fetch_from(app, '/tie/missing')).text(), 'tie-first');
        assert.equal(await (await fetch_from(app, '/chain/missing')).text(), 'chain-not-found');
        assert.equal(await (await fetch_from(app, '/late/route')).text(), 'true');
    } finally {
        app.force_close();
    }

    log('ROUTER', 'Verified v7 Scoped Handlers And Mounted Router Propagation');
}

async function test_router_v7() {
    await test_registration_validation();
    await test_middleware_completion();
    await test_scoped_handlers_and_mounts();
}

module.exports = { test_router_v7 };
