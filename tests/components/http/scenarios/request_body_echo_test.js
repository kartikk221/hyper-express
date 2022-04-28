const path = require('path');
const FormData = require('form-data');
const crypto = require('crypto');
const fs = require('fs');
const { assert_log } = require('../../../scripts/operators.js');
const { HyperExpress, fetch, server } = require('../../../configuration.js');
const router = new HyperExpress.Router();
const endpoint = '/tests/request';
const scenario_endpoint = '/json-body-echo';
const endpoint_url = server.base + endpoint + scenario_endpoint;

// Create Backend HTTP Route
router.post(
    scenario_endpoint,
    async (req) => {
        req.body = await req.json();
        return;
    },
    (req, res, next) => {
        res.locals.data = req.body;
        next();
    },
    (_, res) => {
        res.status(200).json(res.locals.data);
    }
);

// Bind router to webserver
const { TEST_SERVER } = require('../../Server.js');
TEST_SERVER.use(endpoint, router);

async function test_request_body_echo_test(iterations = 5) {
    const group = 'REQUEST';
    const candidate = 'HyperExpress.Request.json()';

    for (let i = 0; i < iterations; i++) {
        // Generate a small random payload
        const payload = {
            foo: crypto.randomBytes(5).toString('hex'),
        };

        // Make the fetch request
        const response = await fetch(endpoint_url, {
            method: 'POST',
            body: JSON.stringify(payload),
        });

        // Retrieve the JSON response body
        const body = await response.json();

        // Assert that the payload and response body are the same
        assert_log(
            group,
            `${candidate} JSON Small Body Echo Test #${i + 1}`,
            () => JSON.stringify(payload) === JSON.stringify(body)
        );
    }
}

module.exports = {
    test_request_body_echo_test,
};
