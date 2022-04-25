import cluster from 'cluster';

/**
 * Logs a message to the console.
 * Will only log if the current process is a worker and primary_only is set to false.
 *
 * @param {String} message
 * @param {Boolean} [primary_only=true]
 * @returns
 */
export function log(message, primary_only = true) {
    if (primary_only && cluster.isWorker) return;
    console.log(message);
}

/**
 * Returns a Promise which is resolved after the given number of milliseconds.
 *
 * @param {Number} ms
 * @returns {Promise<void>}
 */
export function async_wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
