const { assert_log } = require('../../../scripts/operators.js');
const { fetch, server } = require('../../../configuration.js');
const { TEST_SERVER } = require('../../Server.js');

const endpoint = '/tests/response/set';
const endpoint_url = server.base + endpoint;

// Create Backend HTTP Route
TEST_SERVER.get(endpoint, async (request, response) => {
  response.set({ 'test-header-1': 'test-value-1' });
  response.set('test-header-2', 'test-value-2');
  return response.end();
});

async function test_response_set_header() {
  let group = 'RESPONSE';
  let candidate = 'HyperExpress.Response.set()';

  // Perform fetch request
  const response = await fetch(endpoint_url);
  const headers = response.headers.raw();

  assert_log(
    group,
    candidate + ' Set Header Test',
    () => {
      return headers['test-header-1'] == 'test-value-1'
      && headers['test-header-2'] == 'test-value-2';
    }
  );
}

module.exports = {
  test_response_set_header,
};
