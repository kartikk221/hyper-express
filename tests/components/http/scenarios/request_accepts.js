const { assert_log } = require('../../../scripts/operators.js');
const { HyperExpress, fetch, server } = require('../../../configuration.js');
const router = new HyperExpress.Router();
const endpoint = '/tests/request';
const scenario_endpoint = '/accepts';
const endpoint_url = server.base + endpoint + scenario_endpoint;

// Create Backend HTTP Route to test the ExpressJS request content negotiation methods
router.get(scenario_endpoint, (request, response) =>
    response.json({
        media_types: request.accepts(),
        media_type_array: request.accepts(['json', 'html']),
        media_type_variadic: request.accepts('json', 'html'),
        media_type_unmatched: request.accepts('xml'),
        encodings: request.acceptsEncodings(),
        encoding: request.acceptsEncodings('gzip', 'br'),
        charsets: request.acceptsCharsets(),
        charset: request.acceptsCharsets('iso-8859-1', 'utf-8'),
        languages: request.acceptsLanguages(),
        language: request.acceptsLanguages('en-US', 'fr'),
    })
);

// Bind router to webserver
const { TEST_SERVER } = require('../../Server.js');
TEST_SERVER.use(endpoint, router);

async function test_request_accepts() {
    const group = 'REQUEST';
    const candidate = 'HyperExpress.Request';
    const response = await fetch(endpoint_url, {
        headers: {
            accept: 'application/json;q=0.8, text/html;q=0.9',
            'accept-encoding': 'gzip;q=0.8, br;q=1',
            'accept-charset': 'utf-8;q=1, iso-8859-1;q=0.5',
            'accept-language': 'en-US;q=0.8, fr;q=1',
        },
    });
    const body = await response.json();

    assert_log(group, candidate + '.accepts()', () => {
        return (
            body.media_types.join(',') === 'text/html,application/json' &&
            body.media_type_array === 'html' &&
            body.media_type_variadic === 'html' &&
            body.media_type_unmatched === false
        );
    });
    assert_log(group, candidate + '.acceptsEncodings()', () => {
        return body.encodings.join(',') === 'br,gzip,identity' && body.encoding === 'br';
    });
    assert_log(group, candidate + '.acceptsCharsets()', () => {
        return body.charsets.join(',') === 'utf-8,iso-8859-1' && body.charset === 'utf-8';
    });
    assert_log(group, candidate + '.acceptsLanguages()', () => {
        return body.languages.join(',') === 'fr,en-US' && body.language === 'fr';
    });
}

module.exports = {
    test_request_accepts,
};
