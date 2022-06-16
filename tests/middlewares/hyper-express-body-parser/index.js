const { test_parser_limit } = require('./scenarios/parser_limit.js');
const { test_parser_validation } = require('./scenarios/parser_validation.js');
const { test_parser_compression } = require('./scenarios/parser_compression.js');

async function test_body_parser_middleware() {
    // Test the BodyParser.options.limit property for limiting the size of the body
    await test_parser_limit();

    // Test the BodyParser.options.type and BodyParser.options.verify options functionaltiy
    await test_parser_validation();

    // Test the BodyParser compression functionality
    await test_parser_compression();
}

module.exports = {
    test_body_parser_middleware,
};
