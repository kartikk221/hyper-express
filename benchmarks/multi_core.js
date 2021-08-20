let { port_range_start } = require('./configuration.json');
const PID = process.pid;
const group = 'MULTI_CORE_BENCHMARK';
const cluster = require('cluster');

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

if (cluster.isMaster) {
    const numCPUs = require('os').cpus().length;
    log(group, `Launching ${numCPUs} Instances For Webservers...`);

    // Fork workers up to numCPUs
    for (let i = 0; i < numCPUs; i++) cluster.fork();
} else {
    const HyperExpress_Server = require('./setup/HyperExpress.js');
    const Express_Server = require('./setup/Express.js');
    const Fastify_Server = require('./setup/Fastify.js');
    const uWebsockets_Server = require('./setup/uWebsockets.js');

    // Start all server instances on a range of ports from port_range_start
    (async () => {
        log(group, 'Launching Single Core Listeners For Webservers...');

        // Benchmark uWebsockets Server
        log(
            group,
            'Starting uWebsockets Test HTTP Server On Port: ' + port_range_start + ' & PID: ' + PID
        );
        await uWebsockets_Server.listen(port_range_start, () => {});
        port_range_start++;

        // Benchmark HyperExpress Server
        log(
            group,
            'Starting HyperExpress Test HTTP Server On Port: ' + port_range_start + ' & PID: ' + PID
        );
        await HyperExpress_Server.listen(port_range_start);
        port_range_start++;

        // Benchmark Fastify Server
        log(
            group,
            'Starting Fastify Test HTTP Server On Port: ' + port_range_start + ' & PID: ' + PID
        );
        await Fastify_Server.listen(port_range_start, '0.0.0.0');
        port_range_start++;

        // Benchmark Express Server
        log(
            group,
            'Starting Express Test HTTP Server On Port: ' + port_range_start + ' & PID: ' + PID
        );
        await Express_Server.listen(port_range_start);
        port_range_start++;
    })();
}
