class PerformanceMeasurement {
    #data = [];

    /**
     * Name for this performance measurement.
     * @param {string} name
     */
    constructor(name) {
        // Register graceful shutdown handlers
        let context = this;
        let in_shutdown = false;
        [`exit`, `SIGINT`, `SIGUSR1`, `SIGUSR2`, `SIGTERM`].forEach((type) =>
            process.on(type, () => {
                // Mark the server as shutting down
                if (in_shutdown) return;
                in_shutdown = true;

                // Log the performance measurements
                console.log(name, JSON.stringify(context.measurements));

                // Set a timeout to exit the process after 1 second
                setTimeout(() => process.exit(0), 1000);
            })
        );
    }

    /**
     * Records the amount of time it took to execute a function.
     * Use `process.hrtime.bigint()` to get the start time.
     * @param {BigInt} start_time
     */
    record(start_time) {
        const delta = process.hrtime.bigint() - start_time;
        if (delta > 0) this.#data.push(delta);
    }

    /**
     * Returns the measurements of this performance measurement.
     */
    get measurements() {
        // Initialize the individual statistics
        let average = 0;
        let sum = BigInt(0);
        let min = BigInt(Number.MAX_SAFE_INTEGER);
        let max = BigInt(Number.MIN_SAFE_INTEGER);

        // Iterate over all of the measurements
        for (const measurement of this.#data) {
            // Do not consider measurements that are less than 0ns (invalid)
            if (measurement >= 0) {
                // Update the sum
                sum += BigInt(measurement);

                // Update the min and max
                if (measurement < min) min = measurement;
                if (measurement > max) max = measurement;
            }
        }

        // Calculate the average
        average = sum / BigInt(this.#data.length);

        // Return the statistics object
        return {
            min: min.toString(),
            max: max.toString(),
            sum: sum.toString(),
            count: this.#data.length.toString(),
            average: average.toString(),
        };
    }
}

module.exports = PerformanceMeasurement;
