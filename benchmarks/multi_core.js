const group = 'MULTI_CORE_BENCHMARK';
const cluster = require('cluster');
const startup = require('./startup.js');

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
    startup();
}
