// THIS FILE CAN BE TYPE CHECKED TO ENSURE THE TYPES ARE CORRECT

import { Router, Request, Response, MiddlewareNext } from '../../types/index';

// Create a new router instance
const router = new Router();

// Pattern + Handler
router.any('/', async (request, response) => {
    const body = await request.json();
});

// Pattern + Options + Handler
router.all(
    '/',
    {
        max_body_length: 250,
    },
    async (request, response) => {
        const body = await request.json();
    }
);

const middleware = (request: Request, response: Response, next: MiddlewareNext) => {};

// Pattern + 2 Middlewares + Handler
router.connect(
    '/',
    middleware,
    async (request, repsonse, next) => {
        await request.text();
        next();
    },
    async (request, response) => {
        const body = await request.json();
    }
);

// Pattern + options + 4 Middlewares + Handler
router.post(
    '/',
    {
        max_body_length: 250,
    },
    middleware,
    middleware,
    middleware,
    async (request, repsonse, next) => {
        await request.text();
        next();
    },
    async (request, response) => {
        const body = await request.json();
    }
);

// Pattern + 4 Middlewares (Array) + Handler
router.put(
    '/',
    [
        middleware,
        middleware,
        middleware,
        async (request, repsonse, next) => {
            await request.text();
            next();
        },
    ],
    async (request, response) => {
        const body = await request.json();
    }
);

// Pattern + options + 4 Middlewares (Array) + Handler
router.delete(
    '/',
    {
        max_body_length: 250,
    },
    [
        middleware,
        middleware,
        middleware,
        async (request, repsonse, next) => {
            await request.text();
            next();
        },
    ],
    async (request, response) => {
        const body = await request.json();
    }
);

// Handler
router
    .route('/api/v1')
    .get(async (request, response) => {
        const body = await request.json();
    })
    .post(
        {
            max_body_length: 250,
        },
        async (request, response, next) => {
            const body = await request.json();
        },
        async (request, response) => {
            const body = await request.json();
        }
    )
    .delete(
        {
            max_body_length: 250,
        },
        middleware,
        [middleware, middleware],
        async (request, response) => {
            const body = await request.json();
        }
    );

// Ensures router usage is valid in all possible forms
router.use(router);
router.use('/something', router);
router.use('/something', middleware);
router.use(middleware, middleware, middleware);
router.use('else', middleware, [middleware, middleware, middleware], middleware);
