const { assert_log } = require( '../../../scripts/operators.js' );
const { HyperExpress, fetch, server } = require( '../../../configuration.js' );
const fs = require( 'fs' )
const path = require( 'path' )
const crypto = require( 'crypto' )
const { promisify } = require( 'util' )
const stream = require('stream')
const pipeline = promisify( stream.pipeline )

const router = new HyperExpress.Router();
const endpoint = '/tests/request';
const scenario_endpoint = '/writable-response';
const endpoint_url = server.base + endpoint + scenario_endpoint;

// Create Backend HTTP Route
const testFileName = 'why-im-so-hyper_big.jpg';
const testFilePath = path.join( __dirname, testFileName )

router.get( scenario_endpoint, async ( request, response ) => {
        response.header( 'Content-Type', 'img/jpeg' )
        response.header( 'Content-Disposition', `inline; filename="${testFileName}"` )
        return pipeline(
            fs.createReadStream( testFilePath ),
            response.asWritable()
        )
    }
);

// Bind router to webserver
const { TEST_SERVER } = require( '../../Server.js' );
TEST_SERVER.use( endpoint, router );

async function md5_hash(readable) {
    const hash = crypto.createHash( 'md5' );
    hash.setEncoding('hex')
    await pipeline( readable, hash )
    hash.end()
    return hash.read();
}

async function test_writable_response() {
    const group = 'RESPONSE';
    const candidate = 'HyperExpress.RESPONSE';
    const expectedFileHash = await md5_hash(fs.createReadStream( testFilePath ))

    const response = await fetch( endpoint_url );
    const body = await response.blob();
    const responseHash = await md5_hash(stream.Readable.from((Buffer.from(await body.arrayBuffer()))))

    assert_log(
        group,
        `${candidate} Has correct headers`,
        () =>
            response.headers.get( 'Content-Type' ) === 'img/jpeg'
            && response.headers.get( 'Content-Disposition' ) === `inline; filename="${testFileName}"`
    );
    assert_log(
        group,
        `${candidate} returns expected response data`,
        () => responseHash === expectedFileHash
    );
}

module.exports = {
    test_writable_response,
};
