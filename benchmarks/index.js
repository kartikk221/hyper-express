const group = 'BENCHMARK';
const HyperExpress_Server = require('./setup/HyperExpress.js');
const Express_Server = require('./setup/Express.js');
const Fastify_Server = require('./setup/Fastify.js');
const uWebsockets_Server = require('./setup/uWebsockets.js');

function log(logger = 'SYSTEM', message) {
    let dt = new Date();
    let timeStamp = dt
        .toLocaleString([], { hour12: true, timeZone: 'America/New_York' })
        .replace(', ', ' ')
        .split(' ');
    timeStamp[1] +=
        ':' + dt.getMilliseconds().toString().padStart(3, '0') + 'ms';
    timeStamp = timeStamp.join(' ');
    console.log(`[${timeStamp}][${logger}] ${message}`);
}

(async () => {
    let start_port = 8080;

    // Benchmark uWebsockets Server
    log(group, 'Starting uWebsockets Test HTTP Server On Port: ' + start_port);
    await uWebsockets_Server.listen(start_port, () => {});
    log(group, 'Successfully Started uWebsockets Test HTTP Server.\n');
    start_port++;

    // Benchmark HyperExpress Server
    log(group, 'Starting HyperExpress Test HTTP Server On Port: ' + start_port);
    await HyperExpress_Server.listen(start_port);
    log(group, 'Successfully Started HyperExpress Test HTTP Server.\n');
    start_port++;

    // Benchmark Fastify Server
    log(group, 'Starting Fastify Test HTTP Server On Port: ' + start_port);
    await Fastify_Server.listen(start_port);
    log(group, 'Successfully Started Fastify Test HTTP Server.\n');
    start_port++;

    // Benchmark Express Server
    log(group, 'Starting Express Test HTTP Server On Port: ' + start_port);
    await Express_Server.listen(start_port);
    log(group, 'Successfully Started Express Test HTTP Server.\n');
    start_port++;
})();
