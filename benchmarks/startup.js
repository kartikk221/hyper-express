const group = 'SINGLE_CORE_BENCHMARK';
let { port_range_start } = require('./configuration.json');
const HyperExpress_Server = require('./setup/HyperExpress.js');
const Express_Server = require('./setup/Express.js');
const Fastify_Server = require('./setup/Fastify.js');
const NanoExpress_Server = require('./setup/NanoExpress.js');
const uWebsockets_Server = require('./setup/uWebsockets.js');

function log(logger = 'SYSTEM', message) {
    let dt = new Date();
    let timeStamp = dt
        .toLocaleString([], { hour12: true, timeZone: 'America/New_York' })
        .replace(', ', ' ')
        .split(' ');
    timeStamp[1] += ':' + dt.getMilliseconds().toString().padStart(3, '0') + 'ms';
    timeStamp = timeStamp.join(' ');
    console.log(`[${timeStamp}][${logger}] ${message}`);
}

async function startup_webservers() {
    // Benchmark uWebsockets Server
    log(group, 'Starting uWebsockets Test HTTP Server On Port: ' + port_range_start);
    uWebsockets_Server.listen(port_range_start, () => {});
    port_range_start++;

    // Benchmark HyperExpress Server
    log(group, 'Starting HyperExpress Test HTTP Server On Port: ' + port_range_start);
    await HyperExpress_Server.listen(port_range_start);
    port_range_start++;

    // Benchmark NanoExpress Server
    log(group, 'Starting NanoExpress Test HTTP Server On Port: ' + port_range_start);
    NanoExpress_Server.listen(port_range_start);
    port_range_start++;

    // Benchmark Fastify Server
    log(group, 'Starting Fastify Test HTTP Server On Port: ' + port_range_start);
    await Fastify_Server.listen(port_range_start, '0.0.0.0');
    port_range_start++;

    // Benchmark Express Server
    log(group, 'Starting Express Test HTTP Server On Port: ' + port_range_start);
    await Express_Server.listen(port_range_start);
    port_range_start++;
}

module.exports = startup_webservers;
