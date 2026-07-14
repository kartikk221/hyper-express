import os from 'os';
import fs from 'fs';
import cluster from 'cluster';
import fetch from 'node-fetch';
import uWebsocketsJS from 'uWebSockets.js';
import { log } from './utils.js';

// Load the server instances to be benchmarked
import uWebsockets from './setup/uwebsockets.js';
import NanoExpress from './setup/nanoexpress.js';
import HyperExpress from './setup/hyperexpress.js';
import Fastify from './setup/fastify.js';
import Express from './setup/express.js';

// Load the configuration from disk
const configuration = JSON.parse(fs.readFileSync('./configuration.json', 'utf8'));

// Handle spawning of worker processes from the master process
const numCPUs = configuration.multi_core ? os.cpus().length : 1;
if (numCPUs > 1 && (cluster.isMaster || cluster.isPrimary)) {
    for (let worker_index = 0; worker_index < numCPUs; worker_index++) {
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
            configuration.port_start++;
            await HyperExpress.listen(configuration.port_start, configuration.hostname);
            log(`HyperExpress server listening on port ${configuration.port_start}`);

            // Initialize the NanoExpress server instance
            configuration.port_start++;
            await NanoExpress.listen(configuration.port_start);
            log(`NanoExpress server listening on port ${configuration.port_start}`);

            // Initialize the Fastify server instance
            configuration.port_start++;
            Fastify.listen({ port: configuration.port_start, host: configuration.hostname });
            log(`Fastify server listening on port ${configuration.port_start}`);

            // Initialize the Express server instance
            configuration.port_start++;
            await new Promise((resolve) => Express.listen(configuration.port_start, configuration.hostname, resolve));
            log(`Express.js server listening on port ${configuration.port_start}`);

            // Make HTTP GET requests to all used ports to test the servers
            log('Testing each webserver with a HTTP GET request...');
            const final_port = configuration.port_start;
            for (let port = initial_port; port <= final_port; port++) {
                const response = await fetch(`http://localhost:${port}/`);
                if (response.status !== 200)
                    throw new Error(`HTTP request to port ${port} failed with status ${response.status}`);
                log(`GET HTTP -> Port ${port} -> Status ${response.status} -> ${response.headers.get('content-type')}`);
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

const exit_events = ['exit', 'SIGINT', 'SIGUSR1', 'SIGUSR2', 'SIGTERM'];
for (const event_type of exit_events) {
    process.once(event_type, () => {
        // Release every benchmark server before the worker exits
        try {
            if (uws_socket) uWebsocketsJS.us_listen_socket_close(uws_socket);
            NanoExpress.close();
            HyperExpress.close();
            Fastify.close();
        } catch (error) {
            console.log(error);
        }

        process.exit();
    });
}
