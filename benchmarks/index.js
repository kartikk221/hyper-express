import os from 'os';
import fs from 'fs';
import fetch from 'node-fetch';
import cluster from 'cluster';
import uWebsocketsJS from 'uWebSockets.js';
import { log } from './utils.js';

// Load the server instances to be benchmarked
import uWebsockets from './setup/uwebsockets.js';
// import NanoExpress from './setup/nanoexpress.js';
import HyperExpress from './setup/hyperexpress.js';
import Fastify from './setup/fastify.js';
import Express from './setup/express.js';

// Load the configuration from disk
const configuration = JSON.parse(fs.readFileSync('./configuration.json', 'utf8'));

// Handle spawning of worker processes from the master process
const numCPUs = configuration.multi_core ? os.cpus().length : 1;
if (numCPUs > 1 && (cluster.isMaster || cluster.isPrimary)) {
    for (let i = 0; i < numCPUs; i++) {
        cluster.fork();
    }
    log(`Forked ${numCPUs} workers for benchmarking on ${os.platform()}`);
}

// Handle spawning of webservers for each worker process
let uws_socket;
if (numCPUs <= 1 || cluster.isWorker) {
    // Perform startup tasks
    log('Initializing Webservers...');
    (async () => {
        try {
            // Remember the initial port for HTTP request checks after all servers are started
            const initial_port = configuration.port_start;

            // Initialize the uWebsockets server instance
            uws_socket = await new Promise((resolve) =>
                uWebsockets.listen(configuration.hostname, configuration.port_start, resolve)
            );
            log(`uWebsockets.js server listening on port ${configuration.port_start}`);

            // Initialize the NanoExpress server instance
            // Commented out NanoExpress as it is not properly updated to Node.js v18
            /* configuration.port_start++;
                await NanoExpress.listen(configuration.port_start);
                log(`NanoExpress server listening on port ${configuration.port_start}`);
            */

            // Initialize the NanoExpress server instance
            configuration.port_start++;
            await HyperExpress.listen(configuration.port_start, configuration.hostname);
            log(`HyperExpress server listening on port ${configuration.port_start}`);

            // Initialize the Fastify server instance
            configuration.port_start++;
            Fastify.listen(configuration.port_start, configuration.hostname);
            log(`Fastify server listening on port ${configuration.port_start}`);

            // Initialize the Express server instance
            configuration.port_start++;
            await new Promise((resolve) => Express.listen(configuration.port_start, configuration.hostname, resolve));
            log(`Express.js server listening on port ${configuration.port_start}`);

            // Make HTTP GET requests to all used ports to test the servers
            log('Testing each webserver with a HTTP GET request...');
            for (let i = initial_port; i <= configuration.port_start; i++) {
                const response = await fetch(`http://localhost:${i}/`);
                if (response.status !== 200)
                    throw new Error(`HTTP request to port ${i} failed with status ${response.status}`);
                log(`GET HTTP -> Port ${i} -> Status ${response.status} -> ${response.headers.get('content-type')}`);
            }

            log(
                'All webservers are ready to receive request between ports ' +
                    initial_port +
                    ' - ' +
                    configuration.port_start +
                    '!',
                false
            );
        } catch (error) {
            console.log(error);
            process.exit();
        }
    })();
}

['exit', 'SIGINT', 'SIGUSR1', 'SIGUSR2', 'SIGTERM'].forEach((type) =>
    process.once(type, () => {
        // Close all the webserver instances
        try {
            if (uws_socket) uWebsocketsJS.us_listen_socket_close(uws_socket);
            // NanoExpress.close();
            HyperExpress.close();
            Fastify.close();
        } catch (error) {
            console.log(error);
        }

        // Exit the process
        process.exit();
    })
);
